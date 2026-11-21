import assert from 'node:assert/strict';
import test from 'node:test';
import { ecrirePlateformes, ErreurPlateformes, lirePlateformes, validerPlateformes } from '../lib/plateformes.mjs';
import { ouvrirBase } from '../lib/offres.mjs';

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

test('lire et écrire dans les réglages du profil, liste vide si rien ou enregistrement abîmé', () => {
  const db = ouvrirBase(':memory:');
  assert.deepEqual(lirePlateformes(db), []);
  ecrirePlateformes(db, ['Collective.work']);
  assert.deepEqual(lirePlateformes(db), ['Collective.work']);
  db.prepare("UPDATE profil_reglages SET valeur = '{pas du json' WHERE cle = 'plateformes_compte'").run();
  assert.deepEqual(lirePlateformes(db), []);
});
