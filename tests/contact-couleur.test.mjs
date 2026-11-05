// Tests de la couleur d'un contact (ligne 131, schéma v14) et de l'épingle (schéma v15). Données fictives, serveur temporaire sans .env.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ouvrirBase, VERSION_SCHEMA } from '../lib/offres.mjs';
import { serveurTemporaire } from './serveur-temporaire.mjs';

test('schéma v15 : colonnes couleur et epingle contrôlées, base v13 migrée sans perte', () => {
  assert.ok(VERSION_SCHEMA >= 15);
  const dir = mkdtempSync(join(tmpdir(), 'suivi-coul-'));
  try {
    const f = join(dir, 'a.db');
    const db = ouvrirBase(f);
    db.prepare("INSERT INTO contacts (id, prenom, couleur) VALUES ('k1', 'Camille', 'blue')").run();
    assert.throws(() => db.prepare("UPDATE contacts SET epingle = 2 WHERE id = 'k1'").run(), /CHECK/);
    assert.throws(() => db.prepare("INSERT INTO contacts (id, prenom, couleur) VALUES ('k2', 'Alex', 'turquoise')").run(), /CHECK/);
    db.close();
    // Une base en version 13, sans la colonne, passe en 14 et garde ses contacts
    const v13 = new DatabaseSync(f);
    v13.exec('ALTER TABLE contacts DROP COLUMN couleur; ALTER TABLE contacts DROP COLUMN epingle; PRAGMA user_version = 13');
    v13.close();
    const db2 = ouvrirBase(f);
    assert.equal(db2.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    assert.equal(db2.prepare("SELECT couleur, epingle FROM contacts WHERE id = 'k1'").get().epingle, 0);
    assert.throws(() => db2.prepare("UPDATE contacts SET couleur = 'turquoise' WHERE id = 'k1'").run(), /CHECK/);
    db2.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('routes : couleur d un contact, valeurs refusées, lecture dans la liste', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-coul-'));
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const k = (await appel('POST', '/api/contacts', { prenom: 'Camille' })).data;
    assert.equal(k.couleur, '');
    assert.equal((await appel('PATCH', '/api/contacts/' + k.id, { couleur: 'turquoise' })).status, 400);
    assert.equal((await appel('PATCH', '/api/contacts/' + k.id, { couleur: 'violet' })).data.couleur, 'violet');
    assert.equal((await appel('GET', '/api/contacts')).data.find(x => x.id === k.id).couleur, 'violet');
    assert.equal((await appel('PATCH', '/api/contacts/' + k.id, { couleur: '' })).data.couleur, '');
    // épingle : faux par défaut, les contacts épinglés remontent en tête de la liste
    assert.equal(k.epingle, false);
    const autre = (await appel('POST', '/api/contacts', { prenom: 'Zoé', entreprise: 'ZZZ' })).data;
    assert.equal((await appel('PATCH', '/api/contacts/' + autre.id, { epingle: true })).data.epingle, true);
    assert.equal((await appel('GET', '/api/contacts')).data[0].id, autre.id);
    assert.equal((await appel('PATCH', '/api/contacts/' + autre.id, { epingle: 'oui' })).status, 400);
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});
