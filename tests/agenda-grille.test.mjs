// Tests de la logique pure de l'agenda (client/src/agenda.ts) : éléments, vues, chevauchements. Lancer avec npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decaler, elementDeRdv, elementExterne, elementsAgenda, heureParis, joursMois, joursSemaine, lundi, memeMois, parJour, periode, placer, plageHeures } from '../client/src/agenda.ts';

/** @returns {import('../types.js').RendezVous} */
const rdv = (id, debut, duree = 60, extra = {}) => ({ id, titre: 'RDV ' + id, debut, duree, type: /** @type {'autre'} */ ('autre'), lieu: '', lien_visio: '', note: '', offre_id: null, candidature_id: null, contact_id: null, google_id: null, synchro: /** @type {'ok'} */ ('ok'), cree: '2026-10-23', ...extra });
const externe = (id, debut, fin, extra = {}) => ({ id, titre: 'Ext ' + id, debut, fin, journee: false, lieu: '', visio: '', lien: '', statut: 'confirmed', suivi: '', rdv: null, ...extra });

test('heureParis : heure murale de Paris à partir d\'un instant RFC 3339', () => {
  assert.equal(heureParis('2026-10-23T17:00:00+02:00'), '2026-10-23T17:00');
  assert.equal(heureParis('2026-10-28T15:00:00Z'), '2026-10-28T16:00');
});

test('elementDeRdv : heures, fin et journée entière', () => {
  const e = elementDeRdv(rdv('a', '2026-10-27T14:30', 45));
  assert.deepEqual([e.jour, e.debut, e.fin, e.minutesDebut, e.minutesFin, e.journee], ['2026-10-27', '14:30', '15:15', 870, 915, false]);
  assert.equal(elementDeRdv(rdv('b', '2026-10-27T00:00', 1440)).journee, true);
  assert.equal(elementDeRdv(rdv('c', '2026-10-27T23:00', 120)).minutesFin, 1440);
});

test('elementExterne : événement horaire, de journée, et coupé à minuit', () => {
  const h = elementExterne(externe('x', '2026-10-30T11:00:00+01:00', '2026-10-30T11:30:00+01:00'));
  assert.deepEqual([h.jour, h.debut, h.fin, h.journee], ['2026-10-30', '11:00', '11:30', false]);
  const j = elementExterne(externe('y', '2026-10-27', '2026-10-28', { journee: true }));
  assert.deepEqual([j.jour, j.journee], ['2026-10-27', true]);
  const nuit = elementExterne(externe('z', '2026-10-30T22:00:00+01:00', '2026-10-31T02:00:00+01:00'));
  assert.equal(nuit.minutesFin, 1440);
});

test('elementsAgenda : RDV annulés écartés, événements rattachés non doublés, tri par jour puis heure', () => {
  const liste = elementsAgenda(
    [rdv('b', '2026-10-27T15:00'), rdv('a', '2026-10-27T09:00'), rdv('c', '2026-10-27T11:00', 60, { synchro: 'annule' }), rdv('g', '2026-10-26T10:00', 60, { google_id: 'g1' })],
    [externe('g1', '2026-10-26T10:00:00+01:00', '2026-10-26T11:00:00+01:00', { rdv: 'g' }), externe('e2', '2026-10-27T12:00:00+01:00', '2026-10-27T13:00:00+01:00'), externe('j', '2026-10-27', '2026-10-28', { journee: true })],
  );
  assert.deepEqual(liste.map(e => e.cle), ['r:g', 'g:j', 'r:a', 'g:e2', 'r:b']);
  assert.deepEqual([...parJour(liste).keys()], ['2026-10-26', '2026-10-27']);
});

test('vues : semaine du lundi au dimanche, mois sur six semaines, navigation', () => {
  assert.equal(lundi('2026-10-25'), '2026-10-19'); // dimanche
  assert.equal(lundi('2026-10-19'), '2026-10-19');
  assert.deepEqual(joursSemaine('2026-10-23').map(j => j.slice(8)), ['19', '20', '21', '22', '23', '24', '25']);
  const mois = joursMois('2026-10-23');
  assert.equal(mois.length, 42);
  assert.equal(mois[0], '2026-09-28');
  assert.equal(mois[41], '2026-11-08');
  assert.ok(mois.some(j => !memeMois(j, '2026-10-01')));
  assert.equal(decaler('jour', '2026-10-31', 1), '2026-11-01');
  assert.equal(decaler('semaine', '2026-10-28', -1), '2026-10-21');
  assert.equal(decaler('mois', '2026-12-15', 1), '2027-01-15');
  assert.equal(decaler('mois', '2026-01-31', 1), '2026-02-28'); // jour ramené à la fin du mois
  assert.equal(decaler('mois', '2026-10-01', 1), '2026-11-01');
  assert.equal(decaler('mois', '2026-01-31', -1), '2025-12-31');
  assert.deepEqual(periode('semaine', '2026-10-23'), ['2026-10-19', '2026-10-25']);
  assert.deepEqual(periode('mois', '2026-10-23'), ['2026-09-28', '2026-11-08']);
  assert.deepEqual(periode('jour', '2026-10-23'), ['2026-10-23', '2026-10-23']);
});

test('placer : colonnes des chevauchements, groupes indépendants', () => {
  const e = (id, debut, duree) => elementDeRdv(rdv(id, '2026-10-27T' + debut, duree));
  const p = placer([e('a', '09:00', 60), e('b', '09:30', 60), e('c', '10:00', 30), e('d', '14:00', 60), e('j', '00:00', 1440)]);
  const de = id => p.find(x => x.element.rdv.id === id);
  assert.deepEqual([de('a').colonne, de('a').colonnes], [0, 2]);
  assert.deepEqual([de('b').colonne, de('b').colonnes], [1, 2]);
  assert.deepEqual([de('c').colonne, de('c').colonnes], [0, 2]);
  assert.deepEqual([de('d').colonne, de('d').colonnes], [0, 1]);
  assert.equal(de('j'), undefined);
});

test('plageHeures : 8 h à 20 h, élargie par un élément hors plage', () => {
  const e = (debut, duree) => elementDeRdv(rdv('x', '2026-10-27T' + debut, duree));
  assert.deepEqual(plageHeures([e('10:00', 60)]), [8, 20]);
  assert.deepEqual(plageHeures([e('06:30', 60), e('21:00', 90)]), [6, 23]);
  assert.deepEqual(plageHeures([e('00:00', 1440)]), [8, 20]);
});
