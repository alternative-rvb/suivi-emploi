// ANCHOR: zone de distance du score, lue dans le .env à chaque appel (le .env se charge après les imports). Rien n'est codé en dur :
// sans réglage, aucune distance n'est calculée et le score garde la zone « proche » tout ou rien.
// SUIVI_ORIGINES : points de départ « lat,lon » séparés par des points-virgules (la distance retenue est celle du plus proche)
// SUIVI_DEPARTEMENTS_DISTANCE : départements dont les communes sont chargées pour situer les offres (défaut : SUIVI_DEPARTEMENT_PROCHE)
// SUIVI_LIEU_BONUS : un point « lat,lon » facultatif qui donne un petit bonus aux offres situées à 15 km ou moins

/** @typedef {[number, number]} LonLat */

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

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ origines: LonLat[], departements: string[], bonus: LonLat | null }}
 */
export function lireZone(env = process.env) {
  const origines = String(env.SUIVI_ORIGINES ?? '').split(';').map(lirePoint).filter(p => p !== null);
  const deps = String(env.SUIVI_DEPARTEMENTS_DISTANCE ?? env.SUIVI_DEPARTEMENT_PROCHE ?? '').split(',').map(d => d.trim().toUpperCase()).filter(d => /^(\d{2,3}|2A|2B)$/.test(d));
  return { origines, departements: [...new Set(deps)], bonus: lirePoint(env.SUIVI_LIEU_BONUS ?? '') };
}
