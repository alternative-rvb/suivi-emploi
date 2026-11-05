// Tests du provider France Travail et de la synchro, avec un faux fetch et une base en mémoire. Aucun appel réseau réel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.FT_PAUSE_MS = '0';
process.env.FT_CLIENT_ID = 'id-test';
process.env.FT_CLIENT_SECRET = 'secret-test';

const { default: ft, verifierEnLigne } = await import('../lib/providers/france-travail.mjs');
const { lancerSync, ErreurSync } = await import('../lib/sync.mjs');
const { ouvrirBase } = await import('../lib/offres.mjs');

const CONFIG = { mots_cles: ['comptable'], zones: ['83'], contrats_exclus: ['FRA'], entreprises: [], mots_exclus: [] };
const aujourdhui = new Date().toISOString().slice(0, 10);
const brute = (id, extra = {}) => ({ id, intitule: 'Comptable (H/F)', entreprise: { nom: 'ClientABC' }, lieuTravail: { libelle: '83 - Villeneuve' }, typeContrat: 'CDI', typeContratLibelle: 'CDI', dateCreation: aujourdhui, description: 'Texte', ...extra });
const json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

// Faux fetch : jeton accepté, puis une réponse par appel de recherche (fonction ou Response)
function fauxFetch(recherche, token = (/** @type {any} */ _o) => json({ access_token: 'jeton' })) {
  const appels = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('access_token')) return token(opts);
    appels.push(String(url));
    return recherche(String(url), appels.length);
  };
  return { appels, restaurer: () => { globalThis.fetch = original; } };
}
const avec = async (recherche, test_, token) => {
  const f = fauxFetch(recherche, token);
  try { return await test_(f.appels); } finally { f.restaurer(); }
};

test('provider : renvoie les offres au format de la veille', () => avec(() => json({ resultats: [brute('111AAAA', { salaire: { libelle: 'Mensuel de 2000 Euros à 2400 Euros' } })] }), async () => {
  const r = await ft.recuperer({ config: CONFIG });
  assert.equal(r.offres.length, 1);
  assert.equal(r.offres[0].id_offre, '111AAAA');
  assert.equal(r.offres[0].lieu, '83 - Villeneuve');
  assert.equal(r.offres[0].salaire, '26400');
  assert.equal(r.offres[0].description, 'Texte');
}));

test('provider : sans configuration de veille, erreur de configuration claire', async () => {
  await assert.rejects(ft.recuperer({ config: null }), (/** @type {any} */ e) => e instanceof ErreurSync && e.code === 'config');
});

test('provider : sans clés France Travail, erreur de configuration', async () => {
  const [id, secret] = [process.env.FT_CLIENT_ID, process.env.FT_CLIENT_SECRET];
  delete process.env.FT_CLIENT_ID;
  delete process.env.FT_CLIENT_SECRET;
  try {
    await assert.rejects(ft.recuperer({ config: CONFIG }), (/** @type {any} */ e) => e.code === 'config' && /FT_CLIENT_ID/.test(e.message));
  } finally {
    process.env.FT_CLIENT_ID = id;
    process.env.FT_CLIENT_SECRET = secret;
  }
});

test('provider : clés refusées, erreur auth', () => avec(() => json({}), async () => {
  await assert.rejects(ft.recuperer({ config: CONFIG }), (/** @type {any} */ e) => e.code === 'auth');
}, () => json({ error: 'invalid_client' }, 401)));

test('provider : jeton refusé pendant la recherche, erreur auth (arrête tout)', () => avec(() => json({}, 401), async appels => {
  await assert.rejects(ft.recuperer({ config: { ...CONFIG, zones: ['83', '13'] } }), (/** @type {any} */ e) => e.code === 'auth');
  assert.equal(appels.length, 1);
}));

test('provider : réseau coupé, erreur reseau', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
  try {
    await assert.rejects(ft.recuperer({ config: CONFIG }), (/** @type {any} */ e) => e.code === 'reseau' && /ENOTFOUND/.test(e.message));
  } finally { globalThis.fetch = original; }
});

test('provider : un 429 est réessayé une fois', () => avec((u, n) => (n === 1 ? json({}, 429) : json({ resultats: [brute('111AAAA')] })), async () => {
  const r = await ft.recuperer({ config: CONFIG });
  assert.equal(r.offres.length, 1);
}));

test('provider : 204 sans corps, aucune offre sans planter', () => avec(() => new Response(null, { status: 204 }), async () => {
  const r = await ft.recuperer({ config: CONFIG });
  assert.deepEqual(r.offres, []);
}));

test('provider : réponse illisible sur toutes les recherches, erreur explicite', () => avec(() => new Response('<html>', { status: 200 }), async () => {
  await assert.rejects(ft.recuperer({ config: CONFIG }), (/** @type {any} */ e) => /Aucune recherche/.test(e.message));
}));

test('provider : une recherche en échec n\'empêche pas les autres', () => avec((u, n) => (n === 1 ? json({}, 500) : json({ resultats: [brute('222BBBB')] })), async () => {
  const r = await ft.recuperer({ config: { ...CONFIG, mots_cles: ['comptable', 'assistant comptable'] } });
  assert.deepEqual(r.offres.map(o => o.id_offre), ['222BBBB']);
}));

test('provider : pagination jusqu\'à une page incomplète', () => avec((u, n) => json({ resultats: n === 1 ? Array.from({ length: 150 }, (_, i) => brute('P' + i)) : [brute('PX')] }), async appels => {
  const r = await ft.recuperer({ config: CONFIG });
  assert.equal(r.offres.length, 151);
  assert.equal(appels.length, 2);
  assert.match(appels[1], /range=150-299/);
}));

test('provider : une offre trouvée par deux recherches n\'est gardée qu\'une fois', () => avec(() => json({ resultats: [brute('111AAAA')] }), async () => {
  const r = await ft.recuperer({ config: { ...CONFIG, mots_cles: ['comptable', 'comptable general'], zones: ['83', '13'] } });
  assert.equal(r.offres.length, 1);
}));

test('provider : contrats exclus et hors-sujet écartés, employeur surveillé gardé', () => avec(() => json({ resultats: [
  brute('OK1'),
  brute('FRA1', { typeContrat: 'FRA' }),
  brute('HS1', { intitule: 'Boulanger (H/F)' }),
  brute('SURV1', { intitule: 'Boulanger (H/F)', entreprise: { nom: 'Mairie de Villeneuve' } }),
] }), async () => {
  const r = await ft.recuperer({ config: { ...CONFIG, entreprises: ['mairie de villeneuve'] } });
  assert.deepEqual(r.offres.map(o => o.id_offre).sort(), ['OK1', 'SURV1']);
}));

test('provider : offre sans description ni salaire, valeurs vides sans erreur', () => avec(() => json({ resultats: [brute('111AAAA', { description: undefined, salaire: undefined })] }), async () => {
  const [o] = (await ft.recuperer({ config: CONFIG })).offres;
  assert.equal(o.description, '');
  assert.equal(o.salaire, null);
}));

// --- Synchro : une source qui plante ne doit jamais faire disparaître les offres déjà en base ---
function baseTemporaire() {
  const dossier = mkdtempSync(join(tmpdir(), 'suivi-test-'));
  const db = ouvrirBase(join(dossier, 'suivi.db'));
  return { db, dossier, nettoyer: () => { db.close(); rmSync(dossier, { recursive: true, force: true }); } };
}
const faux = (id, secours, recuperer) => ({ id, nom: id, secours, recuperer });
const ligne = (id, extra = {}) => ({ id_offre: id, titre: 'Comptable (H/F)', entreprise: 'ClientABC', lieu: '83 - Villeneuve', type_de_contrat: 'CDI', salaire: null, lien: '', date_de_detection: aujourdhui, description: 'Texte', ...extra });
const ok = (...offres) => async () => ({ date: 'x', offres, zones: ['83'], exclusions: [] });
const panne = (code = 'reseau') => async () => { throw new ErreurSync(code, 'panne simulée'); };
const nb = db => db.prepare('SELECT COUNT(*) n FROM offres').get().n;

test('synchro : toutes les sources en panne, erreur typée et offres conservées', async () => {
  const t = baseTemporaire();
  try {
    await lancerSync(t.db, t.dossier, 'test', [faux('a', false, ok(ligne('1AAAAAA'), ligne('2BBBBBB')))]);
    assert.equal(nb(t.db), 2);
    await assert.rejects(lancerSync(t.db, t.dossier, 'test', [faux('a', false, panne()), faux('b', true, panne('http'))]), (/** @type {any} */ e) => e instanceof ErreurSync);
    assert.equal(nb(t.db), 2);
  } finally { t.nettoyer(); }
});

test('synchro : le secours ne tourne que si le principal échoue, et signale l\'échec', async () => {
  const t = baseTemporaire();
  try {
    let secoursLance = 0;
    const secours = faux('s', true, async () => { secoursLance++; return { date: 'x', offres: [ligne('3CCCCCC')], zones: ['83'], exclusions: [] }; });
    await lancerSync(t.db, t.dossier, 'test', [faux('p', false, ok(ligne('1AAAAAA'))), secours]);
    assert.equal(secoursLance, 0);
    const r = await lancerSync(t.db, t.dossier, 'test', [faux('p', false, panne('auth')), secours]);
    assert.equal(secoursLance, 1);
    assert.equal(r.echecs.length, 1);
    assert.equal(r.echecs[0].code, 'auth');
    assert.equal(nb(t.db), 2);
  } finally { t.nettoyer(); }
});

test('synchro : relancer deux fois la même source ne crée aucun doublon', async () => {
  const t = baseTemporaire();
  try {
    const p = faux('p', false, ok(ligne('1AAAAAA'), ligne('2BBBBBB')));
    await lancerSync(t.db, t.dossier, 'test', [p]);
    const r = await lancerSync(t.db, t.dossier, 'test', [p]);
    assert.equal(nb(t.db), 2);
    assert.equal(r.stats.nouvelles, 0);
  } finally { t.nettoyer(); }
});

test('synchro : un texte d\'annonce vide n\'écrase pas le texte déjà connu', async () => {
  const t = baseTemporaire();
  try {
    await lancerSync(t.db, t.dossier, 'test', [faux('p', false, ok(ligne('1AAAAAA', { description: 'Texte complet' })))]);
    await lancerSync(t.db, t.dossier, 'test', [faux('p', false, ok(ligne('1AAAAAA', { description: '' })))]);
    assert.equal(t.db.prepare("SELECT annonce FROM offres WHERE id_offre = '1AAAAAA'").get().annonce, 'Texte complet');
  } finally { t.nettoyer(); }
});

test('synchro : les notes, l\'état écarté et le lien de candidature survivent à une synchro', async () => {
  const t = baseTemporaire();
  try {
    await lancerSync(t.db, t.dossier, 'test', [faux('p', false, ok(ligne('1AAAAAA')))]);
    t.db.prepare("UPDATE offres SET ignoree = 1, description = 'ma note' WHERE id_offre = '1AAAAAA'").run();
    await lancerSync(t.db, t.dossier, 'test', [faux('p', false, ok(ligne('1AAAAAA', { titre: 'Comptable général (H/F)' })))]);
    const o = t.db.prepare("SELECT ignoree, description, titre FROM offres WHERE id_offre = '1AAAAAA'").get();
    assert.equal(o.ignoree, 1);
    assert.equal(o.description, 'ma note');
    assert.equal(o.titre, 'Comptable général (H/F)');
  } finally { t.nettoyer(); }
});

test('synchro : verrou, deux appels simultanés partagent la même exécution', async () => {
  const t = baseTemporaire();
  try {
    let appels = 0;
    const lent = faux('p', false, async () => { appels++; await new Promise(r => setTimeout(r, 30)); return { date: 'x', offres: [ligne('1AAAAAA')], zones: ['83'], exclusions: [] }; });
    const [a, b] = await Promise.all([lancerSync(t.db, t.dossier, 'test', [lent]), lancerSync(t.db, t.dossier, 'test', [lent])]);
    assert.equal(appels, 1);
    assert.equal(a, b);
  } finally { t.nettoyer(); }
});

// --- Couverture (offres clôturées) et contrôle unitaire ---
test('provider : couverture complète, avec les numéros reçus avant les filtres locaux', () => avec(() => json({ resultats: [brute('111AAAA'), brute('222BBBB', { typeContrat: 'FRA' }), brute('333CCCC', { intitule: 'Plombier' })] }), async () => {
  const r = await ft.recuperer({ config: CONFIG });
  assert.equal(r.offres.length, 1);
  assert.equal(r.couverture.complete, true);
  assert.equal(r.couverture.verifier, verifierEnLigne);
  assert.deepEqual(r.couverture.ids.sort(), ['111AAAA', '222BBBB', '333CCCC']);
}));

test('provider : une recherche en échec rend la couverture incomplète', () => avec((_u, n) => (n === 1 ? json({ resultats: [brute('111AAAA')] }) : json({}, 500)), async () => {
  const r = await ft.recuperer({ config: { ...CONFIG, mots_cles: ['comptable', 'paie'] } });
  assert.equal(r.couverture.complete, false);
}));

test('provider : plafond de 1000 résultats atteint, couverture incomplète', () => avec(() => json({ resultats: Array.from({ length: 150 }, (_, i) => brute(`P${i}${Math.random()}`)) }), async () => {
  const r = await ft.recuperer({ config: CONFIG });
  assert.equal(r.couverture.complete, false);
}));

test('contrôle unitaire : 200 en ligne, 204 clôturée, autre statut ou panne inconnu', async () => {
  /** @type {[number, string][]} */
  const cas = [[200, 'en_ligne'], [204, 'cloturee'], [500, 'inconnu']];
  for (const [status, attendu] of cas) {
    await avec(() => new Response(status === 204 ? null : '{}', { status }), async () => {
      assert.equal(await verifierEnLigne('111AAAA'), attendu);
    });
  }
  await avec(() => { throw new Error('coupure'); }, async () => {
    assert.equal(await verifierEnLigne('111AAAA'), 'inconnu');
  });
});

test('provider : la durée du CDD est gardée dans le contrat', () => avec(() => json({ resultats: [
  brute('CDD1', { typeContrat: 'CDD', typeContratLibelle: 'CDD - 12 Mois' }),
  brute('CDD2', { typeContrat: 'CDD', typeContratLibelle: 'CDD' }),
] }), async () => {
  const r = await ft.recuperer({ config: CONFIG });
  const par = Object.fromEntries(r.offres.map(o => [o.id_offre, o.type_de_contrat]));
  assert.deepEqual(par, { CDD1: 'CDD - 12 mois', CDD2: 'CDD' });
}));
