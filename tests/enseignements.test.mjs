// Tests du champ enseignements des candidatures (v29) : migration d'une base v28 et conservation par PUT /api/state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ouvrirBase, VERSION_SCHEMA } from '../lib/offres.mjs';

test('enseignements : migration v28 vers v29, colonne vide par défaut', () => {
  assert.ok(VERSION_SCHEMA >= 29);
  const dossier = mkdtempSync(join(tmpdir(), 'enseignements-'));
  try {
    const chemin = join(dossier, 'suivi.db');
    const v28 = ouvrirBase(chemin);
    v28.prepare("INSERT INTO candidatures (id, entreprise, poste, statut) VALUES ('c1', 'ClientABC', 'Poste', 'refuse')").run();
    v28.exec('ALTER TABLE candidatures DROP COLUMN enseignements; PRAGMA user_version = 28');
    v28.close();

    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('SELECT enseignements FROM candidatures WHERE id = ?').get('c1').enseignements, '');
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    db.close();
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
