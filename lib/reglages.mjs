// Réglages de recherche propres à l'app : zones, mots-clés, mots exclus, contrats exclus, employeurs surveillés.
// Enregistrés dans le kv `reglages`. Tant qu'ils n'existent pas, on reprend la copie locale de la veille n8n (kv `veille`).
// NOTE: la veille n8n et son Discord gardent leurs propres filtres, que l'app ne modifie pas.
// NOTE: mode, malus_contrat et km_tous_contrats règlent le score (lib/contrat.mjs) ; facultatifs, leur absence garde le comportement d'origine.
import { ecrireReglageProfil, lireReglageProfil, profilActif, profilDefaut } from './profils.mjs';
import { KM_TOUS_CONTRATS_DEFAUT, MALUS_CONTRAT_DEFAUT, MALUS_CONTRAT_MAX, MODES_RECHERCHE } from './contrat.mjs';

export class ErreurReglages extends Error {}

const CHAMPS = ['zones', 'mots_cles', 'mots_exclus', 'contrats_exclus', 'entreprises'];
const CHAMPS_SCORE = ['mode', 'malus_contrat', 'km_tous_contrats'];
const KM_MAX = 500;
const MAX_ELEMENTS = 500;
const MAX_LONGUEUR = 100;

const lire = (db, cle) => {
  const ligne = db.prepare('SELECT valeur FROM kv WHERE cle = ?').get(cle);
  try {
    return ligne ? JSON.parse(ligne.valeur) : null;
  } catch {
    return null;
  }
};

// Liste de textes : espaces nettoyés, vides et doublons retirés (casse ignorée), ordre conservé
function liste(nom, v, /** @type {{ majuscules?: boolean, motif?: RegExp, exemple?: string }} */ { majuscules = false, motif, exemple } = {}) {
  if (!Array.isArray(v)) throw new ErreurReglages(`${nom} doit être une liste.`);
  if (v.length > MAX_ELEMENTS) throw new ErreurReglages(`${nom} : ${MAX_ELEMENTS} éléments au plus.`);
  const vus = new Set();
  const sortie = [];
  for (const brut of v) {
    if (typeof brut !== 'string') throw new ErreurReglages(`${nom} ne contient que du texte.`);
    let t = brut.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (t.length > MAX_LONGUEUR) throw new ErreurReglages(`${nom} : « ${t.slice(0, 20)}... » dépasse ${MAX_LONGUEUR} caractères.`);
    if (majuscules) t = t.toUpperCase();
    if (motif && !motif.test(t)) throw new ErreurReglages(`${nom} : « ${t} » invalide${exemple ? ` (exemple : ${exemple})` : ''}.`);
    const cle = t.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    sortie.push(t);
  }
  return sortie;
}

/** @returns {import('../types.d.ts').Reglages} */
export function validerReglages(d) {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new ErreurReglages('Objet JSON attendu.');
  const inconnus = Object.keys(d).filter(k => !CHAMPS.includes(k) && !CHAMPS_SCORE.includes(k));
  if (inconnus.length) throw new ErreurReglages(`Champs inconnus : ${inconnus.join(', ')}.`);
  for (const k of CHAMPS) if (!(k in d)) throw new ErreurReglages(`Le champ ${k} est obligatoire.`);
  const r = {
    zones: liste('zones', d.zones, { majuscules: true, motif: /^(\d{2,3}|2[AB])$/, exemple: '83, 13, 2A' }),
    mots_cles: liste('mots_cles', d.mots_cles),
    mots_exclus: liste('mots_exclus', d.mots_exclus),
    contrats_exclus: liste('contrats_exclus', d.contrats_exclus, { majuscules: true, motif: /^[A-Z]{3}$/, exemple: 'FRA, STA' }),
    entreprises: liste('entreprises', d.entreprises),
    ...reglagesScore(d),
  };
  if (!r.zones.length) throw new ErreurReglages('Au moins une zone est nécessaire.');
  if (!r.mots_cles.length) throw new ErreurReglages('Au moins un mot-clé est nécessaire pour chercher des offres.');
  return r;
}

// ANCHOR: réglages du score, facultatifs : valeurs par défaut quand ils manquent, refus d'une valeur hors bornes
function entier(nom, v, defaut, max) {
  if (v === undefined || v === null || v === '') return defaut;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new ErreurReglages(`${nom} : entier de 0 à ${max} attendu.`);
  return n;
}
/** @returns {{ mode: import('../types.d.ts').ModeRecherche, malus_contrat: number, km_tous_contrats: number }} */
function reglagesScore(d) {
  const mode = d.mode ?? 'emploi';
  if (!MODES_RECHERCHE.includes(mode)) throw new ErreurReglages(`mode : ${MODES_RECHERCHE.join(', ')} attendu.`);
  return {
    mode,
    malus_contrat: entier('malus_contrat', d.malus_contrat, MALUS_CONTRAT_DEFAUT, MALUS_CONTRAT_MAX),
    km_tous_contrats: entier('km_tous_contrats', d.km_tous_contrats, KM_TOUS_CONTRATS_DEFAUT, KM_MAX),
  };
}

// Renvoie { reglages, origine } : "app" (enregistrés ici), "veille" (copie de la veille n8n) ou "aucun"
export function lireReglages(db) {
  const propres = lireReglageProfil(db, 'reglages');
  if (propres) {
    try {
      return { reglages: validerReglages(propres), origine: 'app' };
    } catch { /* enregistrement abîmé : retour à la copie de la veille */ }
  }
  // NOTE: la copie de la veille n8n (kv d'installation) ne sert de repli qu'au profil par défaut : un profil ajouté part de réglages vides
  const veille = profilActif(db) === profilDefaut(db) ? lire(db, 'veille') : null;
  const reglages = {
    zones: veille?.zones ?? [],
    mots_cles: veille?.mots_cles ?? [],
    mots_exclus: veille?.mots_exclus ?? [],
    contrats_exclus: veille?.contrats_exclus ?? [],
    entreprises: veille?.entreprises ?? [],
    ...reglagesScore({}),
  };
  return { reglages, origine: veille ? 'veille' : 'aucun' };
}

// ANCHOR: un enregistrement qui n'envoie pas les réglages de score (vieil onglet, script) garde ceux du profil au lieu de les remettre aux valeurs d'origine
export function completerReglages(db, d) {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) return d;
  const actuels = lireReglages(db).reglages;
  return { ...Object.fromEntries(CHAMPS_SCORE.map(k => [k, actuels[k]])), ...d };
}

export function ecrireReglages(db, reglages) {
  ecrireReglageProfil(db, 'reglages', reglages);
}
