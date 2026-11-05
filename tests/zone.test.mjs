import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lirePoint, lireZone } from '../lib/zone.mjs';

test('lirePoint : « lat,lon » rendu en [lon, lat], invalide ignoré', () => {
  assert.deepEqual(lirePoint('47.2184, -1.5536'), [-1.5536, 47.2184]);
  assert.equal(lirePoint('Nantes'), null);
  assert.equal(lirePoint('95,2'), null);
  assert.equal(lirePoint(''), null);
});

test('lireZone : rien de réglé, rien de calculé', () => {
  assert.deepEqual(lireZone({}), { origines: [], departements: [], bonus: null });
});

test('lireZone : origines multiples, départements par défaut ceux de la zone proche, lieu bonus', () => {
  const z = lireZone({ SUIVI_ORIGINES: '47.2184,-1.5536; 47.4784,-0.5632 ; faux', SUIVI_DEPARTEMENT_PROCHE: '44', SUIVI_LIEU_BONUS: '47.0,-1.0' });
  assert.deepEqual(z.origines, [[-1.5536, 47.2184], [-0.5632, 47.4784]]);
  assert.deepEqual(z.departements, ['44']);
  assert.deepEqual(z.bonus, [-1, 47]);
});

test('lireZone : SUIVI_DEPARTEMENTS_DISTANCE prime, doublons et codes invalides retirés, Corse acceptée', () => {
  const z = lireZone({ SUIVI_DEPARTEMENTS_DISTANCE: '44, 49,44, abc, 2a', SUIVI_DEPARTEMENT_PROCHE: '13' });
  assert.deepEqual(z.departements, ['44', '49', '2A']);
});
