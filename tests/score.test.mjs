// ANCHOR: score de pertinence des offres : proximité en paliers de km, exigences de l'analyse IA
import test from 'node:test';
import assert from 'node:assert/strict';
import { preparerScore } from '../client/src/score.ts';

const offre = (extra = {}) => ({ id_offre: 'o1', titre: 'Comptable', annonce: '', categorie: 'comptabilite', proche: 0, date_detection: '2026-10-28', ...extra });
const calcul = (distanceKm) => preparerScore([], '2026-10-28', [], [], distanceKm);

test('proximité : paliers de distance, 25 points jusqu\'à 15 km et 0 au-delà de 80 km', () => {
  const paliers = [[10, 25], [15, 25], [20, 20], [40, 14], [70, 7], [120, 0]];
  for (const [km, pts] of paliers) assert.equal(calcul(() => km)(offre()).proximite, pts, `${km} km`);
});

test('proximité : sans distance connue, la zone proche reste tout ou rien', () => {
  const f = calcul(() => null);
  assert.equal(f(offre({ proche: 1 })).proximite, 25);
  assert.equal(f(offre({ proche: 0 })).proximite, 0);
});

test('exigences : points de l\'analyse IA sans le télétravail, bornés de -25 à +10', () => {
  const f = calcul(() => null);
  const analyse = details => ({ details: details.map(([libelle, points]) => ({ libelle, points })) });
  assert.equal(f(offre()).exigences, 0);
  assert.equal(f(offre({ analyse: analyse([['Diplôme exigé', -15], ['Télétravail : oui', 5]]) })).exigences, -15);
  assert.equal(f(offre({ analyse: analyse([['Poste de niveau responsable', -25], ['Diplôme exigé', -15]]) })).exigences, -25);
  assert.equal(f(offre({ analyse: analyse([['Poste de niveau junior', 10], ['Autre', 10]]) })).exigences, 10);
});

test('total : borné de 0 à 100 avec les exigences', () => {
  const f = calcul(() => 5);
  const t = f(offre({ analyse: { details: [{ libelle: 'Poste de niveau responsable', points: -25 }] } }));
  assert.equal(t.total, t.categorie + t.competences + t.proximite + t.fraicheur - 25);
  assert.ok(t.total >= 0 && t.total <= 100);
});

// NOTE: contrat (voir lib/contrat.mjs) et lieu bonus du .env
const loin = (extra = {}) => offre({ contrat: 'CDD - 6 mois', ...extra });
test('contrat : une offre éloignée en CDD court perd 15 points, pas une offre proche', () => {
  assert.equal(calcul(() => 55)(loin()).contrat, -15);
  assert.equal(calcul(() => 25)(loin()).contrat, 0);
  assert.equal(calcul(() => 55)(loin({ proche: 1 })).contrat, 0);
});

test('contrat : CDI et CDD de 12 mois passent, CDD sans durée demi-malus, sans distance pas de malus', () => {
  const f = calcul(() => 55);
  assert.equal(f(loin({ contrat: 'CDI' })).contrat, 0);
  assert.equal(f(loin({ contrat: 'CDD - 12 mois' })).contrat, 0);
  assert.equal(f(loin({ contrat: 'CDD' })).contrat, -8);
  assert.equal(f(loin({ contrat: 'Intérim' })).contrat, -15);
  assert.equal(calcul(() => null)(loin()).contrat, 0);
});

test('lieu bonus : +3 points à 15 km ou moins, total inchangé au-delà', () => {
  const avec = preparerScore([], '2026-10-28', [], [], () => 20, () => 10)(offre());
  const sans = preparerScore([], '2026-10-28', [], [], () => 20, () => 40)(offre());
  assert.equal(avec.bonusLieu, 3);
  assert.equal(sans.bonusLieu, 0);
  assert.equal(avec.total - sans.total, 3);
});

test('métier visé : formateur > web design > dev web > comptabilité', () => {
  const f = calcul(() => null);
  const [fo, wd, dw, co] = ['formateur_digital', 'web_design', 'dev_web', 'comptabilite'].map(c => f(offre({ categorie: c })).categorie);
  assert.ok(fo > wd && wd > dw && dw > co && co > 0);
});
