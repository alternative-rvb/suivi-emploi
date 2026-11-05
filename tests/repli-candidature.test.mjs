// Tests de l'identifiant de remplacement d'une candidature sans numéro d'offre. Lancer avec npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { repliCandidature } from '../client/src/format.ts';

test('la plateforme indiquée sert d\'identifiant', () => {
  assert.equal(repliCandidature({ plateforme: 'Indeed', lien: 'https://example.com' }), 'Indeed');
});

test('sans plateforme : Internet si un lien est renseigné', () => {
  assert.equal(repliCandidature({ plateforme: '', lien: 'https://example.com/annonce' }), 'Internet');
});

test('ni plateforme ni lien (ou valeurs blanches) : Libre', () => {
  assert.equal(repliCandidature({ plateforme: '', lien: '' }), 'Libre');
  assert.equal(repliCandidature({ plateforme: '  ', lien: ' ' }), 'Libre');
  assert.equal(repliCandidature({}), 'Libre');
});
