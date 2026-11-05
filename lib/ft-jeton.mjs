// Jeton OAuth (client_credentials) de l'application francetravail.io, partagé par les API France Travail (offres, La Bonne Boite, marché du travail).
// Clés dans .env : FT_CLIENT_ID et FT_CLIENT_SECRET, les mêmes pour toutes les API de l'application. Seul le scope change d'une API à l'autre.
import { ErreurSync } from './erreurs.mjs';

export const URL_TOKEN = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
export const URL_API = 'https://api.francetravail.io/partenaire';

// NOTE: jetons gardés jusqu'à leur expiration (moins une marge), par scope. Utile aux API appelées à chaque affichage, pas à la synchro des offres
const cache = new Map();
const MARGE_MS = 60_000;

// ANCHOR: vide le cache, pour les tests qui changent la réponse du faux fetch d'une fois sur l'autre
export function viderCacheJetons() {
  cache.clear();
}

// NOTE: scope = noms séparés par des espaces. Un seul scope non accordé fait échouer tout le jeton (invalid_scope), d'où un jeton par API
export async function jetonFranceTravail(scope, { memoriser = true, nomApi = 'France Travail' } = {}) {
  const { FT_CLIENT_ID: id, FT_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new ErreurSync('config', 'Configuration absente : renseigner FT_CLIENT_ID et FT_CLIENT_SECRET dans le fichier .env.');
  const garde = memoriser ? cache.get(scope) : null;
  if (garde && garde.expire > Date.now()) return garde.jeton;
  const corps = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope });
  let r;
  try {
    r = await fetch(URL_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corps, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    const motif = e.name === 'TimeoutError' ? 'délai dépassé' : (e.cause?.code ?? e.message);
    throw new ErreurSync('reseau', `API France Travail injoignable (${motif}).`);
  }
  if (r.status === 400 || r.status === 401 || r.status === 403) {
    const detail = await r.json().catch(() => ({}));
    // NOTE: invalid_scope = clés valides mais API non ajoutée à l'application (ou scope mal recopié) ; invalid_client = clés refusées
    if (detail?.error === 'invalid_scope') throw new ErreurSync('auth', `Application non abonnée à l'API ${nomApi} ou scope incorrect : ajouter l'API sur francetravail.io et vérifier le scope dans le fichier .env.`);
    throw new ErreurSync('auth', 'Clés France Travail refusées : vérifier FT_CLIENT_ID et FT_CLIENT_SECRET.');
  }
  if (!r.ok) throw new ErreurSync('http', `L'authentification France Travail a répondu ${r.status}.`);
  const { access_token: jeton, expires_in: duree } = await r.json().catch(() => ({}));
  if (!jeton) throw new ErreurSync('format', 'Réponse d\'authentification France Travail inattendue.');
  if (memoriser) cache.set(scope, { jeton, expire: Date.now() + Math.max(0, (Number(duree) || 0) * 1000 - MARGE_MS) });
  return jeton;
}
