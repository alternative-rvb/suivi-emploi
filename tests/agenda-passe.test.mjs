// Éléments d'agenda passés (estompés dans l'interface) : jour passé, fin dépassée aujourd'hui, journée entière
import test from 'node:test';
import assert from 'node:assert/strict';
import { estPasse } from '../client/src/agenda.ts';

test('estPasse : jour passé, fin dépassée aujourd hui, journée entière', () => {
  const auj = '2026-10-23';
  assert.equal(estPasse({ jour: '2026-10-22', fin: '23:00', journee: false }, auj, '08:00'), true);
  assert.equal(estPasse({ jour: auj, fin: '10:00', journee: false }, auj, '10:30'), true);
  assert.equal(estPasse({ jour: auj, fin: '11:00', journee: false }, auj, '10:30'), false);
  assert.equal(estPasse({ jour: auj, fin: '', journee: true }, auj, '23:59'), false);
  assert.equal(estPasse({ jour: '2026-10-24', fin: '08:00', journee: false }, auj, '12:00'), false);
});
