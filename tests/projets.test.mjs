// Tests des projets (ligne 145) : schéma v19 (tables, index, clés étrangères) et routes CRUD liées aux compétences.
// Données fictives uniquement, base et serveur dans un dossier temporaire, sans .env (aucun appel réseau).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ouvrirBase, VERSION_SCHEMA } from '../lib/offres.mjs';
import { serveurTemporaire } from './serveur-temporaire.mjs';

test('schéma v19 : migration depuis la v18, tables, index et clés étrangères', () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-projets-'));
  try {
    const chemin = join(dir, 'suivi.db');
    ouvrirBase(chemin).close();
    // NOTE: base v18 simulée : tables v19 retirées, version redescendue
    const brute = new DatabaseSync(chemin);
    brute.exec('DROP TABLE projet_competences; DROP TABLE projets; PRAGMA user_version = 18');
    brute.close();
    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    assert.ok(VERSION_SCHEMA >= 19);
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name));
    assert.ok(tables.has('projets') && tables.has('projet_competences'));
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'projet_competences_competence'").get());
    assert.equal(db.prepare('PRAGMA foreign_key_list(projet_competences)').all().length, 2);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('routes /api/projets : CRUD, validation, liens aux compétences, journal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-projets-'));
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const c = (await appel('POST', '/api/competences', { domaine: 'Développement web', competence: 'Next.js' })).data;
    assert.equal((await appel('POST', '/api/projets', { url: 'https://example.com' })).status, 400);
    assert.equal((await appel('POST', '/api/projets', { nom: 'ProjetX', url: 'pas-une-adresse' })).status, 400);
    assert.equal((await appel('POST', '/api/projets', { nom: 'ProjetX', type: 'inconnu' })).status, 400);
    assert.equal((await appel('POST', '/api/projets', { nom: 'ProjetX', ia: 'beaucoup' })).status, 400);
    assert.equal((await appel('POST', '/api/projets', { nom: 'ProjetX', debut: '2026' })).status, 400);
    assert.equal((await appel('POST', '/api/projets', { nom: 'ProjetX', competences: ['absente'] })).status, 400);

    const p = await appel('POST', '/api/projets', { nom: 'ProjetX', url: 'https://example.com/x', type: 'demo', debut: '2026-09', technologies: 'Leaflet', competences: [c.id, c.id] });
    assert.equal(p.status, 201);
    assert.match(p.data.id, /^p-/);
    assert.equal(p.data.ia, '');
    assert.deepEqual(p.data.competences, [c.id]);

    assert.equal((await appel('PATCH', `/api/projets/${p.data.id}`, { ia: 'assistee' })).data.ia, 'assistee');
    assert.deepEqual((await appel('PATCH', `/api/projets/${p.data.id}`, { ia: 'aucune' })).data.competences, [c.id]);
    assert.equal((await appel('PATCH', '/api/projets/absent', { nom: 'Y' })).status, 404);

    const etat = (await appel('GET', '/api/state')).data;
    assert.deepEqual(etat.projets.map(x => [x.nom, x.competences]), [['ProjetX', [c.id]]]);

    // NOTE: supprimer une compétence la retire des projets (pas de lien orphelin)
    assert.equal((await appel('DELETE', `/api/competences/${c.id}`)).status, 200);
    assert.deepEqual((await appel('GET', `/api/projets/${p.data.id}`)).data.competences, []);

    const ev = (await appel('GET', `/api/journal?entite=projet&id=${p.data.id}`)).data;
    assert.ok(ev.some(e => e.action === 'creation'));
    assert.ok(ev.some(e => e.champ === 'ia'));

    assert.equal((await appel('DELETE', `/api/projets/${p.data.id}`)).status, 200);
    assert.equal((await appel('GET', `/api/projets/${p.data.id}`)).status, 404);
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
