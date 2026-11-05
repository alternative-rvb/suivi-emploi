// API La Bonne Boite v2 de francetravail.io : entreprises à fort potentiel d'embauche, pour des candidatures spontanées.
// Activée par FT_SCOPE_BONNEBOITE dans le .env (voir .env.example) ; sans cette variable, la fonction est désactivée.
import { ErreurSync } from './erreurs.mjs';
import { jetonFranceTravail, URL_API } from './ft-jeton.mjs';

const URL_RECHERCHE = `${URL_API}/labonneboite/v2/recherche`;
// NOTE: l'API refuse le scope api_labonneboitev2 seul (403 Invalid scope) : search et office sont requis en plus
const SCOPES_REQUIS = ['search', 'office'];
export const DISTANCE_DEFAUT = 30;
export const DISTANCE_MAX = 100;
const ROME = /^[A-N]\d{4}$/;
const DUREE_CACHE_MS = 6 * 3600 * 1000;
const MAX_CACHE = 50;
const cache = new Map();
// NOTE: l'API refuse les appels trop rapprochés (429 constaté dès le troisième appel en rafale) : un appel à la fois, espacés, un nouvel essai sur 429
// FT_BB_PAUSE_MS permet de supprimer la pause dans les tests
const PAUSE_MS = Number(process.env.FT_BB_PAUSE_MS ?? 1100);
const attendre = ms => new Promise(r => setTimeout(r, ms));
let file = Promise.resolve();
const enFile = tache => {
  const suite = file.then(async () => { try { return await tache(); } finally { await attendre(PAUSE_MS); } });
  file = suite.catch(() => {});
  return suite;
};

export function viderCacheBonneBoite() {
  cache.clear();
}

// ANCHOR: la fonction est active seulement si FT_SCOPE_BONNEBOITE est renseignée ; les scopes requis sont complétés si le .env n'en cite qu'un
export function scopeBonneBoite(env = process.env) {
  const saisi = (env.FT_SCOPE_BONNEBOITE ?? '').split(/\s+/).filter(Boolean);
  if (!saisi.length) return null;
  return [...new Set([...saisi, ...SCOPES_REQUIS])].join(' ');
}

const radians = d => (d * Math.PI) / 180;
// NOTE: distance à vol d'oiseau en km (haversine), au dixième
export function distanceKm(a, b) {
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

const effectif = (min, max) => (min == null ? '' : max == null || max === min ? String(min) : `${min} à ${max}`);

// ANCHOR: une entreprise de la réponse vers le format de l'app (champs inconnus ignorés, rien de la réponse brute n'est gardé)
export function normaliserEntreprise(brute, origine) {
  const lat = Number(brute.location?.lat);
  const lon = Number(brute.location?.lon);
  const place = Number.isFinite(lat) && Number.isFinite(lon);
  return {
    siret: String(brute.siret ?? ''),
    nom: String(brute.company_name || brute.office_name || ''),
    secteur: String(brute.naf_label ?? ''),
    effectif: effectif(brute.headcount_min, brute.headcount_max),
    ville: String(brute.city ?? ''),
    code_postal: String(brute.postcode ?? ''),
    departement: String(brute.department_number ?? ''),
    lat: place ? lat : null,
    lon: place ? lon : null,
    distance_km: place && origine ? distanceKm(origine, { lat, lon }) : null,
    potentiel: Number.isFinite(Number(brute.hiring_potential)) ? Math.round(Number(brute.hiring_potential) * 10) / 10 : null,
    haut_potentiel: brute.is_high_potential === true,
  };
}

// Recherche pour un code ROME autour d'un point. Renvoie { total, entreprises } ; lève une ErreurSync typée
export async function chercherEntreprises({ rome, lat, lon, distance = DISTANCE_DEFAUT }) {
  const scope = scopeBonneBoite();
  if (!scope) throw new ErreurSync('config', 'La Bonne Boite est désactivée : renseigner FT_SCOPE_BONNEBOITE dans le fichier .env (voir .env.example).');
  if (!ROME.test(rome ?? '')) throw new ErreurSync('format', 'Code ROME invalide (une lettre et quatre chiffres, par exemple M1805).');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new ErreurSync('format', 'Point de départ sans coordonnées.');
  const km = Math.min(DISTANCE_MAX, Math.max(1, Math.round(Number(distance) || DISTANCE_DEFAUT)));
  const cle = `${rome}|${lat.toFixed(3)}|${lon.toFixed(3)}|${km}`;
  const garde = cache.get(cle);
  if (garde && garde.expire > Date.now()) return garde.valeur;

  const jeton = await jetonFranceTravail(scope, { nomApi: 'La Bonne Boite' });
  const url = `${URL_RECHERCHE}?${new URLSearchParams({ rome, latitude: String(lat), longitude: String(lon), distance: String(km) })}`;
  const appeler = async () => {
    try {
      return await fetch(url, { headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      const motif = e.name === 'TimeoutError' ? 'délai dépassé' : (e.cause?.code ?? e.message);
      throw new ErreurSync('reseau', `API La Bonne Boite injoignable (${motif}).`);
    }
  };
  const r = await enFile(async () => {
    const premiere = await appeler();
    if (premiere.status !== 429) return premiere;
    await attendre(PAUSE_MS * 2);
    return appeler();
  });
  if (r.status === 204) return { total: 0, entreprises: [] };
  if (r.status === 401 || r.status === 403) throw new ErreurSync('auth', 'La Bonne Boite a refusé l\'accès : vérifier que l\'API est ajoutée à l\'application sur francetravail.io et que son accès est validé.');
  if (r.status === 429) throw new ErreurSync('http', 'La Bonne Boite : trop d\'appels, réessayer dans un instant.');
  if (!r.ok) throw new ErreurSync('http', `La Bonne Boite a répondu ${r.status}.`);
  const donnees = await r.json().catch(() => null);
  if (!donnees || !Array.isArray(donnees.items)) throw new ErreurSync('format', 'Réponse de La Bonne Boite illisible.');
  const valeur = { total: Number(donnees.hits) || donnees.items.length, entreprises: donnees.items.map(b => normaliserEntreprise(b, { lat, lon })) };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(cle, { valeur, expire: Date.now() + DUREE_CACHE_MS });
  return valeur;
}
