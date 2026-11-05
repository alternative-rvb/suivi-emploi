// Tests des exports de candidatures (client/src/exports.ts, ligne 97) : CSV pour tableur, XML bien formé, PDF lisible, rapport PDF.
import test from 'node:test';
import assert from 'node:assert/strict';
import { _tests, journalCsv, rapportPdf, rechercheCsv, recherchePdf } from '../client/src/exports.ts';

const { csv, xml, pdf } = _tests;
const candidatures = [
  { id: 'c1', entreprise: 'ClientABC', poste: 'Comptable "unique"', description: 'Ligne 1\nLigne 2', statut: 'en_cours', raison: '', date: '2026-10-20', plateforme: 'France Travail', interet: 'fort', notes: 'Accents : éàç œ €' },
  { id: 'c2', entreprise: 'ProjetX & fils <SARL>', poste: 'Formateur\u0007', description: '', statut: 'refuse', raison: 'Profil', date: '2026-10-21', plateforme: '', interet: '', notes: '' },
];

test('export CSV : BOM, points-virgules, guillemets doublés, sauts de ligne aplatis, plus récente en premier', () => {
  const t = csv(candidatures);
  assert.ok(t.startsWith('﻿'));
  const lignes = t.slice(1).trimEnd().split('\r\n');
  assert.equal(lignes.length, 3);
  assert.match(lignes[0], /^"Entreprise";"Poste";/);
  assert.match(lignes[1], /^"ProjetX & fils <SARL>"/);
  assert.match(lignes[2], /"Comptable ""unique"""/);
  assert.match(lignes[2], /"Ligne 1 Ligne 2"/);
  assert.match(lignes[2], /éàç œ €/);
});

test('export XML : échappement, caractères de contrôle retirés, structure attendue', () => {
  const t = xml(candidatures);
  assert.match(t, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(t, /ProjetX &amp; fils &lt;SARL&gt;/);
  assert.ok(!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(t));
  assert.equal((t.match(/<candidature /g) ?? []).length, 2);
  assert.equal((t.match(/<\/candidature>/g) ?? []).length, 2);
  assert.match(t, /<\/candidatures>\n$/);
});

test('export PDF des candidatures et rapport PDF : documents valides', async () => {
  const lire = async blob => Buffer.from(await blob.arrayBuffer());
  const p = await lire(await pdf(candidatures));
  assert.equal(p.subarray(0, 5).toString('latin1'), '%PDF-');
  const r = await lire(await rapportPdf("Bilan d'activité", 'Du 1er au 7', [['periode', 'Période'], ['offres_vues', 'Offres vues']], [{ periode: 'Semaine 43', offres_vues: 4 }], { periode: 'Total', offres_vues: 4 }));
  assert.equal(r.subarray(0, 5).toString('latin1'), '%PDF-');
  const ancien = { ...blocs[0], id: 'c0', date: '2026-10-02', employeur: 'ClientDEF', metier: 'web_design' };
  const j = (await lire(await recherchePdf('Période du 1er au 31', [...blocs, ancien]))).toString('latin1');
  assert.ok(j.startsWith('%PDF-'));
  // NOTE: justificatif de la plus ancienne à la plus récente, badges métier, statistiques et numéro de page
  assert.ok(j.indexOf('ClientDEF') < j.indexOf('ClientABC'));
  for (const t of ['Web design', 'Comptabilit', 'Statistiques', '1 / 1', '2 entretien', 'Taux d', 'Taux de r', 'Total', '7 j', '100 %']) assert.ok(j.includes(t), t);
});

/** @type {import('../client/src/actions.ts').BlocRecherche[]} */
const blocs = [{ id: 'c1', date: '2026-10-21', employeur: 'ClientABC; "SARL"', poste: 'Comptable', numero: '123', plateforme: 'France Travail', lieu: 'Villeneuve', contrat: 'CDI', envoi: 'Email', statut: 'Entretien', metier: 'comptabilite',
  lignes: [{ date: '2026-10-21', texte: 'Candidature envoyée (email)', resultat: 'En cours', periode: true }, { date: '2026-10-28', texte: 'Entretien', resultat: 'Entretien', periode: true }], anterieure: false, entretien: true, reponse: true, echanges: 1, delai: 7 }];

test("export CSV de la recherche d'emploi : une ligne par action, candidature répétée, guillemets doublés", () => {
  const t = rechercheCsv(blocs);
  assert.ok(t.startsWith('\uFEFF'));
  const lignes = t.slice(1).trimEnd().split('\r\n');
  assert.equal(lignes.length, 3);
  assert.match(lignes[0], /^"N° d'offre";"Date de candidature";"Employeur";"Poste";"Plateforme"/);
  assert.ok(lignes[1].startsWith('"123";"21/10/2026";"ClientABC; ""SARL""";"Comptable"'));
  assert.ok(lignes[2].endsWith('"28/10/2026";"Entretien";"Entretien"'));
});

test('export CSV du journal complet : toutes les colonnes, valeurs avant et après', () => {
  const t = journalCsv([{ id: 1, ts: '2026-10-22T08:05:00Z', jour: '2026-10-22', rubrique: 'Réglages', element: 'x', action: 'Modification : valeur', avant: 'a', apres: 'b\nc' }]);
  const lignes = t.slice(1).trimEnd().split('\r\n');
  assert.equal(lignes[0], '"Date";"Heure";"Rubrique";"Élément";"Action";"Avant";"Après"');
  assert.match(lignes[1], /^"22\/10\/2026";"\d\d:\d\d";"Réglages";"x";"Modification : valeur";"a";"b c"$/);
});
