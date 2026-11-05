// Tests du lien contact et candidature sans offre (ligne 124, schéma v13). Données fictives, serveur temporaire sans .env.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ouvrirBase, VERSION_SCHEMA } from '../lib/offres.mjs';
import { serveurTemporaire } from './serveur-temporaire.mjs';

test('schéma v13 : table contact_candidatures, clés étrangères et cascade', () => {
  assert.ok(VERSION_SCHEMA >= 13);
  const dir = mkdtempSync(join(tmpdir(), 'suivi-cc-'));
  try {
    const f = join(dir, 'a.db');
    const db = ouvrirBase(f);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    db.prepare("INSERT INTO contacts (id, prenom) VALUES ('k1', 'Camille')").run();
    db.prepare("INSERT INTO candidatures (id, entreprise, poste) VALUES ('c1', 'ClientABC', 'Comptable')").run();
    db.prepare("INSERT INTO contact_candidatures VALUES ('k1', 'c1')").run();
    assert.throws(() => db.prepare("INSERT INTO contact_candidatures VALUES ('k1', 'absente')").run(), /FOREIGN KEY/);
    assert.throws(() => db.prepare("INSERT INTO contact_candidatures VALUES ('k1', 'c1')").run(), /UNIQUE|PRIMARY/);
    db.prepare("DELETE FROM candidatures WHERE id = 'c1'").run();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_candidatures').get().n, 0);
    db.close();
    // Une base en version 12 passe en 13 sans perte
    const v12 = new DatabaseSync(f);
    v12.exec('DROP TABLE contact_candidatures; PRAGMA user_version = 12');
    v12.close();
    const db2 = ouvrirBase(f);
    assert.equal(db2.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    assert.equal(db2.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'contact_candidatures'").get().n, 1);
    assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM contacts').get().n, 1);
    db2.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('routes : contact relié à une candidature sans offre, journal et suppression', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-cc-'));
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const c = (await appel('POST', '/api/candidatures', { entreprise: 'ClientABC', poste: 'Comptable', statut: 'a_faire' })).data;
    assert.equal((await appel('POST', '/api/contacts', { prenom: 'Camille', candidatures: ['absente'] })).status, 400);
    const k = (await appel('POST', '/api/contacts', { prenom: 'Camille', nom: 'Martin', candidatures: [c.id, c.id] })).data;
    assert.deepEqual(k.candidatures, [c.id]);
    assert.deepEqual(k.offres, []);
    assert.deepEqual((await appel('GET', '/api/state')).data.contacts[0].candidatures, [c.id]);
    assert.deepEqual((await appel('PATCH', `/api/contacts/${k.id}`, { candidatures: [] })).data.candidatures, []);
    // Les deux listes sont indépendantes : changer l'une ne touche pas l'autre
    await appel('PATCH', `/api/contacts/${k.id}`, { candidatures: [c.id] });
    assert.deepEqual((await appel('PATCH', `/api/contacts/${k.id}`, { prenom: 'Camille' })).data.candidatures, [c.id]);
    // Filtres de liste : par candidature pour les contacts, par lien et par jour pour les rendez-vous
    await appel('POST', '/api/contacts', { prenom: 'Sam' });
    assert.equal((await appel('GET', '/api/contacts')).data.length, 2);
    assert.deepEqual((await appel('GET', `/api/contacts?candidature_id=${c.id}`)).data.map(x => x.id), [k.id]);
    assert.equal((await appel('GET', '/api/contacts?candidature_id=absente')).data.length, 0);
    const r1 = (await appel('POST', '/api/rendez_vous', { titre: 'Entretien', debut: '2026-11-03T10:00', candidature_id: c.id, contact_id: k.id })).data;
    await appel('POST', '/api/rendez_vous', { titre: 'Cafe reseau', debut: '2026-12-01T09:00' });
    assert.equal((await appel('GET', '/api/rendez_vous')).data.length, 2);
    assert.deepEqual((await appel('GET', `/api/rendez_vous?candidature_id=${c.id}`)).data.map(x => x.id), [r1.id]);
    assert.deepEqual((await appel('GET', `/api/rendez_vous?contact_id=${k.id}`)).data.map(x => x.id), [r1.id]);
    assert.equal((await appel('GET', '/api/rendez_vous?du=2026-11-03&au=2026-11-30')).data.length, 1);
    assert.equal((await appel('GET', '/api/rendez_vous?du=2026-11-04')).data.length, 1);
    assert.equal((await appel('GET', '/api/state')).data.rendez_vous.length, 2);
    const ev = (await appel('GET', `/api/journal?entite=contact&id=${k.id}`)).data;
    assert.ok(ev.some(e => e.champ === 'candidatures'));
    // La suppression de la candidature retire le lien, pas le contact
    assert.equal((await appel('DELETE', `/api/candidatures/${c.id}`)).status, 200);
    const apres = (await appel('GET', `/api/contacts/${k.id}`)).data;
    assert.deepEqual(apres.candidatures, []);
    assert.equal(apres.prenom, 'Camille');
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
