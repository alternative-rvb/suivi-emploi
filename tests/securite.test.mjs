import test from 'node:test';
import assert from 'node:assert/strict';
import { lienHttp } from '../lib/offres.mjs';

// ANCHOR: seuls les liens http(s) sont conservés (pas de javascript: ni data:)
test('lienHttp garde les liens http et https', () => {
  assert.equal(lienHttp(' https://example.com/a '), 'https://example.com/a');
  assert.equal(lienHttp('http://example.com'), 'http://example.com');
});

test('lienHttp rejette les autres schémas et les valeurs vides', () => {
  for (const v of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', '', null, undefined, 42, 'https://a b']) {
    assert.equal(lienHttp(v), '');
  }
});
