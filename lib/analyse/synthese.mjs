// Deux analyses ponctuelles par le même fournisseur que les annonces (ligne 86), lancées à la demande et mises en cache :
// - profil : lecture d'un RH expérimenté sur le Profil (Coordonnées, Parcours, Compétences, diplômes obtenus), affichée sur l'accueil ;
// - veille : sujets de veille (mots-clés, zones, employeurs, mots exclus) tirés des candidatures, proposés dans l'Admin et jamais enregistrés sans validation.
// ANCHOR: mêmes garde-fous que l'analyse des annonces. Le modèle répond selon un schéma, le code vérifie : un point fort doit citer le Profil,
// une zone ou un employeur proposé doit venir des candidatures, une suggestion déjà présente dans les réglages n'est jamais proposée.
import { createHash } from 'node:crypto';
import { codePostalVille } from '../coordonnees.mjs';
import { ErreurSync } from '../erreurs.mjs';
import { CATEGORIES_OFFRE, EXCLUS_TOUJOURS, norm } from '../offres.mjs';
import { periodeFormation } from '../periode.mjs';
import { lireReglages } from '../reglages.mjs';
import { fournisseurActif } from './index.mjs';
import { anneesParCategorie } from '../parcours.mjs';
import { citee, compact } from './questions.mjs';

// NOTE: à incrémenter dès qu'une consigne ou un schéma de ce fichier change, le résultat en cache est alors signalé comme périmé
export const VERSION_SYNTHESE = 4;
export const CLES_SYNTHESE = ['profil', 'veille'];

const MAX_MESSAGE = 14000;
const MAX_CANDIDATURES = 80;
const MAX_PAR_CHAMP = 8;
const CHAMPS_VEILLE = ['mots_cles', 'zones', 'entreprises', 'mots_exclus'];
const STATUTS = { a_faire: 'à faire', en_cours: 'envoyée', entretien: 'entretien', sans_reponse: 'sans réponse', refuse: 'refusée', accepte: 'acceptée', ecarte: 'écartée' };

export function ouvrirSyntheses(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS syntheses (
    cle TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    hash TEXT NOT NULL,
    provider TEXT NOT NULL,
    modele TEXT NOT NULL,
    date TEXT NOT NULL,
    duree_ms INTEGER NOT NULL,
    resultat TEXT NOT NULL
  )`);
}

// NOTE: tables du parcours et du CV (schémas v7 et v8), vides sur une base qui ne les a pas encore
function lireTable(db, sql) {
  try {
    return db.prepare(sql).all();
  } catch {
    return [];
  }
}
const lireKv = (db, cle) => {
  try {
    const ligne = db.prepare('SELECT valeur FROM kv WHERE cle = ?').get(cle);
    return ligne ? JSON.parse(String(ligne.valeur)) : null;
  } catch {
    return null;
  }
};
const texte = (v, max = 300) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const liste = v => (Array.isArray(v) ? v : []);
// NOTE: le modèle préfixe souvent sa citation par l'intitulé de l'expérience (« Poste, dates : citation ») ou la coupe par « ... » :
// seuls les morceaux retrouvés dans la source sont gardés, et la preuve tient s'ils totalisent au moins MOTS_PREUVE mots
const MOTS_PREUVE = 5;
export function preuveRetrouvee(source, preuve) {
  const morceaux = preuve.split(/\s:\s|\.{3}|…|\n/).map(m => m.trim()).filter(m => citee(source, m));
  const mots = morceaux.reduce((n, m) => n + compact(m).split(' ').length, 0);
  return mots >= MOTS_PREUVE ? morceaux.join(' ... ') : '';
}

// NOTE: mot ou expression présent tel quel dans la source (mots entiers, casse et accents ignorés)
const present = (source, mot) => {
  const m = compact(mot);
  return m.length >= 2 && ` ${compact(source)} `.includes(` ${m} `);
};

// ANCHOR: profil synthétique (ligne 108). La source reprend le Profil, comme l'API le sert : Coordonnées (sans téléphone
// ni email, inutiles à la lecture), Parcours (accroche, résumé, expériences, années par métier), Compétences et diplômes obtenus.
const LIBELLES_CATEGORIE = { comptabilite: 'comptabilité', formateur_digital: 'formation digitale', web_design: 'web design', dev_web: 'développement web', autre: 'autre' };
const NIVEAUX_COMPETENCE = n => (n == null ? '' : `${n}/5`);

export function sourceProfil(db) {
  const profil = lireKv(db, 'profil') ?? {};
  const contact = profil.contact ?? {};
  const competences = lireTable(db, 'SELECT domaine, competence, enseigner, executer, note FROM competences ORDER BY ordre, id');
  const formations = lireTable(db, 'SELECT titre, type, etablissement, debut, fin, note FROM formations ORDER BY ordre, id');
  const experiences = lireTable(db, 'SELECT poste, employeur, lieu, type, categorie, debut, fin, description FROM experiences ORDER BY debut DESC, id');
  const parties = [];

  const coord = [['Nom', contact.nom], ['Titre affiché', contact.titre], ['Adresse', contact.adresse], ['Code postal et ville', codePostalVille(contact)], ['Site', contact.site], ['LinkedIn', contact.linkedin], ['GitHub', contact.github], ['Mention', contact.mention]]
    .filter(([, v]) => texte(v)).map(([k, v]) => `- ${k} : ${texte(v, 200)}`);
  if (coord.length) parties.push(`Coordonnées :\n${coord.join('\n')}`);

  const parcours = [];
  if (texte(profil.accroche)) parcours.push(`Accroche : ${texte(profil.accroche, 500)}`);
  if (texte(profil.resume)) parcours.push(`Résumé : ${texte(profil.resume, 1500)}`);
  const annees = Object.entries(anneesParCategorie(experiences)).sort((x, y) => y[1] - x[1]);
  if (annees.length) parcours.push(`Années d'expérience par métier (périodes qui se chevauchent comptées une fois) : ${annees.map(([k, n]) => `${LIBELLES_CATEGORIE[k] ?? k} ${String(n).replace('.', ',')} ans`).join(', ')}`);
  if (experiences.length) {
    parcours.push('Expériences, de la plus récente à la plus ancienne :\n' + experiences.map(e => `- ${e.poste}${e.employeur ? `, ${e.employeur}` : ''}${e.lieu ? ` (${e.lieu})` : ''}, ${e.debut || '?'} à ${e.fin || "aujourd'hui"}, ${e.type || 'autre'}${e.description ? ` : ${texte(e.description, 300)}` : ''}`).join('\n'));
  }
  if (parcours.length) parties.push(`Parcours :\n${parcours.join('\n')}`);

  if (competences.length) {
    const domaines = new Map();
    for (const c of competences) domaines.set(c.domaine || 'Autres', [...(domaines.get(c.domaine || 'Autres') ?? []), c]);
    parties.push('Compétences (niveau sur 5 pour exécuter et pour enseigner) :\n' + [...domaines].map(([d, l]) => `- ${d} : ${l.map(c => {
      const niveaux = [c.executer != null && `exécuter ${NIVEAUX_COMPETENCE(c.executer)}`, c.enseigner != null && `enseigner ${NIVEAUX_COMPETENCE(c.enseigner)}`].filter(Boolean).join(', ');
      return `${c.competence}${niveaux ? ` (${niveaux})` : ''}`;
    }).join(' ; ')}`).join('\n'));
  }

  // ANCHOR: seuls les diplômes et certifications du candidat sont envoyés (ligne 109). Les titre_pro sont des titres que l'utilisateur enseigne :
  // présentés au modèle, même signalés comme non détenus, ils devenaient des certifications du candidat
  const obtenus = formations.filter(f => f.type !== 'titre_pro');
  if (obtenus.length) {
    parties.push(`Diplômes et certifications obtenus par le candidat :\n${obtenus.map(f => `- ${f.titre}${f.etablissement ? `, ${f.etablissement}` : ''}${periodeFormation(f) ? ` (${periodeFormation(f)})` : ''}`).join('\n')}`);
  }
  return parties.join('\n\n').slice(0, MAX_MESSAGE);
}

const SENIORITES = ['debutant', 'confirme', 'senior', 'expert'];
export const SCHEMA_PROFIL = {
  type: 'object',
  additionalProperties: false,
  properties: {
    titre: { type: 'string' },
    correspond: { type: 'string' },
    seniorite: { type: 'string', enum: SENIORITES },
    synthese: { type: 'string' },
    points_forts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { point: { type: 'string' }, preuve: { type: 'string' } }, required: ['point', 'preuve'] } },
    points_attention: { type: 'array', items: { type: 'string' } },
    metiers: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { categorie: { type: 'string', enum: CATEGORIES_OFFRE }, intitule: { type: 'string' } }, required: ['categorie', 'intitule'] } },
    mots_cles: { type: 'array', items: { type: 'string' } },
  },
  required: ['titre', 'correspond', 'seniorite', 'synthese', 'points_forts', 'points_attention', 'metiers', 'mots_cles'],
};

export const CONSIGNE_PROFIL = `Tu es responsable des ressources humaines, avec vingt ans d'expérience du recrutement et de la lecture de profils. On te soumet le profil d'un candidat : Coordonnées, Parcours, Compétences, Diplômes et certifications obtenus. Tu en fais la lecture que tu ferais pour un comité de recrutement : franche, professionnelle, bienveillante. Réponse en JSON et en français.

Règles :
- N'invente rien : chaque information vient du profil fourni. Le candidat ne détient que les diplômes et certifications listés comme obtenus.
- titre : l'intitulé de profil que tu retiendrais, en quelques mots.
- correspond : deux ou trois phrases qui disent à quel type de profil cela correspond sur le marché (par exemple profil hybride, spécialiste, reconversion, généraliste) et pour quels types de structures il est fait.
- seniorite : debutant, confirme, senior ou expert, d'après les années d'expérience et les responsabilités.
- synthese : trois ou quatre phrases à la troisième personne sur le parcours, les métiers et ce qui distingue le candidat.
- points_forts : six au plus. point est une phrase courte. preuve recopie mot pour mot un passage du profil fourni qui le justifie, sans le reformuler.
- points_attention : quatre au plus, ce qu'un recruteur questionnerait en entretien (dispersion, période à expliquer, compétence attendue mais peu visible...), formulé de façon constructive. Aucun si rien ne s'impose. Ne jamais présenter comme un point faible l'ancienneté d'une compétence liée à l'IA générative (domaine trop récent pour que quiconque ait un long recul) : seule une compétence annoncée avant l'existence de l'outil serait à questionner.
- metiers : quatre au plus, du plus pertinent au moins pertinent. categorie parmi comptabilite, formateur_digital, web_design, dev_web, autre ; intitule est un intitulé de poste réaliste pour ce parcours.
- mots_cles : dix au plus, compétences, logiciels ou méthodes cités dans le profil, tels qu'ils y sont écrits.`;

export function validerProfilIa(brut, source) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) throw new ErreurSync('format', 'Réponse du modèle illisible (objet JSON attendu).');
  const points = liste(brut.points_forts).map(p => ({ point: texte(p?.point, 200), preuve: texte(p?.preuve, 300) })).filter(p => p.point);
  const vus = new Set();
  const metiers = liste(brut.metiers)
    .map(m => ({ categorie: CATEGORIES_OFFRE.includes(m?.categorie) ? m.categorie : 'autre', intitule: texte(m?.intitule, 80) }))
    .filter(m => m.intitule && !vus.has(norm(m.intitule)) && vus.add(norm(m.intitule)))
    .slice(0, 4);
  const motsVus = new Set();
  const motsCles = liste(brut.mots_cles).map(m => texte(m, 60)).filter(m => m && present(source, m) && !motsVus.has(norm(m)) && motsVus.add(norm(m))).slice(0, 10);
  // NOTE: un point fort dont la preuve est introuvable dans la source est écarté, seul leur nombre est gardé pour l'affichage
  const verifies = points.map(p => ({ ...p, preuve: preuveRetrouvee(source, p.preuve) })).filter(p => p.preuve).slice(0, 6);
  return {
    titre: texte(brut.titre, 120),
    correspond: texte(brut.correspond, 800),
    seniorite: SENIORITES.includes(brut.seniorite) ? brut.seniorite : '',
    synthese: texte(brut.synthese, 1200),
    points_attention: liste(brut.points_attention).map(x => texte(x, 250)).filter(Boolean).slice(0, 4),
    points_forts: verifies,
    points_ecartes: points.length - verifies.length,
    metiers,
    mots_cles: motsCles,
  };
}

// ANCHOR: sujets de veille. Le modèle lit les candidatures (poste, employeur, statut, intérêt, plateforme, lieu de l'offre liée) et les réglages actuels.
export function donneesVeille(db) {
  const candidatures = db.prepare(`SELECT c.poste, c.entreprise, c.statut, c.interet, c.plateforme, o.categorie, o.departement, o.ville, o.titre
    FROM candidatures c LEFT JOIN offres o ON o.id_offre = c.offre_id
    ORDER BY c.date DESC, c.rowid DESC LIMIT ?`).all(MAX_CANDIDATURES);
  return { candidatures, reglages: lireReglages(db).reglages };
}

export function messageVeille({ candidatures, reglages }) {
  const r = k => (reglages[k]?.length ? reglages[k].join(', ') : 'aucun');
  const lignes = candidatures.map(c => [
    c.poste || c.titre || 'poste non précisé',
    c.entreprise || 'employeur non précisé',
    STATUTS[c.statut] ?? c.statut ?? '',
    c.interet ? `intérêt ${c.interet}` : '',
    c.plateforme ? `via ${c.plateforme}` : '',
    c.categorie ? `catégorie ${c.categorie}` : '',
    c.departement ? `département ${c.departement}${c.ville ? ` (${c.ville})` : ''}` : '',
  ].filter(Boolean).join(' | '));
  return `Réglages actuels de la recherche :
- Mots-clés : ${r('mots_cles')}
- Zones (départements) : ${r('zones')}
- Mots exclus de l'intitulé : ${r('mots_exclus')}
- Employeurs surveillés : ${r('entreprises')}

Candidatures (${candidatures.length}, les plus récentes d'abord) :
${lignes.map(l => `- ${l}`).join('\n')}`.slice(0, MAX_MESSAGE);
}

const SUGGESTION = { type: 'object', additionalProperties: false, properties: { valeur: { type: 'string' }, raison: { type: 'string' } }, required: ['valeur', 'raison'] };
const SCHEMA_VEILLE = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(CHAMPS_VEILLE.map(k => [k, { type: 'array', items: SUGGESTION }])),
  required: CHAMPS_VEILLE,
};

const CONSIGNE_VEILLE = `Tu aides une personne à régler sa veille d'offres d'emploi. Tu lis ses candidatures et ses réglages actuels, et tu proposes des ajouts, en JSON et en français.

Règles :
- Ne propose rien qui figure déjà dans les réglages actuels. Huit propositions au plus par liste, aucune si rien ne se justifie.
- mots_cles : intitulés de poste ou métiers courts (un à quatre mots) qui ressortent des candidatures, surtout celles envoyées, en entretien ou d'intérêt fort.
- zones : codes de département (83, 13, 2A...) où se trouvent des candidatures.
- entreprises : employeurs des candidatures dont il vaut la peine de suivre les prochaines offres (entretien, intérêt fort ou important), écrits comme dans les candidatures.
- mots_exclus : mots de l'intitulé des candidatures écartées ou refusées qui signalent des postes hors cible. Jamais un type de contrat (CDI, CDD, intérim, freelance) ni un temps de travail. Sois prudent : un mot exclu fait disparaître des offres.
- raison : une phrase courte qui s'appuie sur les candidatures.`;

// Contrôle les propositions : formats des réglages, zones et employeurs présents dans les candidatures, doublons et contradictions retirés
export function validerVeille(brut, { candidatures, reglages }) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) throw new ErreurSync('format', 'Réponse du modèle illisible (objet JSON attendu).');
  const departements = new Set(candidatures.map(c => String(c.departement ?? '').toUpperCase()).filter(Boolean));
  const employeurs = new Map(candidatures.filter(c => c.entreprise).map(c => [norm(c.entreprise).trim(), c.entreprise.trim()]));
  const mots = n => s => s.split(' ').length <= n;
  // ANCHOR: un mot-clé est fait de mots tirés des intitulés des candidatures ; un mot exclu figure dans l'intitulé d'une candidature
  // refusée ou écartée et dans aucune autre (sinon il ferait disparaître les offres que l'utilisateur cherche)
  const intitules = statuts => candidatures.filter(c => !statuts || statuts.includes(c.statut)).map(c => `${c.poste ?? ''} ${c.titre ?? ''}`).join('\n');
  const tous = intitules(null);
  const ecartes = intitules(['refuse', 'ecarte']);
  const autres = intitules(Object.keys(STATUTS).filter(k => !['refuse', 'ecarte'].includes(k)));
  const significatifs = v => compact(v).split(' ').filter(m => m.length >= 4);
  const regles = {
    mots_cles: v => (mots(5)(v) && significatifs(v).length && significatifs(v).every(m => present(tous, m)) ? v : null),
    zones: v => {
      const z = v.toUpperCase();
      return /^(\d{2,3}|2[AB])$/.test(z) && departements.has(z) ? z : null;
    },
    entreprises: v => employeurs.get(norm(v).trim()) ?? null,
    mots_exclus: v => (mots(3)(v) && !EXCLUS_TOUJOURS.includes(norm(v)) && present(ecartes, v) && !present(autres, v) ? v : null),
  };
  const sortie = {};
  for (const k of CHAMPS_VEILLE) {
    const vus = new Set();
    sortie[k] = liste(brut[k])
      .map(s => ({ valeur: regles[k](texte(s?.valeur, 100)), raison: texte(s?.raison, 200) }))
      .filter(s => s.valeur && s.valeur.length >= 2 && !vus.has(norm(s.valeur)) && vus.add(norm(s.valeur)))
      .slice(0, MAX_PAR_CHAMP);
  }
  // NOTE: un mot exclu qui recouvre un mot-clé (actuel ou proposé) retirerait les offres cherchées
  const cles = [...reglages.mots_cles, ...sortie.mots_cles.map(s => s.valeur)].map(norm);
  sortie.mots_exclus = sortie.mots_exclus.filter(s => !cles.some(c => c.includes(norm(s.valeur))));
  return sortie;
}

// Retire à la lecture ce qui est entré dans les réglages depuis l'analyse (ajouté depuis l'Admin ou à la main)
export function filtrerVeille(resultat, reglages) {
  const sortie = {};
  for (const k of CHAMPS_VEILLE) {
    const pris = new Set((reglages[k] ?? []).map(v => norm(v)));
    sortie[k] = liste(resultat?.[k]).filter(s => !pris.has(norm(s.valeur)));
  }
  return sortie;
}

// ANCHOR: description de chaque analyse : données lues, message envoyé, schéma, contrôle de la réponse
const ANALYSES = {
  profil: {
    preparer(db) {
      const source = sourceProfil(db);
      if (!source.trim()) throw new ErreurSync('config', 'Rien à analyser : renseignez le Profil (Coordonnées, Parcours, Compétences, diplômes).');
      return { consigne: CONSIGNE_PROFIL, message: source, empreinte: source, schema: SCHEMA_PROFIL, valider: brut => validerProfilIa(brut, source) };
    },
  },
  veille: {
    preparer(db) {
      const donnees = donneesVeille(db);
      if (!donnees.candidatures.length) throw new ErreurSync('config', 'Aucune candidature à analyser pour proposer des sujets de veille.');
      // NOTE: l'empreinte ne suit que les candidatures : accepter des propositions modifie les réglages sans rendre le résultat périmé
      return { consigne: CONSIGNE_VEILLE, message: messageVeille(donnees), empreinte: JSON.stringify(donnees.candidatures), schema: SCHEMA_VEILLE, valider: brut => validerVeille(brut, donnees) };
    },
  },
};

const empreinte = ({ consigne, empreinte: source }) => createHash('sha1').update(`${VERSION_SYNTHESE}\n${consigne}\n${source}`).digest('hex');

// ANCHOR: un verrou par analyse, comme lancerAnalyse : un second appel pendant un passage reçoit la même promesse
/** @type {Record<string, { enCours: boolean, dernier: any }>} */
export const etatSyntheses = Object.fromEntries(CLES_SYNTHESE.map(k => [k, { enCours: false, dernier: null }]));
/** @type {Record<string, Promise<any> | null>} */
const enVol = {};

async function produire(db, cle, fournisseur) {
  const a = ANALYSES[cle].preparer(db);
  await fournisseur.preparer();
  const debut = Date.now();
  const resultat = a.valider(await fournisseur.repondre({ consigne: a.consigne, message: a.message, schema: a.schema }));
  const duree = Date.now() - debut;
  db.prepare(`INSERT INTO syntheses (cle, version, hash, provider, modele, date, duree_ms, resultat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cle) DO UPDATE SET version = excluded.version, hash = excluded.hash, provider = excluded.provider, modele = excluded.modele,
      date = excluded.date, duree_ms = excluded.duree_ms, resultat = excluded.resultat`)
    .run(cle, VERSION_SYNTHESE, empreinte(a), fournisseur.id, fournisseur.modele, new Date().toISOString(), duree, JSON.stringify(resultat));
  return { duree_ms: duree };
}

// Lance une analyse en arrière-plan. Résout toujours (l'échec est dans etatSyntheses[cle].dernier).
export function lancerSynthese(db, cle, /** @type {{ fournisseur?: any }} */ { fournisseur } = {}) {
  if (!ANALYSES[cle]) throw new Error(`Analyse inconnue : ${cle}`);
  if (enVol[cle]) return enVol[cle];
  const etat = etatSyntheses[cle];
  let f;
  try {
    f = fournisseur ?? fournisseurActif();
    if (!f) throw new ErreurSync('config', 'Analyse désactivée : renseigner ANALYSE_PROVIDER dans le .env.');
  } catch (e) {
    etat.dernier = { ok: false, date: new Date().toISOString(), code: e.code ?? 'interne', erreur: e.message };
    return Promise.resolve(etat.dernier);
  }
  etat.enCours = true;
  enVol[cle] = produire(db, cle, f)
    .then(r => (etat.dernier = { ok: true, date: new Date().toISOString(), provider: f.id, modele: f.modele, ...r }))
    .catch(e => (etat.dernier = { ok: false, date: new Date().toISOString(), provider: f.id, modele: f.modele, code: e instanceof ErreurSync ? e.code : 'interne', erreur: e.message }))
    .finally(() => {
      etat.enCours = false;
      enVol[cle] = null;
    });
  return enVol[cle];
}

// Résultat en cache d'une analyse, avec a_jour = false si les données ou la consigne ont changé depuis
function lireSynthese(db, cle) {
  const ligne = db.prepare('SELECT * FROM syntheses WHERE cle = ?').get(cle);
  const etat = etatSyntheses[cle];
  const base = { enCours: etat.enCours, erreur: etat.dernier && !etat.dernier.ok ? etat.dernier.erreur : null };
  if (!ligne) return { ...base, resultat: null };
  /** @type {any} */
  let resultat = null;
  try {
    resultat = JSON.parse(String(ligne.resultat));
  } catch { /* cache abîmé : traité comme absent */ }
  let hash = '';
  try {
    hash = empreinte(ANALYSES[cle].preparer(db));
  } catch { /* plus rien à analyser : le résultat en cache reste affiché, signalé périmé */ }
  if (cle === 'veille' && resultat) resultat = filtrerVeille(resultat, lireReglages(db).reglages);
  return { ...base, resultat, date: ligne.date, modele: ligne.modele, provider: ligne.provider, duree_ms: ligne.duree_ms, a_jour: ligne.version === VERSION_SYNTHESE && ligne.hash === hash };
}

// Résumé pour l'API : configuration du fournisseur (sans clé) et état des deux analyses
export function resumeSyntheses(db, env = process.env) {
  let config;
  try {
    const f = fournisseurActif(env);
    config = f ? { actif: true, provider: f.id, nom: f.nom, modele: f.modele } : { actif: false };
  } catch (e) {
    config = { actif: false, erreur: e.message };
  }
  return { ...config, version: VERSION_SYNTHESE, ...Object.fromEntries(CLES_SYNTHESE.map(k => [k, lireSynthese(db, k)])) };
}
