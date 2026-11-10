// ANCHOR: lettre de motivation : matrice de rédaction, document exporté et contrôle (faits contre le CV de référence, le Profil et l'annonce, puis règles de méthode).
// Pur et sans dépendance Node : utilisé par server.mjs, lib/analyse/lettre.mjs, l'interface et les tests.
import { codePostalVille } from './coordonnees.mjs';
import { CHAMPS_CONTACT, controlerTexte } from './cv.mjs';
import { norm } from './correspondance.mjs';

// NOTE: ordre de la lettre (plan Vous / Moi / Nous) ; le point faible n'est jamais ni le premier ni le dernier paragraphe
export const BLOCS_LETTRE = ['vous', 'moi', 'faible', 'nous', 'conclusion'];
export const LIBELLES_BLOC = { vous: 'Vous : votre besoin', moi: 'Moi : mes preuves', faible: 'Point faible assumé', nous: 'Nous : ce que nous ferons ensemble', conclusion: 'Conclusion' };
export const TONS_LETTRE = ['sobre', 'chaleureux', 'dynamique'];
export const MOTS_MIN = 150;
export const MOTS_MAX = 450;
// ANCHOR: limites de caractères des champs de lettre par plateforme, indicatives (affichées dans le contrôle de la lettre)
// NOTE: à compléter au fil des candidatures, uniquement avec des limites constatées ; France Travail coupe net à 1500 (offre 215CDHH)
export const LIMITES_PLATEFORME = [{ nom: 'France Travail (formulaire)', max: 1500 }];
export const ORIGINES_LETTRE = ['qwen', 'utilisateur', 'claude'];
export class ErreurLettre extends Error {}

export const MATRICE_DEFAUT = Object.freeze({
  ton: 'sobre', mots: 250, competences: [],
  blocs: { vous: { actif: true, consigne: '' }, moi: { actif: true, consigne: '' }, faible: { actif: false, consigne: '' }, nous: { actif: true, consigne: '' }, conclusion: { actif: true, consigne: '' } },
});

/** Matrice nettoyée : valeurs inconnues ramenées au défaut, consignes bornées, au plus 14 compétences @param {any} m */
export function validerMatrice(m) {
  const d = MATRICE_DEFAUT;
  const x = m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  const mots = Math.round(Number(x.mots));
  return {
    ton: TONS_LETTRE.includes(x.ton) ? x.ton : d.ton,
    mots: Number.isFinite(mots) ? Math.min(MOTS_MAX, Math.max(MOTS_MIN, mots)) : d.mots,
    competences: Array.isArray(x.competences) ? [...new Set(x.competences.filter(id => typeof id === 'string').map(id => id.slice(0, 100)))].slice(0, 14) : [],
    blocs: Object.fromEntries(BLOCS_LETTRE.map(b => {
      const v = x.blocs?.[b];
      return [b, { actif: typeof v?.actif === 'boolean' ? v.actif : d.blocs[b].actif, consigne: typeof v?.consigne === 'string' ? v.consigne.trim().slice(0, 500) : '' }];
    })),
  };
}

// ANCHOR: bibliothèque de style (kv lettre_style) : angles d'accroche par métier et formules à éviter, lus par le modèle local, par Claude et par le contrôle
export const METIERS_LETTRE = /** @type {const} */ (['formateur_digital', 'web_design', 'dev_web', 'comptabilite']);
export const LIBELLES_METIER = { formateur_digital: 'Formateur digital', web_design: 'Web design', dev_web: 'Développement web', comptabilite: 'Comptabilité' };
// NOTE: les formes d'exemple s'imitent dans l'esprit, jamais mot pour mot ; elles ne contiennent aucun fait propre à une candidature
const ANGLES_DEFAUT = [
  ['defi', 'Le défi du poste', "Part du défi central de l'annonce. Forme : « Rendre un outil simple pour des équipes qui ne sont pas techniciennes, c'est le défi que je retrouve dans votre annonce. »"],
  ['preuve', "La preuve d'abord", "Ouvre sur une réalisation livrée qui répond au besoin. Forme : « J'ai livré une application utilisée chaque jour par ses utilisateurs, et c'est ce suivi de l'usage que vous demandez. »"],
  ['contexte', "Le contexte de l'entreprise", "Part d'un projet ou d'un contexte précis de l'entreprise cité par l'annonce. Forme : « Votre refonte du site en parallèle de l'outil interne touche aux deux métiers que j'exerce déjà. »"],
  ['methode', 'Le point commun de méthode', "Part d'une façon de travailler partagée. Forme : « Écouter l'utilisateur avant de coder, puis ajuster, c'est ma façon de travailler depuis plusieurs années. »"],
  ['lien', 'Le lien direct', "Relie deux éléments de l'annonce à une double casquette du candidat. Forme : « Votre annonce parle de former autant que de développer : j'ai les deux casquettes. »"],
  ['idee', 'Une idée sur le métier', "Ouvre sur une conviction de métier, courte et concrète, que l'annonce confirme. Forme : « Une marque se reconnaît à la cohérence de ses visuels, pas à la beauté de chacun. »"],
  ['projet', 'Un projet vérifiable', "Ouvre sur un projet réel du Profil, en ligne ou montrable, proche de l'annonce. Un lien GitHub n'est cité que pour un dépôt que le candidat a lui-même rendu public (Suivi Emploi), et seulement quand l'annonce demande un dépôt ou du code à montrer. Pour tout autre projet, la démo en ligne suffit, jamais de dépôt privé présenté comme consultable."],
  ['rencontre', 'La rencontre de deux compétences', "Montre que deux compétences demandées se combinent chez le candidat. Forme : « Concevoir l'interface puis l'intégrer moi-même évite les allers-retours que votre équipe cherche à réduire. »"],
  ['raison', "La raison d'aller vers l'entreprise", "Dit en une phrase pourquoi cette entreprise, à partir d'un fait de l'annonce ou de son activité, jamais d'un compliment générique."],
].map(([id, nom, consigne]) => ({ id, nom, consigne, metiers: [] }));
// NOTE: motifs d'écriture automatique relevés dans humanizer-fr (connecteurs en surnombre, formules vides, calques) et formules d'ouverture et de clôture déjà envoyées ; les CLICHES et HUMILITE du code s'y ajoutent sans figurer dans cette liste
const EVITER_DEFAUT = ['il est important de souligner', 'force est de constater', 'dans un monde en constante evolution', 'a l\'heure ou', 'mettre en lumiere', 's\'inscrit dans une demarche', 'veritable atout', 'plus que jamais', 'je tiens a souligner', 'au coeur de', 'si mon parcours vous parle'];
export const STYLE_DEFAUT = Object.freeze({ angles: ANGLES_DEFAUT, eviter: EVITER_DEFAUT });

/** Style nettoyé : angles bornés (20, nom 60, consigne 400, métiers connus), formules à éviter sans doublon (60, 80 caractères) ; vide ou invalide = défaut @param {any} s */
export function validerStyle(s) {
  const x = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  const vus = new Set();
  const angles = (Array.isArray(x.angles) ? x.angles : []).flatMap(a => {
    if (!a || typeof a !== 'object') return [];
    const nom = typeof a.nom === 'string' ? a.nom.trim().slice(0, 60) : '';
    const consigne = typeof a.consigne === 'string' ? a.consigne.trim().slice(0, 400) : '';
    const id = (typeof a.id === 'string' && a.id.trim() ? a.id.trim() : norm(nom).replace(/[^a-z0-9]+/g, '-')).slice(0, 40);
    if (!nom || !consigne || !id || vus.has(id)) return [];
    vus.add(id);
    return [{ id, nom, consigne, metiers: Array.isArray(a.metiers) ? [...new Set(a.metiers.filter(m => METIERS_LETTRE.includes(m)))] : [] }];
  }).slice(0, 20);
  const formules = Array.isArray(x.eviter) ? [...new Set(x.eviter.filter(f => typeof f === 'string').map(f => norm(f).replace(/’/g, '\'').replace(/\s+/g, ' ').trim().slice(0, 80)).filter(f => f.length >= 4))].slice(0, 60) : null;
  return { angles: angles.length ? angles : ANGLES_DEFAUT.map(a => ({ ...a })), eviter: formules ?? [...EVITER_DEFAUT] };
}

/** Angles valables pour un métier (sans métier précisé = tous) @param {ReturnType<typeof validerStyle>} style @param {string} [metier] */
export const anglesDuMetier = (style, metier = '') => style.angles.filter(a => !a.metiers.length || a.metiers.includes(/** @type {any} */ (metier)));

const chaine = (v, champ, max) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new ErreurLettre(`${champ} doit être une chaîne.`);
  if (v.length > max) throw new ErreurLettre(`${champ} dépasse ${max} caractères.`);
  return v;
};

/** Lignes de l'entête d'une lettre française (expéditeur en noir, une par ligne), partagées par l'aperçu, le PDF et le Word @param {Record<string, any>} [entete] @returns {string[]} */
export function lignesEntete(entete = {}) {
  return [entete?.nom, entete?.adresse, codePostalVille(entete), entete?.telephone, entete?.email].map(v => String(v ?? '').trim()).filter(Boolean);
}

/** Document de lettre reçu de l'interface ou de Claude, validé pour l'export @param {any} d */
export function validerLettre(d) {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new ErreurLettre('lettre : objet attendu { entete, destinataire, lieu_date, objet, texte }.');
  const entete = Object.fromEntries(CHAMPS_CONTACT.map(k => [k, chaine(d.entete?.[k], `entete.${k}`, 200).trim()]));
  if (!entete.nom) throw new ErreurLettre('Nom absent : renseignez le contact dans Profil > Coordonnées avant l\'export.');
  const texte = chaine(d.texte, 'texte', 8000).trim();
  if (!texte) throw new ErreurLettre('Lettre vide : rédigez ou collez le texte avant l\'export.');
  return {
    entete, texte,
    destinataire: chaine(d.destinataire, 'destinataire', 600).trim(), lieu_date: chaine(d.lieu_date, 'lieu_date', 120).trim(), objet: chaine(d.objet, 'objet', 300).trim(),
    offre_id: chaine(d.offre_id, 'offre_id', 100), signature: d.signature !== false,
  };
}

export const paragraphesDe = texte => String(texte ?? '').split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
export const compterMots = texte => (String(texte ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/** Texte brut complet (formulaires en ligne, Word) : entête, objet, corps @param {ReturnType<typeof validerLettre>} doc */
export function texteLettre(doc, { avecEntete = true } = {}) {
  const e = doc.entete;
  // NOTE: sans entête (copie et .txt pour un formulaire) : corps et signature seulement, le formulaire a déjà son champ objet
  const haut = avecEntete ? [lignesEntete(e).join('\n'), doc.destinataire, doc.lieu_date, doc.objet && `Objet : ${doc.objet}`] : [];
  return [...haut, ...paragraphesDe(doc.texte), e.nom].filter(Boolean).join('\n\n');
}

/** Nom de fichier proposé : LM_<Prénom-Nom>_<entreprise>_<poste>_<AAAA-MM> (le recruteur le voit : jamais de mot « générique ») @param {{ nom?: string, entreprise?: string, poste?: string }} cible */
export function nomLettre({ nom = '', entreprise = '', poste = '' } = {}, quand = new Date()) {
  const propre = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return ['LM', propre(nom), propre(entreprise), propre(poste), quand.toISOString().slice(0, 7)].filter(Boolean).join('_');
}

// --- Règles de méthode : rien n'est bloquant, chaque règle non tenue devient un conseil ---

// NOTE: formules creuses que les recruteurs sautent, et formules d'humilité qui affaiblissent la posture d'expert
export const CLICHES = ['je me permets', 'suite a votre annonce', 'c\'est avec un grand interet', 'dynamique et motive', 'motive et dynamique', 'rigoureux', 'rigoureuse', 'rigueur', 'synergie', 'force de proposition', 'esprit d\'equipe', 'passionne', 'n\'hesitez pas', 'dans l\'attente de votre reponse', 'je suis la personne qu\'il vous faut', 'vif interet'];
export const HUMILITE = ['je pense pouvoir', 'je crois pouvoir', 'meme si je n\'ai pas', 'je n\'ai pas encore', 'malgre mon manque', 'j\'espere', 'peut-etre', 'je ne suis pas', 'modestement'];
// NOTE: informations qu'un recruteur n'a pas à connaître et qui servent de motif d'écart (âge, santé, famille, durée sans emploi) ; formulées pour ne pas viser « assurance maladie » ou « secteur de la santé »
const DISCRIMINANT = [/\bmon age\b/, /\bage de \d{2} ans\b/, /\bj'ai \d{2} ans\b/, /\bmon handicap\b/, /\barret maladie\b/, /\b(mon etat de|probleme[s]? de|raisons? de) sante\b/, /\benceinte\b/, /\bmes enfants\b/, /\bdivorce/, /\bsituation familiale\b/, /\bchomage\b/, /\bsans emploi\b/, /\binactivite\b/, /\bdepuis (des|plusieurs) (mois|annees) sans\b/];

// ANCHOR: répétition entre lettres : l'ouverture et la clôture ne doivent pas reprendre 5 mots de suite d'une lettre déjà rédigée pour une autre candidature
const PHRASES_POLITESSE = /agree|salutations|cordialement/;
const phrasesDe = t => String(t ?? '').split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
function zonesLettre(texte) {
  const ps = paragraphesDe(texte).filter(p => !/^(madame|monsieur)[^.]{0,40},?$/i.test(p));
  if (!ps.length) return [];
  const ouverture = phrasesDe(ps[0]).slice(0, 2);
  const cloture = ps.length > 1 ? phrasesDe(ps.at(-1)).slice(-3) : [];
  return [...ouverture, ...cloture].filter(x => !PHRASES_POLITESSE.test(norm(x)));
}
const gramsDe = (phrase, n = 5) => {
  const m = norm(phrase).replace(/’/g, '\'').split(/[^a-z0-9']+/).filter(Boolean);
  return m.length < n ? [] : m.slice(0, m.length - n + 1).map((_, i) => m.slice(i, i + n).join(' '));
};
/** Reprises d'ouverture ou de clôture d'une lettre précédente @param {string} texte @param {{ nom: string, texte: string }[]} precedentes */
export function reprisesPrecedentes(texte, precedentes = []) {
  const miens = new Set(zonesLettre(texte).flatMap(x => gramsDe(x)));
  if (!miens.size) return [];
  const trouvees = [];
  for (const l of precedentes) {
    const commun = zonesLettre(l.texte).flatMap(x => gramsDe(x)).find(g => miens.has(g));
    if (commun) trouvees.push({ nom: l.nom, extrait: commun });
  }
  return trouvees.length ? [{ code: 'repetition', message: `Ouverture ou clôture déjà utilisée dans ${trouvees.slice(0, 3).map(t => `« ${t.nom} »`).join(', ')} (« ${trouvees[0].extrait} ») : changer d'angle pour que la lettre ne ressemble pas à un copier-coller.` }] : [];
}

/** @param {string} texte @param {{ mots?: number }} [matrice] @param {{ eviter?: string[] }} [style] */
export function conseilsMethode(texte, matrice = {}, { eviter = [] } = {}) {
  const cible = Number(matrice.mots) || MATRICE_DEFAUT.mots;
  const n = norm(texte).replace(/’/g, '\'');
  // NOTE: « Madame, Monsieur, » n'est pas un paragraphe du corps : ni compté, ni pris pour l'accroche
  const paragraphes = paragraphesDe(texte).filter(p => !/^(madame|monsieur)[^.]{0,40},?$/i.test(p));
  const nb = compterMots(texte);
  const conseils = [];
  if (nb < cible * 0.7 || nb > cible * 1.3) conseils.push({ code: 'longueur', message: `${nb} mots pour ${cible} visés : ${nb > cible ? 'raccourcir, le recruteur lit en diagonale' : 'étoffer avec une preuve concrète'}.` });
  if (paragraphes.length && (paragraphes.length < 3 || paragraphes.length > 6)) conseils.push({ code: 'paragraphes', message: `${paragraphes.length} paragraphe${paragraphes.length > 1 ? 's' : ''} : viser 3 à 5 paragraphes courts, séparés par une ligne vide.` });
  const premier = norm(paragraphes[0] ?? '');
  if (/^(madame|monsieur)[^.]*[,.]?\s*(je me permets|suite a|actuellement|je suis)/.test(premier) || /^(je me permets|suite a|actuellement a la recherche)/.test(premier)) conseils.push({ code: 'accroche', message: 'Accroche générique : ouvrir sur un fait précis de l\'offre ou de l\'entreprise.' });
  const cliches = CLICHES.filter(c => n.includes(c));
  if (cliches.length) conseils.push({ code: 'cliche', message: `Formules creuses à remplacer par une preuve : ${cliches.join(', ')}.` });
  const perso = eviter.filter(f => n.includes(f) && !cliches.includes(f));
  if (perso.length) conseils.push({ code: 'eviter', message: `Formules de votre liste à éviter : ${perso.join(', ')}.` });
  const humbles = HUMILITE.filter(c => n.includes(c));
  if (humbles.length) conseils.push({ code: 'humilite', message: `Formules qui affaiblissent la posture d'expert : ${humbles.join(', ')}.` });
  if (DISCRIMINANT.some(r => r.test(n))) conseils.push({ code: 'discriminant', message: 'Information personnelle (âge, santé, famille, période sans emploi) : à retirer, elle ne sert pas la candidature.' });
  if (/[—–]/.test(texte) || /[“”‘’]/.test(texte) || /…/.test(texte)) conseils.push({ code: 'typographie', message: 'Tiret long, guillemets courbes ou points de suspension typographiques : utiliser la ponctuation du clavier.' });
  if (/\p{Extended_Pictographic}/u.test(texte)) conseils.push({ code: 'emoji', message: 'Emoji : à retirer d\'une lettre de motivation.' });
  return conseils;
}

// NOTE: phrase à la première personne faite des mots de l'annonce et presque absente du CV de référence et du Profil : mission du poste présentée comme une expérience, à prouver ou à retirer
const VIDES = new Set(['votre', 'notre', 'avoir', 'cette', 'leurs', 'aupres', 'ainsi', 'entre', 'chaque', 'toute', 'toutes', 'autres', 'depuis', 'pendant', 'permet']);
function reprisesAnnonce(texte, sources, annonce) {
  if (!annonce) return [];
  const motsDe = t => t.split(/[^a-z0-9+#]+/).filter(m => m.length >= 5 && !VIDES.has(m));
  const dansAnnonce = new Set(motsDe(annonce));
  const dansSources = new Set(motsDe(sources));
  const reprises = String(texte ?? '').split(/(?<=[.!?])\s+|\n+/).filter(phrase => {
    const n = norm(phrase).replace(/’/g, '\'');
    if (!/\b(j'ai|je|mon|ma|mes)\b/.test(n)) return false;
    const mots = [...new Set(motsDe(n))];
    if (mots.length < 4) return false;
    const partAnnonce = mots.filter(m => dansAnnonce.has(m)).length / mots.length;
    const partSources = mots.filter(m => dansSources.has(m)).length / mots.length;
    return partAnnonce >= 0.5 && partSources < 0.35;
  });
  return reprises.length ? [{ code: 'reprise', message: `Phrase${reprises.length > 1 ? 's' : ''} reprise${reprises.length > 1 ? 's' : ''} de l'annonce sans trace au Profil, à prouver par une vraie réalisation ou à retirer : « ${reprises.map(p => p.trim().slice(0, 90)).join(' » ; « ')} ».` }] : [];
}

// NOTE: formules d'appel et de politesse, toujours présentes et jamais à vérifier
const CIVILITES = new Set(['madame', 'monsieur', 'mesdames', 'messieurs', 'mademoiselle']);

/**
 * Contrôle complet d'une lettre : faits concrets (noms propres, chiffres, années, outils) trouvés dans le CV de référence (ok), le Profil (profil) ou l'annonce (offre), sinon absents, plus les conseils de méthode
 * @param {string} texte @param {{ reference?: string, profil?: string, offre?: string, matrice?: any, eviter?: string[], precedentes?: { nom: string, texte: string }[] }} sources
 */
export function controlerLettre(texte, { reference = '', profil = '', offre = '', matrice = {}, eviter = [], precedentes = [] } = {}) {
  const source = norm(offre).replace(/\s+/g, ' ');
  const motsOffre = new Set(source.split(/[^a-z0-9+#]+/));
  const faits = controlerTexte(texte, reference, profil).map(f => {
    if (f.statut === 'ok') return f;
    const m = norm(f.fait);
    if (CIVILITES.has(m)) return { ...f, statut: 'ok' };
    // NOTE: le nom de l'entreprise, la ville ou un logiciel cité par l'annonce n'est pas une invention : statut « offre », ni écart ni avertissement, même s'il figure aussi au Profil
    return motsOffre.has(m) || (m.length >= 4 && source.includes(m)) ? { ...f, statut: 'offre' } : f;
  });
  // NOTE: durée d'expérience (« plus de 2 ans d'expérience ») : le petit modèle en invente, elle doit figurer telle quelle dans le CV de référence ou le Profil
  const sources = norm(`${reference}\n${profil}`).replace(/\s+/g, ' ');
  for (const [, n] of norm(texte).matchAll(/\b(\d+)\s+ans?\s+d.?experience/g)) {
    if (!new RegExp(`(^|[^0-9])${n}\\s+ans?\\b`).test(sources)) faits.push({ fait: `${n} ans d'expérience`, statut: 'absent' });
  }
  const conseils = [...conseilsMethode(texte, matrice, { eviter }), ...reprisesAnnonce(texte, sources, source), ...reprisesPrecedentes(texte, precedentes)];
  return {
    faits, conseils, mots: compterMots(texte),
    ecarts: faits.filter(f => f.statut === 'absent').length,
    avertissements: faits.filter(f => f.statut === 'profil').length + conseils.length,
  };
}
