import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { exporterBase } from '../lib/export-base.mjs';

// ANCHOR: la copie est faite une fois par jour, jamais dans un dossier absent, et seules les 7 dernières sont gardées
test('exporterBase : désactivée, dossier absent, copie du jour, rotation', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'export-base-'));
  try {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (42)');
    assert.equal(exporterBase(db, '').raison, 'désactivé');
    assert.equal(exporterBase(db, join(dossier, 'absent')).raison, 'dossier introuvable');
    assert.equal(existsSync(join(dossier, 'absent')), false, 'le dossier ne doit jamais être créé');
    for (let j = 1; j <= 9; j++) writeFileSync(join(dossier, `suivi-2026-01-0${j}.db`), 'x');
    writeFileSync(join(dossier, 'notes.txt'), 'autre fichier');
    const r = exporterBase(db, dossier, new Date('2026-02-10T12:00:00'));
    assert.equal(r.ok, true);
    const copie = new DatabaseSync(r.fichier, { readOnly: true });
    assert.equal(copie.prepare('SELECT x FROM t').get().x, 42);
    copie.close();
    const restants = readdirSync(dossier).sort();
    assert.equal(restants.filter(n => n.startsWith('suivi-')).length, 7);
    assert.ok(restants.includes('notes.txt'), 'un fichier étranger n\'est jamais supprimé');
    assert.equal(restants.some(n => n.endsWith('.tmp')), false);
    assert.equal(exporterBase(db, dossier, new Date('2026-02-10T20:00:00')).raison, "déjà faite aujourd'hui");
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
