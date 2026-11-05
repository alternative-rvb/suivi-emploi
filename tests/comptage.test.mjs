import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compterNonVues, offresActives } from '../client/src/comptage.ts';

const offre = (id, extra = {}) => ({ id_offre: id, titre: 'Poste ' + id, entreprise: 'Employeur ' + id, vue: 0, ignoree: 0, expiree: 0, ...extra });

test('comptage : seules les offres actives et non vues comptent', () => {
  const offres = [
    offre('a1'),
    offre('a2', { vue: 1 }),
    offre('a3', { ignoree: 1 }),
    offre('a4', { expiree: 1 }),
    offre('a5'),
  ];
  const candidatures = [{ id: 'c1', entreprise: 'Autre', poste: 'Autre', statut: 'en_cours', offre_id: 'a5' }];
  assert.deepEqual(offresActives(offres, candidatures).map(o => o.id_offre), ['a1', 'a2']);
  assert.equal(compterNonVues(offres, candidatures), 1);
});

test('comptage : sans offres chargées, aucun badge', () => {
  assert.equal(compterNonVues(null, []), 0);
  assert.equal(compterNonVues([], undefined), 0);
});
