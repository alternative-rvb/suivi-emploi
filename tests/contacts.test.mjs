// Tests des contacts (ligne 119) : schéma v11 (contraintes, clés étrangères, index), offres liées épargnées par la purge, routes CRUD journalisées.
// Données fictives uniquement, base et serveur dans un dossier temporaire, sans .env (aucun appel réseau).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fusionnerOffres, ouvrirBase, retirerOffres, VERSION_SCHEMA } from '../lib/offres.mjs';
import { serveurTemporaire } from './serveur-temporaire.mjs';

const dossierTemp = () => mkdtempSync(join(tmpdir(), 'suivi-contacts-'));
const ancienne = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);

function offre(db, id, { date = ancienne, departement = '83' } = {}) {
  db.prepare("INSERT INTO offres (id_offre, titre, entreprise, departement, ville, date_detection, categorie) VALUES (?, 'Comptable', 'ClientABC', ?, 'Villeneuve', ?, 'comptabilite')").run(id, departement, date);
}

test('schéma v11 : migration depuis la v10, tables, index et clés étrangères', () => {
  const dir = dossierTemp();
  try {
    const chemin = join(dir, 'suivi.db');
    ouvrirBase(chemin).close();
    // NOTE: base v10 simulée : tables v11 retirées, version redescendue
    const brute = new DatabaseSync(chemin);
    brute.exec('DROP TABLE contact_offres; DROP TABLE rendez_vous; DROP TABLE contacts; PRAGMA user_version = 10');
    brute.close();
    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    assert.ok(VERSION_SCHEMA >= 11);
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name));
    for (const t of ['contacts', 'contact_offres', 'rendez_vous']) assert.ok(tables.has(t), t);
    const index = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(r => r.name));
    for (const i of ['contact_offres_offre', 'contacts_entreprise', 'rendez_vous_debut', 'rendez_vous_offre', 'rendez_vous_candidature', 'rendez_vous_contact', 'rendez_vous_google']) assert.ok(index.has(i), i);
    // NOTE: chaque colonne de jointure est couverte par un index (clé primaire ou index dédié)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    // NOTE: la v11 ne fait que créer des tables, aucune copie de sauvegarde n'est nécessaire
    assert.ok(!readdirSync(dir).includes('data') || !readdirSync(join(dir, 'data', 'backups')).some(f => f.includes('schema-v11')));
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('contraintes : contact sans nom refusé, liens en cascade, rendez-vous détachés', () => {
  const db = ouvrirBase(':memory:');
  offre(db, 'man-1');
  db.prepare("INSERT INTO candidatures (id, entreprise, poste, offre_id) VALUES ('c1', 'ClientABC', 'Comptable', 'man-1')").run();
  assert.throws(() => db.prepare("INSERT INTO contacts (id) VALUES ('vide')").run(), /CHECK/);
  db.prepare("INSERT INTO contacts (id, prenom, entreprise) VALUES ('k1', 'Camille', 'ClientABC')").run();
  db.prepare("INSERT INTO contact_offres (contact_id, offre_id) VALUES ('k1', 'man-1')").run();
  assert.throws(() => db.prepare("INSERT INTO contact_offres (contact_id, offre_id) VALUES ('k1', 'absente')").run(), /FOREIGN KEY/);
  assert.throws(() => db.prepare("INSERT INTO contact_offres (contact_id, offre_id) VALUES ('k1', 'man-1')").run(), /UNIQUE|PRIMARY/);

  db.prepare("INSERT INTO rendez_vous (id, debut, offre_id, candidature_id, contact_id) VALUES ('r1', '2026-11-03T10:00', 'man-1', 'c1', 'k1')").run();
  assert.throws(() => db.prepare("INSERT INTO rendez_vous (id, debut, type) VALUES ('r2', '2026-11-03T10:00', 'inconnu')").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO rendez_vous (id, debut, duree) VALUES ('r3', '2026-11-03T10:00', 0)").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO rendez_vous (id, debut, contact_id) VALUES ('r4', '2026-11-03T10:00', 'absent')").run(), /FOREIGN KEY/);
  // NOTE: plusieurs rendez-vous sans événement Google, mais un événement Google n'est rattaché qu'une fois
  db.prepare("INSERT INTO rendez_vous (id, debut) VALUES ('r5', '2026-11-04T10:00')").run();
  db.prepare("INSERT INTO rendez_vous (id, debut, google_id) VALUES ('r6', '2026-11-04T11:00', 'g1')").run();
  assert.throws(() => db.prepare("INSERT INTO rendez_vous (id, debut, google_id) VALUES ('r7', '2026-11-04T12:00', 'g1')").run(), /UNIQUE/);

  // Suppression de l'offre : le lien du contact disparaît, le contact reste, le rendez-vous perd son offre mais pas sa candidature
  db.prepare("DELETE FROM candidatures WHERE id = 'c1'").run();
  db.prepare("DELETE FROM offres WHERE id_offre = 'man-1'").run();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_offres').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n, 1);
  const r1 = db.prepare("SELECT offre_id, candidature_id, contact_id FROM rendez_vous WHERE id = 'r1'").get();
  assert.deepEqual({ ...r1 }, { offre_id: null, candidature_id: null, contact_id: 'k1' });
  db.prepare("DELETE FROM contacts WHERE id = 'k1'").run();
  assert.equal(db.prepare("SELECT contact_id FROM rendez_vous WHERE id = 'r1'").get().contact_id, null);
  db.close();
});

test('purge et réglages : une offre liée à un contact ou à un rendez-vous est conservée', () => {
  const db = ouvrirBase(':memory:');
  for (const id of ['libre', 'contact', 'rdv']) offre(db, id);
  db.prepare("INSERT INTO contacts (id, nom) VALUES ('k1', 'Dupont')").run();
  db.prepare("INSERT INTO contact_offres VALUES ('k1', 'contact')").run();
  db.prepare("INSERT INTO rendez_vous (id, debut, offre_id) VALUES ('r1', '2026-11-03T10:00', 'rdv')").run();
  fusionnerOffres(db, [], { zones: ['83'], exclusions: [] });
  assert.deepEqual(db.prepare('SELECT id_offre FROM offres ORDER BY id_offre').all().map(r => r.id_offre), ['contact', 'rdv']);
  // NOTE: une zone retirée des réglages épargne aussi les offres liées
  assert.equal(retirerOffres(db, { zones: ['13'], mots_exclus: [] }), 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM offres').get().n, 2);
  // Une synchro qui renvoie l'offre la met à jour sans casser le lien (UPSERT, pas de suppression puis insertion)
  const jour = new Date().toISOString().slice(0, 10);
  fusionnerOffres(db, [{ id_offre: 'contact', titre: 'Comptable confirmé', lieu: '83 - Villeneuve', date_de_detection: jour }], { zones: ['83'], exclusions: [] });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM contact_offres WHERE offre_id = 'contact'").get().n, 1);
  db.close();
});

test('routes /api/contacts : CRUD, validation, offres liées, journal sans nom de famille', async () => {
  const dir = dossierTemp();
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const o = (await appel('POST', '/api/offres', { titre: 'Comptable fournisseurs', entreprise: 'ClientABC', ville: 'Villeneuve' })).data;
    assert.equal((await appel('POST', '/api/contacts', { fonction: 'RH' })).status, 400);
    assert.equal((await appel('POST', '/api/contacts', { prenom: 'Camille', email: 'pas-un-email' })).status, 400);
    assert.equal((await appel('POST', '/api/contacts', { prenom: 'Camille', telephone: 'appeler' })).status, 400);
    assert.equal((await appel('POST', '/api/contacts', { prenom: 'Camille', offres: ['absente'] })).status, 400);
    assert.equal((await appel('POST', '/api/contacts', { prenom: 'Camille', inconnu: 1 })).status, 400);

    const k = await appel('POST', '/api/contacts', { prenom: ' Camille ', nom: 'Martin', fonction: 'Chargée de recrutement', entreprise: 'ClientABC', telephone: '+33 6 00 00 00 00', email: 'Contact@Example.com', offres: [o.id_offre, o.id_offre] });
    assert.equal(k.status, 201);
    assert.match(k.data.id, /^k-/);
    assert.equal(k.data.prenom, 'Camille');
    assert.equal(k.data.email, 'contact@example.com');
    assert.deepEqual(k.data.offres, [o.id_offre]);
    assert.equal((await appel('POST', '/api/contacts', { id: k.data.id, prenom: 'Autre' })).status, 409);

    assert.equal((await appel('PATCH', `/api/contacts/${k.data.id}`, { prenom: '', nom: '' })).status, 400);
    assert.deepEqual((await appel('PATCH', `/api/contacts/${k.data.id}`, { offres: [] })).data.offres, []);
    assert.equal((await appel('PATCH', `/api/contacts/${k.data.id}`, { offres: [o.id_offre] })).data.fonction, 'Chargée de recrutement');
    assert.equal((await appel('PATCH', '/api/contacts/absent', { prenom: 'X' })).status, 404);

    const etat = (await appel('GET', '/api/state')).data;
    assert.deepEqual(etat.contacts.map(x => x.offres), [[o.id_offre]]);

    // NOTE: une offre liée à un contact peut encore être supprimée (offre manuelle) : le lien part avec elle
    assert.equal((await appel('DELETE', `/api/offres/${o.id_offre}`)).status, 200);
    assert.deepEqual((await appel('GET', `/api/contacts/${k.data.id}`)).data.offres, []);

    const ev = (await appel('GET', `/api/journal?entite=contact&id=${k.data.id}`)).data;
    assert.ok(ev.some(e => e.action === 'creation'));
    assert.ok(ev.some(e => e.champ === 'offres'));
    assert.ok(ev.every(e => e.libelle === 'Camille M.'), 'le journal ne garde que le prénom et l\'initiale');
    // NOTE: une coordonnée modifiée est journalisée sans ses valeurs
    await appel('PATCH', `/api/contacts/${k.data.id}`, { nom: 'Bernard', email: 'autre@example.com', fonction: 'DRH' });
    const modifs = (await appel('GET', `/api/journal?entite=contact&id=${k.data.id}`)).data.filter(e => ['nom', 'email', 'fonction'].includes(e.champ));
    assert.equal(modifs.length, 3);
    assert.ok(!JSON.stringify(modifs).includes('Bernard') && !JSON.stringify(modifs).includes('Martin') && !JSON.stringify(modifs).includes('example.com'));
    assert.equal(modifs.find(e => e.champ === 'fonction').apres, 'DRH');

    assert.equal((await appel('DELETE', `/api/contacts/${k.data.id}`)).status, 200);
    assert.equal((await appel('GET', `/api/contacts/${k.data.id}`)).status, 404);
    assert.equal((await appel('DELETE', `/api/contacts/${k.data.id}`)).status, 404);
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('une table rendez_vous vide de l\'ancienne version de travail est recréée avec ses clés étrangères', () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-rdv-'));
  try {
    const f = join(dir, 'a.db');
    const vieux = new DatabaseSync(f);
    vieux.exec("CREATE TABLE rendez_vous (id TEXT PRIMARY KEY, debut TEXT NOT NULL, google_id TEXT NOT NULL DEFAULT '')");
    vieux.close();
    const db = ouvrirBase(f);
    assert.ok(db.prepare('PRAGMA foreign_key_list(rendez_vous)').all().length >= 3);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
