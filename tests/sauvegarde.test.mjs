import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lancerSauvegarde, MINUTES_ENTRE_SAUVEGARDES } from '../lib/sauvegarde.mjs';

test('lancerSauvegarde : désactivée sans variable, script introuvable signalé', async () => {
  assert.deepEqual(await lancerSauvegarde('', '/tmp'), { ok: false, raison: 'désactivé' });
  assert.deepEqual(await lancerSauvegarde(undefined, '/tmp'), { ok: false, raison: 'désactivé' });
  assert.deepEqual(await lancerSauvegarde('absent.sh', '/tmp/nulle-part'), { ok: false, raison: 'script introuvable' });
});

test('lancerSauvegarde : script relatif lancé dans la racine avec le délai minimal, sortie et échec remontés', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sauvegarde-'));
  try {
    writeFileSync(join(dir, 'ok.sh'), '#!/bin/sh\necho "$SAUVEGARDE_MIN_MINUTES" > trace.txt\necho Fait\n');
    writeFileSync(join(dir, 'ko.sh'), '#!/bin/sh\necho Raté >&2\nexit 1\n');
    chmodSync(join(dir, 'ok.sh'), 0o755);
    chmodSync(join(dir, 'ko.sh'), 0o755);
    assert.deepEqual(await lancerSauvegarde('ok.sh', dir), { ok: true, sortie: 'Fait' });
    assert.equal(readFileSync(join(dir, 'trace.txt'), 'utf8').trim(), String(MINUTES_ENTRE_SAUVEGARDES));
    assert.deepEqual(await lancerSauvegarde(join(dir, 'ko.sh'), '/'), { ok: false, raison: 'Raté' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
