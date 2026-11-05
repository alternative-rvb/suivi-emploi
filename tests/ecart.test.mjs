import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculerEcart, lireRemuneration } from '../client/src/ecart.ts';

test('lecture des salaires : annuel, mensuel, horaire, jour, fourchette', () => {
  assert.deepEqual(lireRemuneration('35000'), { montant: 35000, unite: 'an' });
  assert.equal(lireRemuneration('Mensuel de 2500 Euros sur 12 mois')?.montant, 30000);
  assert.equal(lireRemuneration('Annuel de 30000 Euros sur 12 mois')?.montant, 30000);
  assert.equal(lireRemuneration('Annuel de 30000 Euros à 36000 Euros')?.montant, 33000);
  assert.equal(lireRemuneration('Mensuel de 2000 Euros')?.montant, 24000);
  assert.equal(Math.round(lireRemuneration('12.6')?.montant ?? 0), 22932);
  assert.deepEqual(lireRemuneration('Horaire de 20 Euros')?.unite, 'an');
  assert.deepEqual(lireRemuneration('400 Euros par jour'), { montant: 400, unite: 'jour' });
  assert.equal(lireRemuneration(''), null);
  assert.equal(lireRemuneration('selon profil'), null);
});

test('écart : rouge sous l\'attente, vert au dessus, absent sans attente', () => {
  const bas = calculerEcart('28000', 38000, 0);
  const haut = calculerEcart('42000', 38000, 0);
  assert.ok(bas && bas.pourcent < -20 && bas.couleur.startsWith('hsl(0 '));
  assert.ok(haut && haut.pourcent > 0 && haut.couleur.startsWith('hsl(130 '));
  assert.equal(calculerEcart('35000', 0, 0), null);
  assert.equal(calculerEcart('400 Euros par jour', 38000, 0), null);
  assert.equal(calculerEcart('400 Euros par jour', 38000, 350)?.pourcent, 14);
});
