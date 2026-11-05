import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRAJETS_PAR_DEFAUT, validerTrajets, ErreurTrajets } from '../lib/trajets.mjs';

test('les valeurs par défaut du péage et des jours sont facultatives', () => {
  const { peage_jour, jours_defaut, ...ancien } = TRAJETS_PAR_DEFAUT;
  const r = validerTrajets(ancien);
  assert.equal(r.peage_jour, 0);
  assert.equal(r.jours_defaut, 0);
});

test('le péage et les jours par défaut sont validés', () => {
  assert.equal(validerTrajets({ ...TRAJETS_PAR_DEFAUT, peage_jour: 17.5, jours_defaut: 120 }).peage_jour, 17.5);
  assert.throws(() => validerTrajets({ ...TRAJETS_PAR_DEFAUT, peage_jour: -1 }), ErreurTrajets);
  assert.throws(() => validerTrajets({ ...TRAJETS_PAR_DEFAUT, jours_defaut: 999 }), ErreurTrajets);
});

test('l\'attente annuelle et le TJM sont facultatifs et validés', () => {
  const base = { departs: [], carburant: 'Gazole', prix_litre: 2, conso_100: 6 };
  const r = validerTrajets(base);
  assert.equal(r.attente_annuelle, 0);
  assert.equal(r.tjm, 0);
  assert.equal(r.peage_km, 0.1);
  assert.throws(() => validerTrajets({ ...base, peage_km: 3 }), ErreurTrajets);
  assert.equal(validerTrajets({ ...base, attente_annuelle: 38000, tjm: 350 }).tjm, 350);
  assert.throws(() => validerTrajets({ ...base, tjm: -1 }), ErreurTrajets);
});
