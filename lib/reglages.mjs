// Réglages de recherche propres à l'app : zones, mots-clés, mots exclus, contrats exclus, employeurs surveillés.
// Enregistrés dans le kv `reglages`. Tant qu'ils n'existent pas, on reprend la copie locale de la veille n8n (kv `veille`).
// NOTE: la veille n8n et son Discord gardent leurs propres filtres, que l'app ne modifie pas.

export class ErreurReglages extends Error {}

const CHAMPS = ['zones', 'mots_cles', 'mots_exclus', 'contrats_exclus', 'entreprises'];
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
  const inconnus = Object.keys(d).filter(k => !CHAMPS.includes(k));
  if (inconnus.length) throw new ErreurReglages(`Champs inconnus : ${inconnus.join(', ')}.`);
  for (const k of CHAMPS) if (!(k in d)) throw new ErreurReglages(`Le champ ${k} est obligatoire.`);
  const r = {
    zones: liste('zones', d.zones, { majuscules: true, motif: /^(\d{2,3}|2[AB])$/, exemple: '83, 13, 2A' }),
    mots_cles: liste('mots_cles', d.mots_cles),
    mots_exclus: liste('mots_exclus', d.mots_exclus),
    contrats_exclus: liste('contrats_exclus', d.contrats_exclus, { majuscules: true, motif: /^[A-Z]{3}$/, exemple: 'FRA, STA' }),
    entreprises: liste('entreprises', d.entreprises),
  };
  if (!r.zones.length) throw new ErreurReglages('Au moins une zone est nécessaire.');
  if (!r.mots_cles.length) throw new ErreurReglages('Au moins un mot-clé est nécessaire pour chercher des offres.');
  return r;
}

// Renvoie { reglages, origine } : "app" (enregistrés ici), "veille" (copie de la veille n8n) ou "aucun"
export function lireReglages(db) {
  const propres = lire(db, 'reglages');
  if (propres) {
    try {
      return { reglages: validerReglages(propres), origine: 'app' };
    } catch { /* enregistrement abîmé : retour à la copie de la veille */ }
  }
  const veille = lire(db, 'veille');
  const reglages = {
    zones: veille?.zones ?? [],
    mots_cles: veille?.mots_cles ?? [],
    mots_exclus: veille?.mots_exclus ?? [],
    contrats_exclus: veille?.contrats_exclus ?? [],
    entreprises: veille?.entreprises ?? [],
  };
  return { reglages, origine: veille ? 'veille' : 'aucun' };
}

export function ecrireReglages(db, reglages) {
  db.prepare('INSERT INTO kv (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run('reglages', JSON.stringify(reglages));
}
