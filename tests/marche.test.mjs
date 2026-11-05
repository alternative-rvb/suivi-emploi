// Tests de l'API Marché du travail, avec un faux fetch. Aucun appel réseau réel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveurTemporaire } from './serveur-temporaire.mjs';

process.env.FT_CLIENT_ID = 'id-test';
process.env.FT_CLIENT_SECRET = 'secret-test';

const { chargerMarche, departementMarche, normaliserMetier, scopeMarche } = await import('../lib/marche.mjs');
const { viderCacheJetons } = await import('../lib/ft-jeton.mjs');

const json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
const valeur = (code, nb, extra = {}) => ({ codeNomenclature: code, codePeriode: '2026T2', valeurPrincipaleNombre: nb, libActivite: 'Métier', libPeriode: '2ème trimestre 2026', libTerritoire: 'BOUCHES-DU-RHONE', ...extra });
const OFFRES = [valeur('TOFF', 390), valeur('TOFF-CUMUL12MOIS', 1800)];
const DEMANDEURS = [valeur('A', 160)];
const reponse = url => json({ libTerritoire: 'BOUCHES-DU-RHONE', listeValeursParPeriode: url.includes('stat-offres') ? OFFRES : DEMANDEURS });

function base() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE kv (cle TEXT PRIMARY KEY, valeur TEXT)');
  return db;
}

// Faux fetch : jeton, puis une réponse par appel d'indicateur
function avec(indicateur, test_) {
  const appels = { jeton: [], indicateurs: [] };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('access_token')) { appels.jeton.push(String(opts.body)); return json({ access_token: 'jeton', expires_in: 3600 }); }
    appels.indicateurs.push({ url: String(url), corps: JSON.parse(opts.body) });
    return indicateur(String(url));
  };
  process.env.FT_SCOPE_MARCHE = 'api_stats-offres-demandes-emploiv1';
  viderCacheJetons();
  return Promise.resolve(test_(appels)).finally(() => { globalThis.fetch = original; delete process.env.FT_SCOPE_MARCHE; delete process.env.SUIVI_DEPARTEMENT_PROCHE; });
}

test('scope : absent désactive, un scope seul est complété par offresetdemandesemploi', () => {
  assert.equal(scopeMarche({}), null);
  assert.equal(scopeMarche({ FT_SCOPE_MARCHE: 'api_stats-offres-demandes-emploiv1' }), 'api_stats-offres-demandes-emploiv1 offresetdemandesemploi');
});

test('département : celui de la zone proche, sinon les Bouches-du-Rhône', () => {
  assert.equal(departementMarche({}), '13');
  assert.equal(departementMarche({ SUIVI_DEPARTEMENT_PROCHE: '83' }), '83');
  assert.equal(departementMarche({ SUIVI_DEPARTEMENT_PROCHE: '2a' }), '2A');
  assert.equal(departementMarche({ SUIVI_DEPARTEMENT_PROCHE: 'abc' }), '13');
});

test('normalisation : offres pour 100 demandeurs, valeur absente ou masquée reste null', () => {
  const m = normaliserMetier('dev_web', 'M1805', OFFRES, DEMANDEURS);
  assert.equal(m.offres, 390);
  assert.equal(m.offres_12_mois, 1800);
  assert.equal(m.demandeurs, 160);
  assert.equal(m.offres_pour_100, 243.8);
  const vide = normaliserMetier('web_design', 'E1205', [valeur('TOFF', undefined)], []);
  assert.equal(vide.offres, null);
  assert.equal(vide.demandeurs, null);
  assert.equal(vide.offres_pour_100, null);
  assert.equal(normaliserMetier('x', 'M1805', OFFRES, [valeur('A', 0)]).offres_pour_100, null);
});

test('historique : 8 derniers trimestres, évolution sur un an au même trimestre, valeur masquée à null', () => {
  const trimestres = ['2024T4', '2025T1', '2025T2', '2025T3', '2025T4', '2026T1', '2026T2'];
  const offres = trimestres.map((t, i) => valeur('TOFF', 100 + i * 50, { codePeriode: t }));
  const demandeurs = trimestres.map(t => valeur('A', t === '2025T4' ? undefined : 100, { codePeriode: t }));
  const m = normaliserMetier('dev_web', 'M1805', [...offres, valeur('TOFF-CUMUL12MOIS', 900, { codePeriode: '2026T2' })], demandeurs);
  assert.equal(m.offres, 400);
  assert.equal(m.offres_12_mois, 900);
  assert.equal(m.offres_pour_100, 400);
  assert.equal(m.evolution_pct, 100);
  assert.equal(m.historique.length, 7);
  assert.equal(m.historique.at(-1).periode, '2026T2');
  assert.equal(m.historique.find(h => h.periode === '2025T4').offres_pour_100, null);
  const long = normaliserMetier('x', 'M1805', Array.from({ length: 12 }, (_, i) => valeur('TOFF', 100, { codePeriode: `${2024 + Math.floor(i / 4)}T${(i % 4) + 1}` })), []);
  assert.equal(long.historique.length, 8);
  assert.equal(long.evolution_pct, null);
});

test('chargement : deux appels par métier, corps attendus, résultat gardé pour le jour', () => avec(reponse, async appels => {
  const db = base();
  const r = await chargerMarche(db, { maintenant: new Date('2026-11-05T10:00:00Z') });
  assert.equal(r.actif, true);
  assert.equal(r.territoire, 'BOUCHES-DU-RHONE');
  assert.deepEqual(r.metiers.map(m => m.rome), ['M1805', 'M1203', 'K2111', 'E1205']);
  assert.equal(appels.indicateurs.length, 8);
  assert.equal(appels.jeton.length, 1);
  assert.match(appels.jeton[0], /offresetdemandesemploi/);
  const offres = appels.indicateurs.find(a => a.url.endsWith('/stat-offres'));
  assert.equal(offres.corps.codeTypeNomenclature, 'ORIGINEOFF');
  assert.equal(offres.corps.codeTerritoire, '13');
  assert.equal('dernierePeriode' in offres.corps, false);
  const de = appels.indicateurs.find(a => a.url.endsWith('/stat-demandeurs'));
  assert.equal(de.corps.codeTypeNomenclature, 'CATCAND');
  // même jour : aucun nouvel appel
  const encore = await chargerMarche(db, { maintenant: new Date('2026-11-05T18:00:00Z') });
  assert.equal(appels.indicateurs.length, 8);
  assert.equal(encore.metiers.length, 4);
  // jour suivant ou force : nouvel appel
  await chargerMarche(db, { maintenant: new Date('2026-11-06T08:00:00Z') });
  assert.equal(appels.indicateurs.length, 16);
  await chargerMarche(db, { force: true, maintenant: new Date('2026-11-06T09:00:00Z') });
  assert.equal(appels.indicateurs.length, 24);
}));

test('échec de l\'API : données du jour précédent renvoyées avec obsolete, sinon erreur typée', () => avec(reponse, async () => {
  const db = base();
  await chargerMarche(db, { maintenant: new Date('2026-11-05T10:00:00Z') });
  globalThis.fetch = async url => (String(url).includes('access_token') ? json({ access_token: 'jeton', expires_in: 3600 }) : json({ message: 'panne' }, 500));
  const r = await chargerMarche(db, { maintenant: new Date('2026-11-06T10:00:00Z') });
  assert.equal(r.obsolete, true);
  assert.match(r.erreur, /500/);
  assert.equal(r.metiers.length, 4);
  await assert.rejects(chargerMarche(base(), { maintenant: new Date('2026-11-06T10:00:00Z') }), e => /** @type {any} */ (e).code === 'http');
}));

test('erreurs : accès refusé en auth, réponse illisible en format', () => avec(() => json({}, 403), async () => {
  await assert.rejects(chargerMarche(base()), e => /** @type {any} */ (e).code === 'auth');
  globalThis.fetch = async url => (String(url).includes('access_token') ? json({ access_token: 'jeton', expires_in: 3600 }) : json({ pas: 'de liste' }));
  viderCacheJetons();
  await assert.rejects(chargerMarche(base()), e => /** @type {any} */ (e).code === 'format');
}));

test('sans FT_SCOPE_MARCHE : fonction désactivée, aucun appel', async () => {
  delete process.env.FT_SCOPE_MARCHE;
  assert.deepEqual(await chargerMarche(base()), { actif: false, metiers: [] });
});

test('route /api/marche : inactive sans scope, POST refusé', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'marche-'));
  const { url, proc } = await serveurTemporaire(dir);
  try {
    const r = await fetch(url + '/api/marche');
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { actif: false, metiers: [] });
    assert.equal((await fetch(url + '/api/marche', { method: 'POST' })).status, 405);
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
