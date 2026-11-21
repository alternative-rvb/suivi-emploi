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

test('validerZone : champs inconnus, département, points et listes contrôlés ; valeurs nettoyées', async () => {
  const { validerZone } = await import('../lib/zone.mjs');
  assert.throws(() => validerZone({ inconnu: 1 }), /inconnus/);
  assert.throws(() => validerZone({ departement_proche: 'abc' }), /departement_proche/);
  assert.throws(() => validerZone({ origines: ['faux'] }), /origines/);
  assert.throws(() => validerZone({ departements_distance: ['44', 'x'] }), /departements_distance/);
  assert.throws(() => validerZone({ lieu_bonus: '200,0' }), /lieu_bonus/);
  assert.deepEqual(validerZone({ departement_proche: '2a', villes_proches: [' Ville A ', ''], departements_distance: ['44', '44'] }),
    { departement_proche: '2A', villes_proches: ['Ville A'], origines: [], departements_distance: ['44'], lieu_bonus: '' });
});

test('zone du profil : réglage du profil, sinon ancien .env pour le profil par défaut seulement ; reprise du .env une seule fois', async () => {
  const { ouvrirBase } = await import('../lib/offres.mjs');
  const { avecProfil, creerProfil, lireReglageProfil } = await import('../lib/profils.mjs');
  const { lireZoneProfil, reprendreZoneEnv } = await import('../lib/zone.mjs');
  const db = ouvrirBase(':memory:');
  const env = { SUIVI_DEPARTEMENT_PROCHE: '44', SUIVI_VILLES_PROCHES: 'Ville A', SUIVI_ORIGINES: '47.2,-1.5; faux', SUIVI_DEPARTEMENTS_DISTANCE: '44, abc' };
  assert.equal(reprendreZoneEnv(db, env), true);
  assert.deepEqual(lireReglageProfil(db, 'zone'), { departement_proche: '44', villes_proches: ['Ville A'], origines: ['47.2,-1.5'], departements_distance: ['44'], lieu_bonus: '' });
  assert.equal(reprendreZoneEnv(db, { SUIVI_DEPARTEMENT_PROCHE: '13' }), false, 'déjà reprise');
  const autre = /** @type {{ id: string }} */ (creerProfil(db, { nom: 'Autre' }));
  avecProfil(autre.id, () => {
    assert.equal(lireZoneProfil(db).departement_proche, '');
    assert.equal(reprendreZoneEnv(db, {}), false);
  });
  db.close();
});
