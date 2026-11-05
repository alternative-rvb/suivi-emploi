import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ecrirePlateformes, ErreurPlateformes, lirePlateformes, validerPlateformes } from '../lib/plateformes.mjs';

test('validerPlateformes : espaces réduits, vides et doublons retirés', () => {
  assert.deepEqual(validerPlateformes(['  Collective.work ', 'collective.WORK', '', 'Malt  Pro']), ['Collective.work', 'Malt Pro']);
  assert.deepEqual(validerPlateformes({ plateformes: ['Éclair'] }), ['Éclair']);
  assert.deepEqual(validerPlateformes(['Éclair', 'eclair']), ['Éclair']);
});

test('validerPlateformes : formes refusées', () => {
  assert.throws(() => validerPlateformes('Collective.work'), ErreurPlateformes);
  assert.throws(() => validerPlateformes([12]), ErreurPlateformes);
  assert.throws(() => validerPlateformes(['x'.repeat(81)]), ErreurPlateformes);
  assert.throws(() => validerPlateformes(Array.from({ length: 101 }, (_, i) => 'p' + i)), ErreurPlateformes);
});

test('lire et écrire dans le kv, liste vide si rien ou enregistrement abîmé', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE kv (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL)');
  assert.deepEqual(lirePlateformes(db), []);
  ecrirePlateformes(db, ['Collective.work']);
  assert.deepEqual(lirePlateformes(db), ['Collective.work']);
  db.prepare("UPDATE kv SET valeur = '{pas du json' WHERE cle = 'plateformes_compte'").run();
  assert.deepEqual(lirePlateformes(db), []);
});
