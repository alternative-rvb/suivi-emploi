// Compétences demandées par une annonce, repérées par le modèle local à l'ouverture de l'offre (comme les mots clés surlignés d'un site d'emploi).
// ANCHOR: le modèle ne fait qu'extraire des termes cités dans l'annonce. Le rapprochement avec le Profil (au Profil, proche, absente) est calculé
// par le code à la lecture, contre les compétences du moment, et ne propose jamais de niveau : l'utilisateur tranche.
import { createHash } from 'node:crypto';
import { ErreurSync } from '../erreurs.mjs';
import { norm, signature, termesCompetences } from '../correspondance.mjs';
import { fournisseurActif } from './index.mjs';
import { citee, construireMessage } from './questions.mjs';

// NOTE: à incrémenter dès que SCHEMA_COMPETENCES ou la consigne change, les extractions d'une version plus ancienne sont refaites
export const VERSION_COMPETENCES = 3;
const LONGUEUR_MIN = 300;
const MAX_ITEMS = 12;

// NOTE: le domaine est choisi par le modèle parmi les domaines du Profil, pour qu'un clic sur ✓ suffise à ranger la compétence
export const schemaCompetences = domaines => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    competences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { valeur: { type: 'string' }, citation: { type: 'string' }, domaine: { type: 'string', enum: domaines } },
        required: ['valeur', 'citation', 'domaine'],
      },
    },
  },
  required: ['competences'],
});

export const consigneCompetences = domaines => `Tu lis une annonce d'emploi et tu relèves, en JSON, les compétences techniques que le poste demande : logiciels, outils, technologies, méthodes et savoir-faire concrets du métier.

Règles :
- N'invente rien et ne déduis rien : seules comptent les compétences que l'annonce nomme.
- valeur : le nom court d'UNE seule compétence (1 à 4 mots, jamais deux compétences réunies par « / », « , » ou « + » : un élément par compétence), par exemple "Sage", "Rapprochement bancaire", "React", "Animation de formation".
- citation : le passage de l'annonce, recopié mot pour mot, qui la mentionne.
- domaine : le domaine le plus proche parmi ${domaines.join(', ')}.
- Exclus les qualités personnelles (rigueur, autonomie, curiosité, sens du relationnel, travail en équipe, organisation), les avantages (tickets restaurant, primes), les diplômes, les durées d'expérience et les formules vagues ("connaissances comptables", "logiciels métiers").
- ${MAX_ITEMS} compétences au plus, les plus importantes d'abord.`;

// NOTE: filet de sécurité si le modèle laisse passer une qualité personnelle ou une formule vague
const MOU = /\b(rigueur|rigoureux|autonomie|autonome|curiosite|relationnel|relation client|sens du|travail en equipe|organisation|esprit|motivation|dynamisme|adaptabilite|reactivite|connaissances?|notions?|logiciels? metiers?|experience|amelioration continue|nouvelles technologies)\b/;

const empreinte = o => createHash('sha1').update(`${o.titre}\n${o.annonce}`).digest('hex');
const texte = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Contrôle la réponse du modèle : une compétence dont la citation ne figure pas dans l'annonce est écartée, les doublons aussi
export function validerCompetences(brut, annonce, domaines = []) {
  if (!brut || typeof brut !== 'object' || !Array.isArray(brut.competences)) throw new ErreurSync('format', 'Réponse du modèle illisible (liste de compétences attendue).');
  const vues = new Set();
  const items = [];
  for (const x of brut.competences) {
    const valeur = texte(x?.valeur, 60);
    const citation = texte(x?.citation, 300);
    const cle = signature(valeur);
    if (!valeur || vues.has(cle) || MOU.test(norm(valeur)) || !citee(annonce, citation)) continue;
    vues.add(cle);
    items.push({ valeur, citation, domaine: domaines.includes(x?.domaine) ? x.domaine : domaines[0] ?? '' });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

// NOTE: pluriel retiré pour que « rapprochement bancaire » retrouve « rapprochements bancaires »
const mots = s => norm(s).replace(/[^a-z0-9#.+]+/g, ' ').split(' ').filter(m => m.length >= 5).map(m => m.replace(/s$/, ''));
// NOTE: mots trop courants pour dire que deux compétences sont proches (un « suivi » n'est pas un « Jira »)
const BANAL = new Set(['gestion', 'suivi', 'logiciel', 'comptable', 'comptabilite', 'projet', 'client', 'equipe', 'outil', 'donnee', 'analyse', 'accompagnement', 'conseil', 'travail', 'methode', 'digital', 'general', 'administratif', 'administrative', 'processus', 'controle', 'facturation', 'preparation']);
const distinctifs = s => mots(s).filter(m => !BANAL.has(m));

// NOTE: « HTML / CSS » est deux compétences : éclaté à la lecture (les anciennes extractions en cache en profitent), doublons écartés après éclatement
const SEPARATEURS = /\s*(?:\/|,|;|\+|&)\s*/;
export function eclater(items) {
  const vues = new Set();
  const sortie = [];
  for (const it of items) {
    // NOTE: « CI/CD », « UI/UX », « TCP/IP » ou « R&D » sont un seul terme : pas d'éclatement dès qu'un morceau fait moins de 3 caractères
    const decoupe = it.valeur.split(SEPARATEURS).map(x => x.trim()).filter(Boolean);
    const parties = decoupe.some(x => x.length < 3) ? [] : decoupe;
    for (const valeur of parties.length ? parties : [it.valeur]) {
      const cle = signature(valeur);
      if (vues.has(cle)) continue;
      vues.add(cle);
      sortie.push({ ...it, valeur });
    }
  }
  return sortie;
}

/**
 * Place de chaque compétence relevée par rapport au Profil : profil (un intitulé du Profil la couvre), proche (mot distinctif en commun), absente
 * @param {{ valeur: string, citation: string, domaine?: string }[]} items
 * @param {any[]} competences compétences du Profil
 * @param {string[]} ignorees valeurs déjà écartées par l'utilisateur (norm)
 */
export function rapprocher(items, competences, ignorees = []) {
  const termes = termesCompetences(competences, 0);
  const ecartees = new Set(ignorees.map(signature));
  return eclater(items).map(({ valeur, citation, domaine = '' }) => {
    const n = norm(valeur).replace(/[^a-z0-9#.+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
    // NOTE: « CI/CD » est couvert par « CI/CD GitHub Actions » : l'intitulé du Profil contient celui de l'annonce, mot pour mot (au moins deux mots, un « Budget » seul n'est pas « Budget de production »)
    const sig = signature(valeur);
    const contenu = t => sig.split(' ').length >= 2 && sig.length >= 4 && ` ${signature(t.competence)} `.includes(` ${sig} `);
    const exacte = termes.find(t => t.motifs.some(m => m.test(n)) || sig === signature(t.competence) || contenu(t));
    if (exacte) return { valeur, citation, domaine, statut: 'profil', competence_id: exacte.id, competence: exacte.competence };
    if (ecartees.has(signature(valeur))) return { valeur, citation, domaine, statut: 'ignoree' };
    const m = new Set(distinctifs(valeur));
    const proche = competences.find(c => distinctifs(c.competence).some(x => m.has(x)));
    if (proche) return { valeur, citation, domaine, statut: 'proche', competence_id: proche.id, competence: proche.competence };
    return { valeur, citation, domaine, statut: 'absente' };
  });
}

/** Extraction en cache d'une offre : { items, a_jour, date } ou null */
export function lireCompetencesOffre(db, idOffre) {
  const ligne = db.prepare('SELECT * FROM offre_competences WHERE id_offre = ?').get(idOffre);
  if (!ligne) return null;
  try {
    return { items: JSON.parse(ligne.items), version: ligne.version, date: ligne.date, modele: ligne.modele };
  } catch {
    return null;
  }
}

// ANCHOR: états et verrou par offre : une extraction à la fois par offre, les appels concurrents reçoivent la même promesse
/** @type {Map<string, Promise<any>>} */
const enVol = new Map();
/** @type {Map<string, { ok: boolean, code?: string, erreur?: string }>} */
export const dernierEchec = new Map();

export const extractionEnCours = idOffre => enVol.has(idOffre);

// ANCHOR: file d'attente à une extraction à la fois (le modèle local ne traite pas bien plusieurs annonces de front). Dernier demandé, premier servi :
// l'offre que l'utilisateur regarde passe devant celles qu'il a quittées en zappant, et une offre déjà en attente qu'il rouvre remonte en tête.
const MAX_PARALLELE = 1;
/** @type {{ idOffre: string, demarrer: () => void }[]} */
const attente = [];
let enCours = 0;

function pomper() {
  while (enCours < MAX_PARALLELE && attente.length) {
    enCours++;
    attente.shift()?.demarrer();
  }
}

function remonter(idOffre) {
  const i = attente.findIndex(x => x.idOffre === idOffre);
  if (i > 0) attente.unshift(...attente.splice(i, 1));
}

/** @param {string} idOffre @param {() => Promise<any>} travail */
export function enFile(idOffre, travail) {
  return new Promise((resoudre, rejeter) => {
    attente.unshift({
      idOffre,
      demarrer: () => travail().then(resoudre, rejeter).finally(() => { enCours--; pomper(); }),
    });
    pomper();
  });
}

function enregistrer(db, o, fournisseur, items, duree) {
  const cand = db.prepare('SELECT id FROM candidatures WHERE offre_id = ?').get(o.id_offre);
  db.prepare(`INSERT INTO offre_competences (id_offre, candidature_id, version, hash, provider, modele, date, duree_ms, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id_offre) DO UPDATE SET candidature_id = excluded.candidature_id, version = excluded.version, hash = excluded.hash, provider = excluded.provider,
      modele = excluded.modele, date = excluded.date, duree_ms = excluded.duree_ms, items = excluded.items`)
    .run(o.id_offre, cand?.id ?? null, VERSION_COMPETENCES, empreinte(o), fournisseur.id, fournisseur.modele, new Date().toISOString(), duree, JSON.stringify(items));
}

/** Rattache une extraction existante à la candidature créée pour son offre, pour qu'elle survive à la purge de l'offre */
export function rattacherCandidature(db, idOffre, idCandidature) {
  db.prepare('UPDATE offre_competences SET candidature_id = ? WHERE id_offre = ?').run(idCandidature, idOffre);
}

/** Offres purgées sans candidature : leurs extractions ne servent plus */
export function purgerCompetencesOrphelines(db) {
  db.prepare('DELETE FROM offre_competences WHERE candidature_id IS NULL AND id_offre NOT IN (SELECT id_offre FROM offres)').run();
}

/**
 * Lance l'extraction d'une offre en arrière-plan, sauf si elle est à jour. Résout toujours (l'échec est dans dernierEchec).
 * @param {any} db
 * @param {string} idOffre
 * @param {{ fournisseur?: any, refaire?: boolean }} [options]
 */
export function lancerExtraction(db, idOffre, { fournisseur, refaire = false } = {}) {
  if (enVol.has(idOffre)) {
    remonter(idOffre);
    return enVol.get(idOffre);
  }
  const o = db.prepare('SELECT id_offre, titre, entreprise, lieu, contrat, annonce FROM offres WHERE id_offre = ?').get(idOffre);
  if (!o) return Promise.resolve(null);
  if (String(o.annonce ?? '').length < LONGUEUR_MIN) {
    dernierEchec.set(idOffre, { ok: false, code: 'courte', erreur: 'Annonce trop courte pour relever des compétences.' });
    return Promise.resolve(null);
  }
  const existante = db.prepare('SELECT version, hash FROM offre_competences WHERE id_offre = ?').get(idOffre);
  if (!refaire && existante && existante.version === VERSION_COMPETENCES && existante.hash === empreinte(o)) return Promise.resolve(null);
  let f;
  try {
    f = fournisseur ?? fournisseurActif();
    if (!f) throw new ErreurSync('config', 'Analyse désactivée : renseigner ANALYSE_PROVIDER dans le .env.');
  } catch (e) {
    dernierEchec.set(idOffre, { ok: false, code: e.code ?? 'interne', erreur: e.message });
    return Promise.resolve(null);
  }
  dernierEchec.delete(idOffre);
  const promesse = enFile(idOffre, async () => {
    const t0 = Date.now();
    await f.preparer();
    const domaines = db.prepare('SELECT domaine FROM competences GROUP BY domaine ORDER BY MIN(ordre)').all().map(r => r.domaine);
    if (!domaines.length) throw new ErreurSync('config', 'Aucune compétence au Profil : ajouter des domaines avant de relever celles des annonces.');
    const brut = await f.repondre({ consigne: consigneCompetences(domaines), message: construireMessage(o), schema: schemaCompetences(domaines) });
    enregistrer(db, o, f, validerCompetences(brut, o.annonce, domaines), Date.now() - t0);
    return true;
  })
    .catch(e => {
      dernierEchec.set(idOffre, { ok: false, code: e instanceof ErreurSync ? e.code : 'interne', erreur: e.message });
      return null;
    })
    .finally(() => enVol.delete(idOffre));
  enVol.set(idOffre, promesse);
  return promesse;
}
