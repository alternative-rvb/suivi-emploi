// Tests du journal des actions et des rapports : écriture datée, jour local, regroupement par jour et par semaine, CSV.
import test from 'node:test';
import assert from 'node:assert/strict';

const { differences, evenements, journaliser, jourLocal, lundi, rapport, rapportCsv, semaineIso } = await import('../lib/journal.mjs');
const { ouvrirBase } = await import('../lib/offres.mjs');

const base = () => ouvrirBase(':memory:');

test('journal : une ligne par champ modifié, avec avant et après, les booléens en 0 et 1', () => {
  const diff = differences({ vue: 0, titre: 'A', statut: 'a_faire' }, { vue: 1, titre: 'A', statut: 'en_cours' }, ['vue', 'titre', 'statut']);
  assert.deepEqual(diff, [{ champ: 'vue', avant: '0', apres: '1' }, { champ: 'statut', avant: 'a_faire', apres: 'en_cours' }]);
  assert.deepEqual(differences({ faite: false }, { faite: true }, ['faite']), [{ champ: 'faite', avant: '0', apres: '1' }]);
  assert.equal(differences({ a: 'x'.repeat(500) }, { a: 'y' }, ['a'])[0].avant.length, 301);
});

test('journal : horodatage ISO à la seconde et jour dans le fuseau local', () => {
  const db = base();
  // 22 h 30 UTC le 19 octobre = 00 h 30 le 20 octobre à Paris (UTC+2)
  journaliser(db, { entite: 'offre', id: 'o1', libelle: 'Comptable', action: 'modification', changements: [{ champ: 'vue', avant: '0', apres: '1' }], quand: new Date('2026-10-19T22:30:15Z') });
  const [e] = evenements(db);
  assert.equal(e.ts, '2026-10-19T22:30:15.000Z');
  assert.equal(e.jour, '2026-10-20');
  assert.equal(jourLocal(new Date('2026-01-15T23:30:00Z')), '2026-01-16');
});

test('semaines : lundi et numéro ISO', () => {
  assert.equal(lundi('2026-10-20'), '2026-10-19');
  assert.equal(lundi('2026-10-25'), '2026-10-19');
  assert.equal(lundi('2026-10-19'), '2026-10-19');
  assert.equal(semaineIso('2026-10-20'), '2026-S43');
  assert.equal(semaineIso('2026-01-01'), '2026-S01');
  assert.equal(semaineIso('2027-01-01'), '2026-S53');
});

function remplir(db) {
  const j = (quand, e) => journaliser(db, { ...e, quand: new Date(quand) });
  j('2026-10-19T08:00:00Z', { entite: 'offre', id: 'o1', libelle: 'A', action: 'modification', changements: [{ champ: 'vue', avant: '0', apres: '1' }] });
  j('2026-10-19T09:00:00Z', { entite: 'offre', id: 'o2', libelle: 'B', action: 'modification', changements: [{ champ: 'vue', avant: '0', apres: '1' }, { champ: 'ignoree', avant: '0', apres: '1' }] });
  j('2026-10-19T09:05:00Z', { entite: 'offre', id: 'o1', libelle: 'A', action: 'modification', changements: [{ champ: 'vue', avant: '1', apres: '0' }] });
  j('2026-10-21T10:00:00Z', { entite: 'candidature', id: 'c1', libelle: 'ClientABC', action: 'creation', changements: [{ champ: 'statut', avant: '', apres: 'en_cours' }] });
  j('2026-10-21T10:30:00Z', { entite: 'candidature', id: 'c2', libelle: 'ProjetX', action: 'creation', changements: [{ champ: 'statut', avant: '', apres: 'a_faire' }] });
  j('2026-10-22T09:00:00Z', { entite: 'candidature', id: 'c2', libelle: 'ProjetX', action: 'modification', changements: [{ champ: 'statut', avant: 'a_faire', apres: 'en_cours' }] });
  j('2026-10-22T09:30:00Z', { entite: 'candidature', id: 'c1', libelle: 'ClientABC', action: 'consultation' });
  j('2026-10-22T10:00:00Z', { entite: 'candidature', id: 'c1', libelle: 'ClientABC', action: 'modification', changements: [{ champ: 'statut', avant: 'en_cours', apres: 'entretien' }] });
  j('2026-10-26T10:00:00Z', { entite: 'candidature', id: 'c1', libelle: 'ClientABC', action: 'modification', changements: [{ champ: 'statut', avant: 'entretien', apres: 'refuse' }] });
  j('2026-10-26T11:00:00Z', { entite: 'tache', id: 't1', libelle: 'Relancer', action: 'modification', changements: [{ champ: 'faite', avant: '0', apres: '1' }] });
  j('2026-10-26T12:00:00Z', { entite: 'echange', id: 'e1', libelle: 'email envoye', action: 'creation' });
  db.prepare("INSERT INTO offres (id_offre, titre, categorie, date_detection) VALUES ('d1', 'X', 'autre', '2026-10-19'), ('d2', 'Y', 'autre', '2026-10-19')").run();
}

test('rapport par jour : compteurs par action, jours sans action à zéro, remise à non vue non comptée', () => {
  const db = base();
  remplir(db);
  const r = rapport(db, { du: '2026-10-19', au: '2026-10-22', grain: 'jour' });
  assert.deepEqual(r.periodes.map(p => p.periode), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  const [lun, mar, mer, jeu] = r.periodes;
  assert.equal(lun.offres_vues, 2);
  assert.equal(lun.offres_ecartees, 1);
  assert.equal(lun.offres_detectees, 2);
  assert.equal(mar.offres_vues, 0);
  assert.equal(mer.candidatures_creees, 2);
  assert.equal(mer.candidatures_envoyees, 1);
  assert.equal(jeu.candidatures_envoyees, 1);
  assert.equal(jeu.candidatures_vues, 1);
  assert.equal(jeu.entretiens, 1);
  assert.equal(jeu.changements_statut, 2);
  assert.match(r.journal_depuis, /^2026-10-19T08:00:00/);
});

test('rapport par semaine : regroupement lundi à dimanche', () => {
  const db = base();
  remplir(db);
  const r = rapport(db, { du: '2026-10-19', au: '2026-10-26', grain: 'semaine' });
  assert.deepEqual(r.periodes.map(p => [p.periode, p.semaine]), [['2026-10-19', '2026-S43'], ['2026-10-26', '2026-S44']]);
  const [s43, s44] = r.periodes;
  assert.equal(s43.offres_vues, 2);
  assert.equal(s43.entretiens, 1);
  assert.equal(s44.refus, 1);
  assert.equal(s44.taches_faites, 1);
  assert.equal(s44.echanges, 1);
});

test('rapport par mois : regroupement au premier du mois, CSV avec la colonne mois', () => {
  const db = base();
  remplir(db);
  const r = rapport(db, { du: '2026-09-15', au: '2026-10-26', grain: 'mois' });
  assert.deepEqual(r.periodes.map(p => [p.periode, p.mois]), [['2026-09-01', '2026-09'], ['2026-10-01', '2026-10']]);
  const [sep, oct] = r.periodes;
  assert.equal(sep.offres_vues, 0);
  assert.equal(oct.offres_vues, 2);
  assert.equal(oct.refus, 1);
  assert.equal(oct.offres_detectees, 2);
  assert.match(rapportCsv(r).split('\n')[0], /^\uFEFF?periode;mois;offres_detectees/);
  const defaut = rapport(db, { au: '2026-10-26', grain: 'mois' });
  assert.equal(defaut.du, '2025-11-01');
  assert.equal(defaut.periodes.length, 12);
});

test('rapport : CSV avec BOM et point-virgule, journal vide sans erreur', () => {
  const db = base();
  const vide = rapport(db, { du: '2026-10-19', au: '2026-10-20' });
  assert.equal(vide.journal_depuis, null);
  const csv = rapportCsv(vide);
  assert.ok(csv.startsWith('﻿periode;offres_detectees;'));
  assert.equal(csv.trim().split('\n').length, 3);
});

test('rapport : création antérieure au statut journalisé comptée envoyée si la candidature est envoyée et datée du jour', () => {
  const db = base();
  db.prepare("INSERT INTO candidatures (id, entreprise, poste, statut, date) VALUES ('a1', 'ClientABC', 'Comptable', 'refuse', '2026-10-21'), ('a2', 'ProjetX', 'Formateur', 'en_cours', '2026-10-01')").run();
  journaliser(db, { entite: 'candidature', id: 'a1', libelle: 'ClientABC', action: 'creation', quand: new Date('2026-10-21T10:00:00Z') });
  journaliser(db, { entite: 'candidature', id: 'a2', libelle: 'ProjetX', action: 'creation', quand: new Date('2026-10-21T11:00:00Z') });
  const [jour] = rapport(db, { du: '2026-10-21', au: '2026-10-21', grain: 'jour' }).periodes;
  assert.equal(jour.candidatures_creees, 2);
  assert.equal(jour.candidatures_envoyees, 1);
});
