// Tests du lien de candidature (ligne 139, schéma v16). Données fictives, serveur temporaire sans .env.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ouvrirBase, VERSION_SCHEMA } from '../lib/offres.mjs';
import { serveurTemporaire } from './serveur-temporaire.mjs';

test('schéma v16 : colonne lien ajoutée à une base v15 sans perte', () => {
  assert.ok(VERSION_SCHEMA >= 16);
  const dir = mkdtempSync(join(tmpdir(), 'suivi-lien-'));
  try {
    const f = join(dir, 'a.db');
    const db = ouvrirBase(f);
    db.prepare("INSERT INTO candidatures (id, entreprise, poste) VALUES ('c1', 'ClientABC', 'Poste X')").run();
    db.close();
    const v15 = new DatabaseSync(f);
    v15.exec('ALTER TABLE candidatures DROP COLUMN lien; PRAGMA user_version = 15');
    v15.close();
    const db2 = ouvrirBase(f);
    assert.equal(db2.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    assert.equal(db2.prepare("SELECT lien FROM candidatures WHERE id = 'c1'").get().lien, '');
    db2.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('routes : lien http ou https accepté, autre valeur refusée, conservé par PUT /api/state sans le champ', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-lien-'));
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const base = { id: 'c-lien', entreprise: 'ClientABC', poste: 'Poste X' };
    assert.equal((await appel('POST', '/api/candidatures', base)).data.lien, '');
    assert.equal((await appel('PATCH', '/api/candidatures/c-lien', { lien: 'ftp://exemple.fr/x' })).status, 400);
    assert.equal((await appel('PATCH', '/api/candidatures/c-lien', { lien: 'javascript:alert(1)' })).status, 400);
    const ok = await appel('PATCH', '/api/candidatures/c-lien', { lien: ' https://exemple.fr/postuler/123 ' });
    assert.equal(ok.data.lien, 'https://exemple.fr/postuler/123');
    // Une interface restée ouverte, qui ne connaît pas le champ, ne l'efface pas
    const etat = (await appel('GET', '/api/state')).data;
    const sans = etat.candidatures.map(({ lien, ...c }) => c);
    assert.equal((await appel('PUT', '/api/state', { candidatures: sans })).status, 200);
    assert.equal((await appel('GET', '/api/candidatures/c-lien')).data.lien, 'https://exemple.fr/postuler/123');
    assert.equal((await appel('PATCH', '/api/candidatures/c-lien', { lien: '' })).data.lien, '');
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});
