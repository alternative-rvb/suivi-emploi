// Connexion directe à l'API Google Calendar (ligne 120), sans dépendance : OAuth 2.0 en boucle locale avec PKCE, fetch natif.
// Configuration dans .env : GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET (client OAuth « Application de bureau »).
// Le jeton de rafraîchissement vit dans un fichier à part (data/google-agenda.json, mode 600), hors de suivi.db et de ses sauvegardes.
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ErreurSync } from '../erreurs.mjs';
import { FUSEAU, heureParis } from '../fuseau.mjs';

export { FUSEAU, heureParis };

// ANCHOR: scopes les plus étroits : liste des calendriers en lecture, événements des seuls calendriers dont l'utilisateur est propriétaire
export const SCOPES = ['https://www.googleapis.com/auth/calendar.events.owned', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'];

const URLS_GOOGLE = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  api: 'https://www.googleapis.com/calendar/v3',
};
// NOTE: AGENDA_URL_TEST remplace les adresses de Google par un faux serveur, pour les tests seulement
export const urlsGoogle = (base = process.env.AGENDA_URL_TEST) => (base ? { auth: base + '/auth', token: base + '/token', revoke: base + '/revoke', api: base + '/calendar/v3' } : URLS_GOOGLE);

const DUREE_DEMANDE_MS = 10 * 60_000;
const base64url = b => b.toString('base64url');

// ANCHOR: décalage de Paris (+01:00 ou +02:00) à une date donnée, pour borner une journée locale en RFC 3339
export function decalageParis(jour) {
  const nom = new Intl.DateTimeFormat('en', { timeZone: FUSEAU, timeZoneName: 'longOffset' }).formatToParts(new Date(jour + 'T12:00:00Z')).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  return nom === 'GMT' ? '+00:00' : nom.slice(3);
}
export const debutJourParis = jour => `${jour}T00:00:00${decalageParis(jour)}`;

// NOTE: heure murale AAAA-MM-JJTHH:MM plus des minutes, sans passer par le fuseau (Google applique timeZone)
export function ajouterMinutes(debut, minutes) {
  const [j, h] = debut.split('T');
  const [a, mo, d] = j.split('-').map(Number);
  const [hh, mi] = h.split(':').map(Number);
  const t = new Date(Date.UTC(a, mo - 1, d, hh, mi + minutes));
  return t.toISOString().slice(0, 16);
}

// ANCHOR: événement Google réduit à ce qu'affiche l'app ; suivi = id du RDV local quand l'événement a été créé par l'app (étape 3)
export function versEvenement(e) {
  const video = e.hangoutLink || e.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri || '';
  return {
    id: String(e.id),
    titre: e.summary ?? '(sans titre)',
    debut: e.start?.dateTime ?? e.start?.date ?? '',
    fin: e.end?.dateTime ?? e.end?.date ?? '',
    journee: Boolean(e.start?.date && !e.start?.dateTime),
    lieu: e.location ?? '',
    visio: video,
    lien: e.htmlLink ?? '',
    statut: e.status ?? 'confirmed',
    suivi: e.extendedProperties?.private?.suivi ?? '',
  };
}

// Corps d'événement Google à partir d'un RDV local { titre, debut, duree, lieu, lien_visio, description, suivi }
export function corpsEvenement(rdv) {
  return {
    summary: rdv.titre,
    location: rdv.lieu || undefined,
    description: [rdv.description, rdv.lien_visio && `Visio : ${rdv.lien_visio}`].filter(Boolean).join('\n\n') || undefined,
    start: { dateTime: rdv.debut + ':00', timeZone: FUSEAU },
    end: { dateTime: ajouterMinutes(rdv.debut, rdv.duree) + ':00', timeZone: FUSEAU },
    extendedProperties: rdv.suivi ? { private: { suivi: rdv.suivi } } : undefined,
  };
}

/**
 * @param {{ fichier: string, fetch?: typeof fetch, urls?: typeof URLS_GOOGLE, env?: Record<string, string | undefined>, maintenant?: () => number }} options
 */
export function creerAgenda({ fichier, fetch: f = globalThis.fetch, urls = urlsGoogle(), env = process.env, maintenant = Date.now }) {
  /** @type {Map<string, { verifier: string, redirection: string, retour: string, expire: number }>} */
  const demandes = new Map();
  /** @type {{ jeton: string, expire: number } | null} */
  let acces = null;
  /** @type {Promise<string> | null} */
  let rafraichissement = null;

  const configure = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const exigerConfig = () => {
    if (!configure()) throw new ErreurSync('config', 'Google Agenda non configuré : renseigner GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans le fichier .env, puis relancer le serveur.');
  };
  const lireJeton = () => {
    try { return JSON.parse(readFileSync(fichier, 'utf8')); } catch { return null; }
  };
  // NOTE: écriture dans un fichier temporaire puis renommage, un arrêt brutal ne laisse jamais un jeton à moitié écrit
  const ecrireJeton = j => {
    mkdirSync(dirname(fichier), { recursive: true });
    const tmp = fichier + '.tmp';
    writeFileSync(tmp, JSON.stringify(j), { mode: 0o600 });
    renameSync(tmp, fichier);
    chmodSync(fichier, 0o600);
  };
  const oublier = () => {
    acces = null;
    rmSync(fichier, { force: true });
  };

  async function appeler(url, options = {}) {
    try {
      return await f(url, { ...options, signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      const motif = e.name === 'TimeoutError' ? 'délai dépassé' : (e.cause?.code ?? e.message);
      throw new ErreurSync('reseau', `Google injoignable (${motif}).`);
    }
  }

  async function demanderJeton(parametres) {
    const r = await appeler(urls.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: String(env.GOOGLE_CLIENT_ID), client_secret: String(env.GOOGLE_CLIENT_SECRET), ...parametres }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.access_token) return d;
    if (d.error === 'invalid_client' || d.error === 'unauthorized_client') throw new ErreurSync('config', 'Identifiants Google refusés : vérifier GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans le .env.');
    if (d.error === 'invalid_grant') throw new ErreurSync('auth', 'invalid_grant');
    if (!r.ok) throw new ErreurSync('http', `Google a répondu ${r.status} à la demande de jeton.`);
    throw new ErreurSync('format', 'Réponse de Google inattendue (jeton absent).');
  }

  // ANCHOR: jeton d'accès gardé en mémoire et renouvelé une minute avant expiration, un seul renouvellement à la fois
  async function jetonAcces() {
    if (acces && acces.expire > maintenant() + 60_000) return acces.jeton;
    if (rafraichissement) return rafraichissement;
    rafraichissement = (async () => {
      exigerConfig();
      const j = lireJeton();
      if (!j?.refresh_token) throw new ErreurSync('auth', 'Google Agenda non connecté : cliquer sur Connecter dans Admin.');
      try {
        const d = await demanderJeton({ grant_type: 'refresh_token', refresh_token: j.refresh_token });
        acces = { jeton: d.access_token, expire: maintenant() + Number(d.expires_in ?? 3600) * 1000 };
        return acces.jeton;
      } catch (e) {
        // NOTE: accès retiré dans le compte Google ou jeton expiré : on oublie le jeton pour que l'interface propose de se reconnecter
        if (e instanceof ErreurSync && e.message === 'invalid_grant') {
          oublier();
          throw new ErreurSync('auth', 'Accès à Google Agenda retiré ou expiré : se reconnecter depuis Admin.');
        }
        throw e;
      } finally {
        rafraichissement = null;
      }
    })();
    return rafraichissement;
  }

  /** @param {string} chemin @param {{ method?: string, query?: Record<string, string> | null, body?: any }} [options] */
  async function api(chemin, { method = 'GET', query = null, body = undefined } = {}) {
    const url = urls.api + chemin + (query ? '?' + new URLSearchParams(query) : '');
    for (let essai = 0; ; essai++) {
      const jeton = await jetonAcces();
      const r = await appeler(url, { method, headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      // NOTE: jeton d'accès refusé avant son expiration prévue (révocation, horloge) : un seul nouvel essai avec un jeton neuf
      if (r.status === 401 && essai === 0) { acces = null; continue; }
      if (r.status === 204) return null;
      const d = await r.json().catch(() => null);
      if (r.ok) return d;
      const motif = d?.error?.message ? ` (${d.error.message})` : '';
      if (r.status === 401) throw new ErreurSync('auth', 'Google refuse le jeton : se reconnecter depuis Admin.');
      if (r.status === 403) throw new ErreurSync('auth', `Google refuse l'accès${motif}. Le calendrier doit vous appartenir.`);
      if (r.status === 404 || r.status === 410) throw new ErreurSync('introuvable', `Introuvable dans Google Agenda${motif}.`);
      throw new ErreurSync('http', `Google Agenda a répondu ${r.status}${motif}.`);
    }
  }

  // NOTE: parcourt toutes les pages d'une liste Google (nextPageToken), plafonnée pour ne jamais boucler sans fin
  async function toutesLesPages(chemin, query, max = 10) {
    const items = [];
    let page = '';
    for (let i = 0; i < max; i++) {
      const d = await api(chemin, { query: { ...query, ...(page ? { pageToken: page } : {}) } });
      items.push(...(d?.items ?? []));
      page = d?.nextPageToken ?? '';
      if (!page) break;
    }
    return items;
  }

  return {
    configure,
    etat() {
      const j = lireJeton();
      return { configure: configure(), connecte: Boolean(j?.refresh_token), depuis: j?.cree ?? '' };
    },

    // ANCHOR: adresse de la page de consentement Google ; state et code_verifier restent en mémoire 10 minutes
    urlConnexion({ redirection, retour }) {
      exigerConfig();
      const t = maintenant();
      for (const [k, v] of demandes) if (v.expire < t) demandes.delete(k);
      const state = base64url(randomBytes(24));
      const verifier = base64url(randomBytes(48));
      demandes.set(state, { verifier, redirection, retour, expire: t + DUREE_DEMANDE_MS });
      const p = new URLSearchParams({
        client_id: String(env.GOOGLE_CLIENT_ID), redirect_uri: redirection, response_type: 'code', scope: SCOPES.join(' '),
        access_type: 'offline', prompt: 'consent', state, code_challenge: base64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
      });
      return `${urls.auth}?${p}`;
    },

    // Retour de Google : vérifie state, échange le code contre les jetons et enregistre le jeton de rafraîchissement
    /** @param {{ state?: string | null, code?: string | null, erreur?: string | null }} retourGoogle */
    async echangerCode({ state, code, erreur }) {
      const d = demandes.get(state ?? '');
      if (state) demandes.delete(state);
      if (!d || d.expire < maintenant()) throw new ErreurSync('auth', 'Demande de connexion inconnue ou expirée : relancer la connexion depuis Admin.');
      const retour = d.retour;
      if (erreur) throw Object.assign(new ErreurSync('auth', erreur === 'access_denied' ? 'Connexion annulée dans Google.' : `Google a refusé la connexion (${erreur}).`), { retour });
      if (!code) throw Object.assign(new ErreurSync('format', 'Code de connexion absent.'), { retour });
      exigerConfig();
      let j;
      try {
        j = await demanderJeton({ grant_type: 'authorization_code', code, redirect_uri: d.redirection, code_verifier: d.verifier });
      } catch (e) {
        if (e instanceof ErreurSync && e.message === 'invalid_grant') e.message = 'Code de connexion refusé par Google : relancer la connexion.';
        throw Object.assign(e, { retour });
      }
      // NOTE: l'écran de Google permet de décocher une autorisation ; sans les deux, l'agenda ne peut pas fonctionner
      const accordes = String(j.scope ?? '').split(/\s+/);
      const manquants = SCOPES.filter(s => !accordes.includes(s));
      if (manquants.length) {
        await appeler(urls.revoke, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: j.refresh_token ?? j.access_token }) }).catch(() => {});
        throw Object.assign(new ErreurSync('auth', 'Autorisations incomplètes : cocher les deux cases (agendas et événements) sur la page de Google.'), { retour });
      }
      if (!j.refresh_token) throw Object.assign(new ErreurSync('auth', 'Google n\'a pas fourni de jeton durable : retirer l\'accès sur myaccount.google.com/connections puis se reconnecter.'), { retour });
      ecrireJeton({ refresh_token: j.refresh_token, scope: j.scope, cree: new Date(maintenant()).toISOString() });
      acces = { jeton: j.access_token, expire: maintenant() + Number(j.expires_in ?? 3600) * 1000 };
      return { retour };
    },

    // NOTE: révocation chez Google puis suppression du fichier, même si Google est injoignable (le jeton local disparaît toujours)
    async deconnecter() {
      const j = lireJeton();
      let revoque = false;
      if (j?.refresh_token) {
        try {
          const r = await appeler(urls.revoke, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: j.refresh_token }) });
          revoque = r.ok || r.status === 400;
        } catch { /* ANCHOR: hors ligne, l'accès reste visible sur myaccount.google.com/connections */ }
      }
      oublier();
      return { revoque };
    },

    async calendriers() {
      const items = await toutesLesPages('/users/me/calendarList', { minAccessRole: 'owner', maxResults: '250' });
      return items.map(c => ({ id: String(c.id), nom: c.summaryOverride || c.summary || c.id, principal: Boolean(c.primary), couleur: c.backgroundColor ?? '', fuseau: c.timeZone ?? '' }));
    },

    // Événements d'un calendrier entre deux jours inclus (heure de Paris), occurrences récurrentes dépliées, dans l'ordre chronologique
    async evenements(calendrier, du, au) {
      const lendemain = new Date(Date.parse(au + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10);
      const items = await toutesLesPages(`/calendars/${encodeURIComponent(calendrier)}/events`, {
        timeMin: debutJourParis(du), timeMax: debutJourParis(lendemain), singleEvents: 'true', orderBy: 'startTime', maxResults: '250', timeZone: FUSEAU,
      }, 4);
      return items.filter(e => e.status !== 'cancelled').map(versEvenement);
    },

    async evenement(calendrier, id) {
      return versEvenement(await api(`/calendars/${encodeURIComponent(calendrier)}/events/${encodeURIComponent(id)}`));
    },
    async creer(calendrier, rdv) {
      return versEvenement(await api(`/calendars/${encodeURIComponent(calendrier)}/events`, { method: 'POST', body: corpsEvenement(rdv) }));
    },
    // NOTE: PATCH, seuls les champs envoyés changent (une note ajoutée dans Google est conservée)
    async modifier(calendrier, id, champs) {
      return versEvenement(await api(`/calendars/${encodeURIComponent(calendrier)}/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: champs }));
    },
    // NOTE: un événement déjà supprimé dans Google (404 ou 410) compte comme supprimé
    async supprimer(calendrier, id) {
      try {
        await api(`/calendars/${encodeURIComponent(calendrier)}/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (e) {
        if (!(e instanceof ErreurSync && e.code === 'introuvable')) throw e;
      }
      return true;
    },
  };
}
