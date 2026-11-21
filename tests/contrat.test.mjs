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

test('typeContrat : alternance et stage lus dans le libellé, avant le CDD', () => {
  assert.equal(typeContrat("Contrat d'apprentissage").type, 'alternance');
  assert.equal(typeContrat('CDD - 24 mois, apprentissage').type, 'alternance');
  assert.equal(typeContrat('Contrat de professionnalisation').type, 'alternance');
  assert.equal(typeContrat('Alternance').type, 'alternance');
  assert.equal(typeContrat('Stage').type, 'stage');
  assert.equal(typeContrat('CDI, Temps plein').type, 'cdi');
});

test('malusContrat : mode emploi inchangé pour les anciens types, alternance et stage pénalisés', () => {
  assert.equal(malusContrat('Stage').points, -15);
  assert.equal(malusContrat('Alternance').points, -15);
  assert.equal(malusContrat('CDD - 6 mois', '', 10).points, -10);
});

test('malusContrat : mode alternance ou stage, seul le contrat recherché passe', () => {
  assert.equal(malusContrat('Alternance', '', 15, 'alternance').points, 0);
  assert.equal(malusContrat('CDD - 24 mois, apprentissage', '', 15, 'alternance').points, 0);
  assert.equal(malusContrat('CDI', '', 15, 'alternance').points, -15);
  assert.equal(malusContrat('CDD - 12 mois', '', 12, 'alternance').points, -12);
  assert.equal(malusContrat('Stage', '', 15, 'alternance').points, -15);
  assert.equal(malusContrat('Stage', '', 15, 'stage').points, 0);
  assert.equal(malusContrat('Alternance', '', 15, 'stage').points, -15);
  assert.equal(malusContrat('', '', 15, 'stage').points, 0);
  assert.equal(malusContrat('CDI', '', 15, 'alternance').raison, 'CDI');
});
