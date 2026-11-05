// Tests de l'API La Bonne Boite et du jeton partagé, avec un faux fetch. Aucun appel réseau réel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveurTemporaire } from './serveur-temporaire.mjs';

process.env.FT_BB_PAUSE_MS = '0';
process.env.FT_CLIENT_ID = 'id-test';
process.env.FT_CLIENT_SECRET = 'secret-test';

const { chercherEntreprises, distanceKm, normaliserEntreprise, scopeBonneBoite, viderCacheBonneBoite } = await import('../lib/bonneboite.mjs');
const { jetonFranceTravail, viderCacheJetons } = await import('../lib/ft-jeton.mjs');

const json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
const BRUTE = { rome: 'M1805', siret: '11111111100011', company_name: 'EntrepriseABC', headcount_min: 100, headcount_max: 199, naf_label: 'Edition de logiciels', location: { lat: 43.3427, lon: 5.44257 }, city: 'Marseille', postcode: '13013', department_number: '13', hiring_potential: 7.2985, is_high_potential: false, email: 'yes' };
const POINT = { rome: 'M1805', lat: 43.2927, lon: 5.5708, distance: 30 };

// Faux fetch : jeton (réponse réglable), puis une réponse pour la recherche
function avec(recherche, test_, jeton = () => json({ access_token: 'jeton', expires_in: 3600 })) {
  const appels = { jeton: [], recherche: [] };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('access_token')) { appels.jeton.push(String(opts.body)); return jeton(); }
    appels.recherche.push(String(url));
    return recherche(String(url));
  };
  process.env.FT_SCOPE_BONNEBOITE = 'api_labonneboitev2';
  viderCacheBonneBoite();
  viderCacheJetons();
  return Promise.resolve(test_(appels)).finally(() => { globalThis.fetch = original; delete process.env.FT_SCOPE_BONNEBOITE; });
}

test('scope : absent désactive, un scope seul est complété par search et office', () => {
  assert.equal(scopeBonneBoite({}), null);
  assert.equal(scopeBonneBoite({ FT_SCOPE_BONNEBOITE: 'api_labonneboitev2' }), 'api_labonneboitev2 search office');
  assert.equal(scopeBonneBoite({ FT_SCOPE_BONNEBOITE: 'api_labonneboitev2 search office' }), 'api_labonneboitev2 search office');
});

test('distance à vol d\'oiseau : Aubagne vers Marseille environ 17 km', () => {
  const d = distanceKm({ lat: 43.2927, lon: 5.5708 }, { lat: 43.2965, lon: 5.3698 });
  assert.ok(d > 12 && d < 22, String(d));
});

test('normalisation : champs gardés, aucun champ brut inconnu', () => {
  const e = normaliserEntreprise(BRUTE, { lat: 43.2927, lon: 5.5708 });
  assert.equal(e.nom, 'EntrepriseABC');
  assert.equal(e.effectif, '100 à 199');
  assert.equal(e.potentiel, 7.3);
  assert.equal(e.departement, '13');
  assert.ok(e.distance_km > 0);
  assert.equal('email' in e, false);
  assert.equal(normaliserEntreprise({ company_name: 'X' }, null).lat, null);
});

test('recherche : scopes complets au jeton, paramètres de l\'URL, résultat normalisé', () => avec(() => json({ hits: 8, items: [BRUTE] }), async appels => {
  const r = await chercherEntreprises(POINT);
  assert.equal(r.total, 8);
  assert.equal(r.entreprises.length, 1);
  assert.match(appels.jeton[0], /scope=api_labonneboitev2\+search\+office/);
  assert.match(appels.recherche[0], /rome=M1805/);
  assert.match(appels.recherche[0], /distance=30/);
}));

test('recherche : un deuxième appel identique vient du cache, un autre rayon refait la requête', () => avec(() => json({ hits: 1, items: [BRUTE] }), async appels => {
  await chercherEntreprises(POINT);
  await chercherEntreprises(POINT);
  assert.equal(appels.recherche.length, 1);
  await chercherEntreprises({ ...POINT, distance: 50 });
  assert.equal(appels.recherche.length, 2);
  assert.equal(appels.jeton.length, 1, 'le jeton est réutilisé');
}));

test('recherche : sans scope, erreur de configuration ; code ROME invalide, erreur de format', async () => {
  delete process.env.FT_SCOPE_BONNEBOITE;
  await assert.rejects(chercherEntreprises(POINT), (/** @type {any} */ e) => e.code === 'config' && /FT_SCOPE_BONNEBOITE/.test(e.message));
  process.env.FT_SCOPE_BONNEBOITE = 'api_labonneboitev2';
  try {
    await assert.rejects(chercherEntreprises({ ...POINT, rome: 'abc' }), (/** @type {any} */ e) => e.code === 'format');
    await assert.rejects(chercherEntreprises({ ...POINT, lat: NaN }), (/** @type {any} */ e) => e.code === 'format');
  } finally { delete process.env.FT_SCOPE_BONNEBOITE; }
});

test('recherche : 403 du service, 429, 500 et réponse illisible ont chacun leur erreur', async () => {
  await avec(() => new Response('Invalid scope', { status: 403 }), () => assert.rejects(chercherEntreprises(POINT), (/** @type {any} */ e) => e.code === 'auth' && /ajoutée/.test(e.message)));
  await avec(() => json({}, 429), () => assert.rejects(chercherEntreprises(POINT), (/** @type {any} */ e) => e.code === 'http' && /trop d'appels/.test(e.message)));
  await avec(() => json({}, 500), () => assert.rejects(chercherEntreprises(POINT), (/** @type {any} */ e) => e.code === 'http' && /500/.test(e.message)));
  await avec(() => json({ autre: 1 }), () => assert.rejects(chercherEntreprises(POINT), (/** @type {any} */ e) => e.code === 'format'));
  await avec(() => new Response(null, { status: 204 }), async () => assert.deepEqual(await chercherEntreprises(POINT), { total: 0, entreprises: [] }));
});

test('jeton : invalid_scope se distingue de invalid_client', async () => {
  await avec(() => json({}), () => assert.rejects(chercherEntreprises(POINT), (/** @type {any} */ e) => e.code === 'auth' && /non abonnée à l'API La Bonne Boite/.test(e.message)), () => json({ error: 'invalid_scope' }, 400));
  await avec(() => json({}), () => assert.rejects(chercherEntreprises(POINT), (/** @type {any} */ e) => e.code === 'auth' && /Clés France Travail refusées/.test(e.message)), () => json({ error: 'invalid_client' }, 401));
});

test('jeton : réseau coupé, erreur réseau ; sans clés, erreur de configuration', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } }); };
  viderCacheJetons();
  try {
    await assert.rejects(jetonFranceTravail('s'), (/** @type {any} */ e) => e.code === 'reseau' && /ECONNREFUSED/.test(e.message));
  } finally { globalThis.fetch = original; }
  const id = process.env.FT_CLIENT_ID;
  delete process.env.FT_CLIENT_ID;
  try {
    await assert.rejects(jetonFranceTravail('s'), (/** @type {any} */ e) => e.code === 'config');
  } finally { process.env.FT_CLIENT_ID = id; }
});

test('route : sans scope, fonction désactivée (200 actif false) ; sans point de départ, 400 clair', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-bb-'));
  const { url, proc } = await serveurTemporaire(dir);
  try {
    const r = await fetch(url + '/api/entreprises?rome=M1805');
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { actif: false, total: 0, entreprises: [] });
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
  const dir2 = mkdtempSync(join(tmpdir(), 'suivi-bb-'));
  const s2 = await serveurTemporaire(dir2, { FT_SCOPE_BONNEBOITE: 'api_labonneboitev2' });
  try {
    const r = await fetch(s2.url + '/api/entreprises?rome=M1805');
    assert.equal(r.status, 400);
    assert.match((await r.json()).erreur, /point de départ/);
  } finally { s2.proc.kill(); rmSync(dir2, { recursive: true, force: true }); }
});

test('suivi des entreprises : statut par SIRET, retrait, validation et journal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-bb-'));
  const { url, proc } = await serveurTemporaire(dir);
  const put = (siret, corps) => fetch(`${url}/api/entreprises/suivi/${siret}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  try {
    assert.deepEqual((await (await fetch(url + '/api/entreprises/suivi')).json()), { suivi: {} });
    const ok = await put('11111111100011', { statut: 'gardee', nom: 'EntrepriseABC', ville: 'Marseille' });
    assert.equal(ok.status, 200);
    await put('11111111100011', { statut: 'contactee' });
    const { suivi } = await (await fetch(url + '/api/entreprises/suivi')).json();
    assert.equal(suivi['11111111100011'].statut, 'contactee');
    assert.equal(suivi['11111111100011'].nom, 'EntrepriseABC', 'le nom déjà connu est conservé');
    assert.equal((await put('abc', { statut: 'gardee' })).status, 400);
    assert.equal((await put('11111111100011', { statut: 'nimporte' })).status, 400);
    await put('11111111100011', { statut: null });
    assert.deepEqual((await (await fetch(url + '/api/entreprises/suivi')).json()), { suivi: {} });
    const journal = await (await fetch(url + '/api/journal?entite=entreprise')).json();
    assert.ok(JSON.stringify(journal).includes('contactee'), 'les changements de statut sont journalisés');
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('recherche : un 429 est retenté une fois, puis la réponse suivante est utilisée', () => {
  let n = 0;
  return avec(() => (++n === 1 ? json({}, 429) : json({ hits: 1, items: [BRUTE] })), async appels => {
    const r = await chercherEntreprises(POINT);
    assert.equal(r.entreprises.length, 1);
    assert.equal(appels.recherche.length, 2);
  });
});
