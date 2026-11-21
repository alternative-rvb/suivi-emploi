// ANCHOR: zone de recherche d'un profil (réglage « zone », v32) : zone « proche » (département et villes), points de départ du calcul de distance,
// départements dont les communes sont chargées, lieu bonus facultatif. Rien n'est codé en dur : sans réglage, aucune offre n'est « proche » et aucune distance n'est calculée.
// NOTE: l'ancien réglage du .env (SUIVI_DEPARTEMENT_PROCHE, SUIVI_VILLES_PROCHES, SUIVI_ORIGINES, SUIVI_DEPARTEMENTS_DISTANCE, SUIVI_LIEU_BONUS) est recopié au démarrage
// dans le profil par défaut s'il n'a pas encore de zone, et reste lu en repli pour ce seul profil (commandes bin/ sans serveur)
import { ecrireReglageProfil, lireReglageProfil, profilActif, profilDefaut } from './profils.mjs';

/** @typedef {[number, number]} LonLat */
/** @typedef {{ departement_proche: string, villes_proches: string[], origines: string[], departements_distance: string[], lieu_bonus: string }} Zone */

/** @type {Zone} */
export const ZONE_VIDE = { departement_proche: '', villes_proches: [], origines: [], departements_distance: [], lieu_bonus: '' };

const DEPARTEMENT = /^(\d{2,3}|2A|2B)$/;

/**
 * Lit un point « lat,lon » (ordre des cartes en ligne) et le rend en [lon, lat] (ordre GeoJSON), ou null s'il est invalide.
 * @param {string} texte
 * @returns {LonLat | null}
 */
export function lirePoint(texte) {
  const m = String(texte ?? '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}

const liste = (/** @type {unknown} */ v, /** @type {string} */ sep) => String(v ?? '').split(sep).map(x => x.trim()).filter(Boolean);

/**
 * Zone écrite dans l'ancien .env
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Zone}
 */
export function zoneEnv(env = process.env) {
  const proche = String(env.SUIVI_DEPARTEMENT_PROCHE ?? '').trim().toUpperCase();
  return {
    departement_proche: proche,
    villes_proches: liste(env.SUIVI_VILLES_PROCHES, ','),
    origines: liste(env.SUIVI_ORIGINES, ';'),
    departements_distance: liste(env.SUIVI_DEPARTEMENTS_DISTANCE, ',').map(d => d.toUpperCase()),
    lieu_bonus: String(env.SUIVI_LIEU_BONUS ?? '').trim(),
  };
}

const vide = (/** @type {Zone} */ z) => !z.departement_proche && !z.villes_proches.length && !z.origines.length && !z.departements_distance.length && !z.lieu_bonus;

/**
 * Contrôle une zone reçue de l'interface ; lève une Error au message lisible
 * @param {any} d
 * @returns {Zone}
 */
export function validerZone(d) {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new Error('Objet JSON attendu : { departement_proche, villes_proches, origines, departements_distance, lieu_bonus }.');
  const inconnus = Object.keys(d).filter(k => !(k in ZONE_VIDE));
  if (inconnus.length) throw new Error(`Champs inconnus : ${inconnus.join(', ')}.`);
  const textes = (/** @type {string} */ k, /** @type {number} */ max) => {
    const v = d[k] ?? [];
    if (!Array.isArray(v) || v.length > max || v.some(x => typeof x !== 'string' || x.length > 80)) throw new Error(`${k} : liste d'au plus ${max} textes.`);
    return v.map(x => x.trim()).filter(Boolean);
  };
  const departement = String(d.departement_proche ?? '').trim().toUpperCase();
  if (departement && !DEPARTEMENT.test(departement)) throw new Error('departement_proche : code de département (ex. 44, 2A) ou vide.');
  const departements = [...new Set(textes('departements_distance', 20).map(x => x.toUpperCase()))];
  if (departements.some(x => !DEPARTEMENT.test(x))) throw new Error('departements_distance : codes de département seulement.');
  const origines = textes('origines', 10);
  if (origines.some(o => !lirePoint(o))) throw new Error('origines : points « latitude,longitude » (ex. 47.2184,-1.5536).');
  const bonus = String(d.lieu_bonus ?? '').trim();
  if (bonus && !lirePoint(bonus)) throw new Error('lieu_bonus : point « latitude,longitude » ou vide.');
  return { departement_proche: departement, villes_proches: textes('villes_proches', 50), origines, departements_distance: departements, lieu_bonus: bonus };
}

/**
 * Zone du profil actif : son réglage, sinon (profil par défaut seulement) l'ancien .env
 * @param {any} db
 * @returns {Zone}
 */
export function lireZoneProfil(db) {
  const z = lireReglageProfil(db, 'zone');
  if (z && typeof z === 'object') { try { return validerZone(z); } catch { /* réglage abîmé : repli ci-dessous */ } }
  return profilActif(db) === profilDefaut(db) ? zoneEnv() : { ...ZONE_VIDE };
}

/** Recopie l'ancienne zone du .env dans le profil par défaut s'il n'en a pas encore (à appeler dans le contexte du profil par défaut) ; renvoie true si elle a été recopiée */
export function reprendreZoneEnv(db, env = process.env) {
  if (lireReglageProfil(db, 'zone')) return false;
  const brute = zoneEnv(env);
  // NOTE: le .env n'était pas contrôlé : valeurs illisibles écartées plutôt que tout refuser
  const z = {
    ...brute,
    departement_proche: DEPARTEMENT.test(brute.departement_proche) ? brute.departement_proche : '',
    origines: brute.origines.filter(o => lirePoint(o)),
    departements_distance: brute.departements_distance.filter(d => DEPARTEMENT.test(d)),
    lieu_bonus: lirePoint(brute.lieu_bonus) ? brute.lieu_bonus : '',
  };
  if (vide(z)) return false;
  try { ecrireReglageProfil(db, 'zone', validerZone(z)); } catch { return false; }
  return true;
}

/**
 * Points prêts pour le calcul de distance : origines [lon, lat], départements à charger (défaut : département proche), lieu bonus
 * @param {Zone} zone
 * @returns {{ origines: LonLat[], departements: string[], bonus: LonLat | null }}
 */
export function calculerZone(zone) {
  const origines = zone.origines.map(lirePoint).filter(p => p !== null);
  const deps = (zone.departements_distance.length ? zone.departements_distance : [zone.departement_proche]).map(d => d.trim().toUpperCase()).filter(d => DEPARTEMENT.test(d));
  return { origines, departements: [...new Set(deps)], bonus: lirePoint(zone.lieu_bonus) };
}

/** Ancienne lecture directe du .env (tests, repli) */
export const lireZone = (/** @type {NodeJS.ProcessEnv} */ env = process.env) => calculerZone(zoneEnv(env));
