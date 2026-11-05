// Tests de la synchro au démarrage : reprise de la dernière synchro réussie si elle est récente, sinon synchro normale.
import test from 'node:test';
import assert from 'node:assert/strict';

const { lancerSyncDemarrage, etatSync } = await import('../lib/sync.mjs');
const { ouvrirBase } = await import('../lib/offres.mjs');

const enregistrer = (db, minutes) => db.prepare("INSERT INTO kv (cle, valeur) VALUES ('synchro_derniere', ?)")
  .run(JSON.stringify({ ok: true, date: new Date(Date.now() - minutes * 60000).toISOString(), stats: {}, enBase: 7 }));

test('démarrage : une synchro réussie récente est reprise sans appel réseau', async () => {
  const db = ouvrirBase(':memory:');
  enregistrer(db, 5);
  const r = await lancerSyncDemarrage(db, '/inexistant', {});
  assert.equal(r.ignoree, true);
  assert.equal(r.age_minutes, 5);
  assert.equal(etatSync.dernier.enBase, 7);
});

test('démarrage : seuil réglable, 0 force la synchro', async () => {
  const db = ouvrirBase(':memory:');
  enregistrer(db, 5);
  assert.equal((await lancerSyncDemarrage(db, '/inexistant', { SUIVI_SYNC_MIN_MINUTES: '10' })).ignoree, true);
  // seuil dépassé ou 0 : synchro normale, qui échoue ici faute de configuration (aucun provider joignable)
  await assert.rejects(() => lancerSyncDemarrage(db, '/inexistant', { SUIVI_SYNC_MIN_MINUTES: '3' }));
  await assert.rejects(() => lancerSyncDemarrage(db, '/inexistant', { SUIVI_SYNC_MIN_MINUTES: '0' }));
});

test('démarrage : sans synchro enregistrée ou copie illisible, synchro normale', async () => {
  const db = ouvrirBase(':memory:');
  await assert.rejects(() => lancerSyncDemarrage(db, '/inexistant', {}));
  db.prepare("INSERT INTO kv (cle, valeur) VALUES ('synchro_derniere', 'pas du json')").run();
  await assert.rejects(() => lancerSyncDemarrage(db, '/inexistant', {}));
});
