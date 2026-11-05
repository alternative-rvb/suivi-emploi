// @ts-check
// ANCHOR: ordre des tuiles de l'accueil (ligne 122)
import test from 'node:test';
import assert from 'node:assert/strict';
import { deplacer, trier } from '../client/src/ordre.ts';

const t = ids => ids.map(id => ({ id }));
const ids = l => l.map(x => x.id);

test('trier : ordre mémorisé, tuiles nouvelles à leur place d\'origine à la suite', () => {
  assert.deepEqual(ids(trier(t(['a', 'b', 'c', 'd']), [])), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids(trier(t(['a', 'b', 'c', 'd']), ['c', 'a'])), ['c', 'a', 'b', 'd']);
  assert.deepEqual(ids(trier(t(['a', 'c']), ['c', 'x', 'a'])), ['c', 'a']);
});

test('deplacer : avant, après, vers soi-même et ids inconnus', () => {
  assert.deepEqual(deplacer(['a', 'b', 'c', 'd'], 'd', 'b', false), ['a', 'd', 'b', 'c']);
  assert.deepEqual(deplacer(['a', 'b', 'c', 'd'], 'a', 'c', true), ['b', 'c', 'a', 'd']);
  assert.deepEqual(deplacer(['a', 'b', 'c'], 'b', 'b', true), ['a', 'b', 'c']);
  assert.deepEqual(deplacer(['a', 'b', 'c'], 'z', 'b', true), ['a', 'b', 'c']);
  assert.deepEqual(deplacer(['a', 'b', 'c'], 'a', 'z', false), ['a', 'b', 'c']);
});
