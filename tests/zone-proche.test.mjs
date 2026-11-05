import test from 'node:test';
import assert from 'node:assert/strict';
import { estProche } from '../lib/offres.mjs';

// ANCHOR: la zone proche vient du .env (département et villes), sans réglage aucune offre n'est proche
test('estProche : vide sans réglage, sinon département et ville', () => {
  delete process.env.SUIVI_DEPARTEMENT_PROCHE;
  delete process.env.SUIVI_VILLES_PROCHES;
  assert.equal(estProche('13', 'Marseille'), 0);
  process.env.SUIVI_DEPARTEMENT_PROCHE = '13';
  process.env.SUIVI_VILLES_PROCHES = 'Marseille, Aix-en-Provence';
  assert.equal(estProche('13', 'MARSEILLE 8e Arrondissement'), 1);
  assert.equal(estProche('13', 'aix-en-provence'), 1);
  assert.equal(estProche('13', 'Arles'), 0);
  assert.equal(estProche('83', 'Marseille'), 0);
  delete process.env.SUIVI_DEPARTEMENT_PROCHE;
  delete process.env.SUIVI_VILLES_PROCHES;
});
