// Lien Google Maps d'une adresse : encodage, texte vide
import test from 'node:test';
import assert from 'node:assert/strict';
import { lienMaps } from '../client/src/utils.ts';

test('lienMaps : adresse encodée, vide sans texte', () => {
  assert.equal(lienMaps('12 rue des Lilas, 49100 Exempleville'), 'https://www.google.com/maps/search/?api=1&query=12%20rue%20des%20Lilas%2C%2049100%20Exempleville');
  assert.equal(lienMaps('1 rue des Exemples, 13001 Marseille (accès piéton par l\'avenue X)'), 'https://www.google.com/maps/search/?api=1&query=1%20rue%20des%20Exemples%2C%2013001%20Marseille');
  assert.equal(lienMaps('  '), '');
  assert.equal(lienMaps(null), '');
});
