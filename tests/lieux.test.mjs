// Tests du champ lieux des candidatures : validation, lecture tolérante et migration d'une base antérieure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const { lireLieux, validerLieux } = await import('../lib/lieux.mjs');
const { ouvrirBase, VERSION_SCHEMA } = await import('../lib/offres.mjs');

const lieu = (extra = {}) => ({ id: 'l1', nom: 'Site A', adresse: '1 rue Exemple, Ville', lon: 6.0, lat: 43.1, jours: 38, peage: 4, ...extra });

test('lieux : un lieu valide est conservé, les valeurs absentes prennent leur défaut', () => {
  assert.deepEqual(validerLieux([lieu()]), [lieu()]);
  assert.deepEqual(validerLieux([{ id: 'l2', nom: 'Site B' }]), [{ id: 'l2', nom: 'Site B', adresse: '', lon: null, lat: null, jours: 0, peage: 0 }]);
  assert.deepEqual(validerLieux([]), []);
});

test('lieux : refus des données invalides', () => {
  assert.throws(() => validerLieux('x'), /liste/);
  assert.throws(() => validerLieux([lieu({ nom: '  ' })]), /obligatoire/);
  assert.throws(() => validerLieux([lieu({ jours: -1 })]), /jours/);
  assert.throws(() => validerLieux([lieu({ peage: 'cher' })]), /peage/);
  assert.throws(() => validerLieux([lieu({ lat: null })]), /ensemble/);
  assert.throws(() => validerLieux([lieu({ inconnu: 1 })]), /inconnus/);
  assert.throws(() => validerLieux([lieu(), lieu()]), /double/);
  assert.throws(() => validerLieux(Array.from({ length: 9 }, (_, i) => lieu({ id: 'l' + i }))), /au plus/);
});

test('lieux : lecture tolérante d\'une valeur stockée', () => {
  assert.deepEqual(lireLieux('[]'), []);
  assert.deepEqual(lireLieux(undefined), []);
  assert.deepEqual(lireLieux('pas du json'), []);
  assert.deepEqual(lireLieux('{"a":1}'), []);
  assert.equal(lireLieux(JSON.stringify([lieu()]))[0].nom, 'Site A');
});

test('migration : une base sans la colonne lieux la reçoit, les données existantes restent intactes', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'lieux-'));
  try {
    const chemin = join(dossier, 'suivi.db');
    const ancienne = ouvrirBase(chemin);
    ancienne.exec('ALTER TABLE candidatures DROP COLUMN lieux');
    ancienne.prepare("INSERT INTO candidatures (id, entreprise, poste, statut) VALUES ('c1', 'ClientABC', 'Poste', 'en_cours')").run();
    ancienne.prepare("INSERT INTO echanges (id, candidature_id, date, canal, sens, resume) VALUES ('e1', 'c1', '2026-10-21', 'email', 'recu', 'Message')").run();
    ancienne.exec(`PRAGMA user_version = ${VERSION_SCHEMA - 1}`);
    ancienne.close();

    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('SELECT lieux FROM candidatures WHERE id = ?').get('c1').lieux, '[]');
    assert.equal(db.prepare('SELECT resume FROM echanges WHERE id = ?').get('e1').resume, 'Message');
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    db.close();
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
