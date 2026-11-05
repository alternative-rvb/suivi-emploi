// Tests de Google Agenda (ligne 120) : OAuth avec PKCE, jeton renouvelé et révoqué, calendriers, événements, écritures, routes du serveur.
// Aucun appel à Google : faux fetch pour le module, faux serveur Google (AGENDA_URL_TEST) pour les routes. Données fictives uniquement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ajouterMinutes, corpsEvenement, creerAgenda, debutJourParis, decalageParis, SCOPES } from '../lib/agenda/google.mjs';
import { serveurTemporaire } from './serveur-temporaire.mjs';

const ENV = { GOOGLE_CLIENT_ID: 'id-fictif.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret-fictif' };
const URLS = { auth: 'https://g.test/auth', token: 'https://g.test/token', revoke: 'https://g.test/revoke', api: 'https://g.test/calendar/v3' };
// NOTE: prédicat d'erreur typé (assert.rejects passe un unknown)
const si = f => (/** @type {any} */ e) => f(e);
const dossierTemp = () => mkdtempSync(join(tmpdir(), 'suivi-agenda-'));
const reponse = (statut, corps) => new Response(corps === undefined ? null : JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

// ANCHOR: faux Google : chaque appel est noté, la réponse vient d'une fonction choisie par le test (route = méthode et chemin)
function fauxFetch(routes) {
  const appels = [];
  const f = async (url, options = {}) => {
    const u = new URL(url);
    const appel = { methode: options.method ?? 'GET', chemin: u.pathname, query: u.searchParams, corps: options.body, entetes: options.headers ?? {} };
    appels.push(appel);
    const route = routes[`${appel.methode} ${u.pathname}`];
    if (!route) throw new Error(`route non prévue : ${appel.methode} ${u.pathname}`);
    return route(appel);
  };
  return { fetch: f, appels };
}

const jetonsOk = (extra = {}) => () => reponse(200, { access_token: 'acces-1', expires_in: 3600, refresh_token: 'rafraichir-1', scope: SCOPES.join(' '), ...extra });

// NOTE: parcours complet de connexion avec le faux fetch, renvoie l'agenda connecté
async function connecter(agenda) {
  const url = new URL(agenda.urlConnexion({ redirection: 'http://127.0.0.1:3000/api/agenda/retour', retour: 'http://localhost:5173' }));
  return agenda.echangerCode({ state: url.searchParams.get('state'), code: 'code-1' });
}

test('dates : décalage de Paris en été et en hiver, minutes ajoutées sans fuseau', () => {
  assert.equal(decalageParis('2026-07-01'), '+02:00');
  assert.equal(decalageParis('2026-12-01'), '+01:00');
  assert.equal(debutJourParis('2026-12-01'), '2026-12-01T00:00:00+01:00');
  assert.equal(ajouterMinutes('2026-10-23T23:30', 45), '2026-10-24T00:15');
  const c = corpsEvenement({ titre: 'Entretien ClientABC', debut: '2026-11-02T09:30', duree: 60, lieu: '', lien_visio: 'https://visio.example.com/x', description: '', suivi: 'rdv-1' });
  assert.deepEqual(c.start, { dateTime: '2026-11-02T09:30:00', timeZone: 'Europe/Paris' });
  assert.deepEqual(c.end, { dateTime: '2026-11-02T10:30:00', timeZone: 'Europe/Paris' });
  assert.equal(c.extendedProperties.private.suivi, 'rdv-1');
  assert.match(c.description, /visio\.example\.com/);
  assert.equal(c.location, undefined);
});

test('connexion : non configuré, PKCE et state, jeton enregistré en mode 600, state rejoué refusé', async () => {
  const dir = dossierTemp();
  try {
    const fichier = join(dir, 'data', 'google-agenda.json');
    const sans = creerAgenda({ fichier, env: {}, urls: URLS, fetch: fauxFetch({}).fetch });
    assert.equal(sans.etat().configure, false);
    assert.throws(() => sans.urlConnexion({ redirection: 'x', retour: '' }), si(e => e.code === 'config'));

    const g = fauxFetch({ 'POST /token': jetonsOk() });
    const agenda = creerAgenda({ fichier, env: ENV, urls: URLS, fetch: g.fetch });
    const url = new URL(agenda.urlConnexion({ redirection: 'http://127.0.0.1:3000/api/agenda/retour', retour: 'http://localhost:5173' }));
    const p = url.searchParams;
    assert.equal(url.origin + url.pathname, URLS.auth);
    assert.equal(p.get('access_type'), 'offline');
    assert.equal(p.get('code_challenge_method'), 'S256');
    assert.equal(p.get('scope'), SCOPES.join(' '));
    assert.ok(p.get('state').length >= 30);

    await assert.rejects(agenda.echangerCode({ state: 'inconnu', code: 'x' }), si(e => e.code === 'auth' && /inconnue ou expirée/.test(e.message)));
    const r = await agenda.echangerCode({ state: p.get('state'), code: 'code-1' });
    assert.equal(r.retour, 'http://localhost:5173');
    // NOTE: le code_verifier envoyé correspond bien au code_challenge de la page de consentement
    const corps = new URLSearchParams(g.appels.at(-1).corps);
    assert.equal(corps.get('grant_type'), 'authorization_code');
    assert.equal(createHash('sha256').update(corps.get('code_verifier')).digest('base64url'), p.get('code_challenge'));
    assert.equal(corps.get('redirect_uri'), 'http://127.0.0.1:3000/api/agenda/retour');

    assert.equal(statSync(fichier).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(fichier, 'utf8')).refresh_token, 'rafraichir-1');
    assert.equal(agenda.etat().connecte, true);
    await assert.rejects(agenda.echangerCode({ state: p.get('state'), code: 'code-1' }), si(e => e.code === 'auth'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('connexion : annulée, autorisation décochée (révoquée, rien enregistré), sans jeton durable', async () => {
  const dir = dossierTemp();
  try {
    const fichier = join(dir, 'google-agenda.json');
    const annulee = creerAgenda({ fichier, env: ENV, urls: URLS, fetch: fauxFetch({}).fetch });
    const u = new URL(annulee.urlConnexion({ redirection: 'r', retour: 'http://localhost:3000' }));
    await assert.rejects(annulee.echangerCode({ state: u.searchParams.get('state'), erreur: 'access_denied' }), si(e => /annulée/.test(e.message) && e.retour === 'http://localhost:3000'));

    const g = fauxFetch({ 'POST /token': jetonsOk({ scope: SCOPES[0] }), 'POST /revoke': () => reponse(200, {}) });
    const partiel = creerAgenda({ fichier, env: ENV, urls: URLS, fetch: g.fetch });
    await assert.rejects(connecter(partiel), si(e => /deux cases/.test(e.message)));
    assert.ok(g.appels.some(a => a.chemin === '/revoke'));
    assert.equal(existsSync(fichier), false);

    const sansDurable = creerAgenda({ fichier, env: ENV, urls: URLS, fetch: fauxFetch({ 'POST /token': jetonsOk({ refresh_token: undefined }) }).fetch });
    await assert.rejects(connecter(sansDurable), si(e => /jeton durable/.test(e.message)));
    assert.equal(existsSync(fichier), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('jeton : renouvelé à expiration une seule fois pour des appels simultanés, 401 retenté, invalid_grant oublie le jeton', async () => {
  const dir = dossierTemp();
  try {
    const fichier = join(dir, 'google-agenda.json');
    let horloge = Date.parse('2026-10-23T08:00:00Z');
    let renouvellements = 0;
    let refus = 1;
    const g = fauxFetch({
      'POST /token': a => {
        if (new URLSearchParams(a.corps).get('grant_type') === 'authorization_code') return jetonsOk()();
        renouvellements++;
        return reponse(200, { access_token: `acces-r${renouvellements}`, expires_in: 3600 });
      },
      'GET /calendar/v3/users/me/calendarList': a => {
        if (a.entetes.Authorization === 'Bearer acces-r1' && refus-- > 0) return reponse(401, { error: { message: 'Invalid Credentials' } });
        return reponse(200, { items: [{ id: 'cal-1', summary: 'Recherche', accessRole: 'owner' }] });
      },
    });
    const agenda = creerAgenda({ fichier, env: ENV, urls: URLS, fetch: g.fetch, maintenant: () => horloge });
    await connecter(agenda);
    await agenda.calendriers();
    assert.equal(renouvellements, 0);

    horloge += 3600_000;
    const [a, b] = await Promise.all([agenda.calendriers(), agenda.calendriers()]);
    assert.equal(a[0].id, 'cal-1');
    assert.equal(b[0].id, 'cal-1');
    // NOTE: un renouvellement commun aux deux appels, puis un second après le 401 du premier jeton neuf
    assert.equal(renouvellements, 2);

    const revoque = creerAgenda({ fichier, env: ENV, urls: URLS, fetch: fauxFetch({ 'POST /token': () => reponse(400, { error: 'invalid_grant' }) }).fetch });
    await assert.rejects(revoque.calendriers(), si(e => e.code === 'auth' && /se reconnecter/.test(e.message)));
    assert.equal(existsSync(fichier), false);
    assert.equal(revoque.etat().connecte, false);

    const client = creerAgenda({ fichier, env: ENV, urls: URLS, fetch: fauxFetch({ 'POST /token': () => reponse(401, { error: 'invalid_client' }) }).fetch });
    await assert.rejects(connecter(client), si(e => e.code === 'config'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendriers et événements : pages suivies, bornes en heure de Paris, annulés écartés, visio et suivi lus', async () => {
  const dir = dossierTemp();
  try {
    const g = fauxFetch({
      'POST /token': jetonsOk(),
      'GET /calendar/v3/users/me/calendarList': a => (a.query.get('pageToken')
        ? reponse(200, { items: [{ id: 'cal-2', summary: 'Recherche emploi', summaryOverride: 'Recherche', backgroundColor: '#16a765' }] })
        : reponse(200, { items: [{ id: 'moi@example.com', summary: 'moi@example.com', primary: true }], nextPageToken: 'p2' })),
      'GET /calendar/v3/calendars/cal-2/events': () => reponse(200, {
        items: [
          { id: 'e1', summary: 'Entretien ClientABC', start: { dateTime: '2026-10-26T09:30:00+01:00' }, end: { dateTime: '2026-10-26T10:30:00+01:00' }, location: 'Villeneuve', hangoutLink: 'https://meet.google.com/abc', htmlLink: 'https://www.google.com/calendar/event?eid=e1', extendedProperties: { private: { suivi: 'rdv-1' } } },
          { id: 'e2', status: 'cancelled', start: { dateTime: '2026-10-27T09:00:00+01:00' } },
          { id: 'e3', summary: 'Salon de l\'emploi', start: { date: '2026-10-28' }, end: { date: '2026-10-29' } },
        ],
      }),
    });
    const agenda = creerAgenda({ fichier: join(dir, 'g.json'), env: ENV, urls: URLS, fetch: g.fetch });
    await connecter(agenda);
    const cals = await agenda.calendriers();
    assert.deepEqual(cals.map(c => [c.id, c.nom, c.principal]), [['moi@example.com', 'moi@example.com', true], ['cal-2', 'Recherche', false]]);
    assert.equal(g.appels.find(a => a.chemin.endsWith('calendarList')).query.get('minAccessRole'), 'owner');

    const ev = await agenda.evenements('cal-2', '2026-10-23', '2026-11-05');
    const q = g.appels.find(a => a.chemin.endsWith('/events')).query;
    assert.equal(q.get('timeMin'), '2026-10-23T00:00:00+02:00');
    assert.equal(q.get('timeMax'), '2026-11-06T00:00:00+01:00');
    assert.equal(q.get('singleEvents'), 'true');
    assert.deepEqual(ev.map(e => e.id), ['e1', 'e3']);
    assert.equal(ev[0].visio, 'https://meet.google.com/abc');
    assert.equal(ev[0].suivi, 'rdv-1');
    assert.equal(ev[1].journee, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('écritures : création avec suivi, suppression déjà faite dans Google acceptée, déconnexion même hors ligne', async () => {
  const dir = dossierTemp();
  try {
    const fichier = join(dir, 'g.json');
    let horsLigne = false;
    const g = fauxFetch({
      'POST /token': jetonsOk(),
      'POST /calendar/v3/calendars/cal-2/events': a => reponse(200, { id: 'nouveau', ...JSON.parse(a.corps) }),
      'DELETE /calendar/v3/calendars/cal-2/events/parti': () => reponse(410, { error: { message: 'Resource has been deleted' } }),
      'DELETE /calendar/v3/calendars/cal-2/events/refus': () => reponse(403, { error: { message: 'Forbidden' } }),
      'POST /revoke': () => { if (horsLigne) throw new TypeError('fetch failed'); return reponse(200, {}); },
    });
    const agenda = creerAgenda({ fichier, env: ENV, urls: URLS, fetch: g.fetch });
    await connecter(agenda);
    const e = await agenda.creer('cal-2', { titre: 'Entretien ClientABC', debut: '2026-11-02T14:00', duree: 45, suivi: 'rdv-9' });
    assert.equal(e.id, 'nouveau');
    assert.equal(e.suivi, 'rdv-9');
    assert.equal(JSON.parse(g.appels.at(-1).corps).end.dateTime, '2026-11-02T14:45:00');
    assert.equal(await agenda.supprimer('cal-2', 'parti'), true);
    await assert.rejects(agenda.supprimer('cal-2', 'refus'), si(err => err.code === 'auth'));

    assert.deepEqual(await agenda.deconnecter(), { revoque: true });
    assert.equal(existsSync(fichier), false);
    await connecter(agenda);
    horsLigne = true;
    assert.deepEqual(await agenda.deconnecter(), { revoque: false });
    assert.equal(existsSync(fichier), false);
    await assert.rejects(agenda.calendriers(), si(err => err.code === 'auth' && /non connecté/.test(err.message)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ANCHOR: faux serveur Google pour les routes : le serveur de l'app y est branché par AGENDA_URL_TEST
async function fauxGoogle() {
  const evenements = [{ id: 'e1', summary: 'Entretien ClientABC', start: { dateTime: '2026-10-26T09:30:00+01:00' }, end: { dateTime: '2026-10-26T10:30:00+01:00' } }];
  const compteur = { events: 0, revoke: 0 };
  const serveur = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const envoyer = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/token') return envoyer(200, { access_token: 'acces', expires_in: 3600, refresh_token: 'rafraichir', scope: SCOPES.join(' ') });
    if (u.pathname === '/revoke') { compteur.revoke++; return envoyer(200, {}); }
    if (u.pathname === '/calendar/v3/users/me/calendarList') return envoyer(200, { items: [{ id: 'cal-2', summary: 'Recherche' }] });
    if (u.pathname === '/calendar/v3/calendars/cal-2/events') { compteur.events++; return envoyer(200, { items: evenements }); }
    envoyer(404, { error: { message: 'inconnu' } });
  });
  await new Promise(ok => serveur.listen(0, '127.0.0.1', () => ok(null)));
  // @ts-ignore adresse d'un serveur TCP
  return { url: `http://127.0.0.1:${serveur.address().port}`, serveur, compteur };
}

test('routes : connexion par navigation, retour vers l\'interface, choix du calendrier, événements en cache, déconnexion', async () => {
  const dir = dossierTemp();
  const google = await fauxGoogle();
  const { url, proc, port } = await serveurTemporaire(dir, { ...ENV, AGENDA_URL_TEST: google.url });
  try {
    const get = (chemin, init) => fetch(url + chemin, { redirect: 'manual', ...init });
    const lire = async (chemin, init) => (await get(chemin, init)).json();
    assert.deepEqual(await lire('/api/agenda'), { configure: true, connecte: false, depuis: '', calendrier_id: '', calendrier_nom: '' });
    assert.equal((await get('/api/agenda/calendriers')).status, 401);

    const r1 = await get('/api/agenda/connexion?retour=' + encodeURIComponent('http://localhost:5173'));
    assert.equal(r1.status, 302);
    const consentement = new URL(r1.headers.get('location'));
    assert.equal(consentement.origin, google.url);
    assert.equal(consentement.searchParams.get('redirect_uri'), `http://127.0.0.1:${port}/api/agenda/retour`);

    // NOTE: un state inconnu et une origine de retour étrangère ramènent vers ce serveur, avec le message d'erreur
    const faux = await get('/api/agenda/retour?state=pirate&code=x');
    assert.equal(faux.status, 302);
    assert.match(faux.headers.get('location'), new RegExp(`^http://localhost:${port}/\\?agenda_erreur=.+#admin$`));
    const etrangere = await get('/api/agenda/connexion?retour=' + encodeURIComponent('https://example.com'));
    const retourEtranger = await get(`/api/agenda/retour?state=${new URL(etrangere.headers.get('location')).searchParams.get('state')}&code=x`);
    assert.equal(retourEtranger.headers.get('location'), `http://localhost:${port}/?agenda=connecte#admin`);

    const r2 = await get(`/api/agenda/retour?state=${consentement.searchParams.get('state')}&code=code-1`);
    assert.equal(r2.headers.get('location'), 'http://localhost:5173/?agenda=connecte#admin');
    assert.equal((await lire('/api/agenda')).connecte, true);
    assert.equal(statSync(join(dir, 'data', 'google-agenda.json')).mode & 0o777, 0o600);

    assert.equal((await get('/api/agenda/evenements')).status, 409);
    const put = (corps) => get('/api/agenda', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    assert.equal((await put({ calendrier_id: 'pas-a-moi' })).status, 400);
    assert.equal((await put({})).status, 400);
    const choisi = await (await put({ calendrier_id: 'cal-2' })).json();
    assert.equal(choisi.calendrier_nom, 'Recherche');

    assert.equal((await get('/api/agenda/evenements?du=2026-10-30&au=2026-10-01')).status, 400);
    const ev = await lire('/api/agenda/evenements?du=2026-10-23&au=2026-11-05');
    assert.deepEqual(ev.evenements.map(e => e.titre), ['Entretien ClientABC']);
    await lire('/api/agenda/evenements?du=2026-10-23&au=2026-11-05');
    assert.equal(google.compteur.events, 1);
    await lire('/api/agenda/evenements?du=2026-10-23&au=2026-11-05&frais=1');
    assert.equal(google.compteur.events, 2);

    const fin = await lire('/api/agenda/deconnexion', { method: 'POST' });
    assert.equal(fin.connecte, false);
    assert.equal(fin.revoque, true);
    // NOTE: le choix du calendrier est gardé pour une reconnexion au même compte
    assert.equal(fin.calendrier_id, 'cal-2');
    assert.equal(existsSync(join(dir, 'data', 'google-agenda.json')), false);
    assert.equal((await get('/api/agenda/evenements')).status, 401);
  } finally {
    proc.kill();
    google.serveur.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
