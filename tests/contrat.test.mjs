// ANCHOR: type et durée du contrat, malus des offres éloignées
import test from 'node:test';
import assert from 'node:assert/strict';
import { typeContrat, malusContrat } from '../lib/contrat.mjs';

test('typeContrat : CDI, CDD avec durée, autres, vide', () => {
  assert.deepEqual(typeContrat('CDI'), { type: 'cdi', mois: null });
  assert.deepEqual(typeContrat('CDI, Temps plein'), { type: 'cdi', mois: null });
  assert.deepEqual(typeContrat('CDD - 12 mois'), { type: 'cdd', mois: 12 });
  assert.deepEqual(typeContrat('CDD - 2 ans'), { type: 'cdd', mois: 24 });
  assert.deepEqual(typeContrat('Intérim'), { type: 'autre', mois: null });
  assert.deepEqual(typeContrat(''), { type: 'inconnu', mois: null });
});

test('typeContrat : durée du CDD retrouvée dans l\'annonce, sans confondre avec l\'expérience demandée', () => {
  assert.equal(typeContrat('CDD', 'Contrat de 18 mois, poste à pourvoir').mois, 18);
  assert.equal(typeContrat('CDD', '3 mois d\'expérience souhaités').mois, null);
});

test('malusContrat : CDI et CDD long sans malus, le reste -15, durée inconnue -8', () => {
  assert.equal(malusContrat('CDI').points, 0);
  assert.equal(malusContrat('CDD - 12 mois').points, 0);
  assert.equal(malusContrat('CDD - 6 mois').points, -15);
  assert.equal(malusContrat('CDD').points, -8);
  assert.equal(malusContrat('Saisonnier').points, -15);
  assert.equal(malusContrat('').points, 0);
});
