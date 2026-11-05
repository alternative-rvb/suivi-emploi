// @ts-check
// ANCHOR: migration v12 (clés étrangères, CHECK, liens vides remplacés par NULL) sur une base v11 avec des valeurs à nettoyer
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ouvrirBase, VERSION_SCHEMA } from '../lib/offres.mjs';
import { ouvrirAnalyses } from '../lib/analyse/index.mjs';

const ANCIEN = `
CREATE TABLE offres (id_offre TEXT PRIMARY KEY, titre TEXT NOT NULL, entreprise TEXT, lieu TEXT, departement TEXT, ville TEXT, proche INTEGER NOT NULL DEFAULT 0, contrat TEXT, salaire TEXT, lien TEXT, date_detection TEXT, categorie TEXT NOT NULL, ignoree INTEGER NOT NULL DEFAULT 0, vue INTEGER NOT NULL DEFAULT 0, expiree INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'France Travail', postuler_via TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', annonce TEXT NOT NULL DEFAULT '');
CREATE TABLE kv (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
CREATE TABLE candidatures (id TEXT PRIMARY KEY, entreprise TEXT, poste TEXT, description TEXT, statut TEXT, raison_echec TEXT, date TEXT, plateforme TEXT, interet TEXT, notes TEXT, offre_id TEXT, maj_locale INTEGER NOT NULL DEFAULT 0, mode_envoi TEXT NOT NULL DEFAULT '', cv TEXT NOT NULL DEFAULT '', lettre INTEGER NOT NULL DEFAULT 0, lieux TEXT NOT NULL DEFAULT '[]');
CREATE TABLE taches (id TEXT PRIMARY KEY, candidature_id TEXT, titre TEXT NOT NULL, echeance TEXT NOT NULL DEFAULT '', faite INTEGER NOT NULL DEFAULT 0, creee TEXT NOT NULL DEFAULT '');
CREATE INDEX taches_candidature ON taches (candidature_id);
CREATE TABLE echanges (id TEXT PRIMARY KEY, candidature_id TEXT NOT NULL, date TEXT NOT NULL DEFAULT '', heure TEXT NOT NULL DEFAULT '', canal TEXT NOT NULL DEFAULT '', sens TEXT NOT NULL DEFAULT '', resume TEXT NOT NULL DEFAULT '');
CREATE INDEX echanges_candidature ON echanges (candidature_id);
CREATE TABLE cv_references (id TEXT PRIMARY KEY, fichier TEXT NOT NULL DEFAULT '', importe_le TEXT NOT NULL, pages INTEGER NOT NULL DEFAULT 0, texte TEXT NOT NULL);
CREATE TABLE cv_versions (id TEXT PRIMARY KEY, nom TEXT NOT NULL, cible TEXT NOT NULL DEFAULT 'general', categorie TEXT NOT NULL DEFAULT '', offre_id TEXT NOT NULL DEFAULT '', candidature_id TEXT NOT NULL DEFAULT '', reference_id TEXT NOT NULL DEFAULT '', cree_le TEXT NOT NULL, ecarts INTEGER NOT NULL DEFAULT 0, avertissements INTEGER NOT NULL DEFAULT 0, contenu TEXT NOT NULL);
CREATE TABLE analyses (id_offre TEXT PRIMARY KEY, version INTEGER NOT NULL, hash TEXT NOT NULL, provider TEXT NOT NULL, modele TEXT NOT NULL, date TEXT NOT NULL, duree_ms INTEGER NOT NULL, reponses TEXT NOT NULL);
INSERT INTO offres (id_offre, titre, categorie) VALUES ('o1', 'Comptable', 'comptabilite'), ('o2', 'Inconnue', 'bizarre');
INSERT INTO candidatures (id, entreprise, statut, interet, offre_id) VALUES ('c1', 'ClientABC', 'en_cours', 'fort', 'o1'), ('c2', 'ProjetX', 'inconnu', 'zz', 'absente'), ('c3', 'ClientDEF', 'refuse', '', '');
INSERT INTO taches (id, candidature_id, titre) VALUES ('t1', 'c1', 'Relancer'), ('t2', 'fantome', 'Orpheline'), ('t3', NULL, 'Libre');
INSERT INTO echanges (id, candidature_id) VALUES ('e1', 'c1'), ('e2', 'fantome');
INSERT INTO cv_references (id, importe_le, texte) VALUES ('r1', '2026-10-01', 'x');
INSERT INTO cv_versions (id, nom, offre_id, candidature_id, reference_id, cree_le, contenu) VALUES ('v1', 'CV', '', '', 'r1', '2026-10-02', '{}'), ('v2', 'CV2', 'o1', 'c1', '', '2026-10-03', '{}');
INSERT INTO analyses VALUES ('o1', 1, 'h', 'p', 'm', 'd', 1, '{}'), ('absente', 1, 'h', 'p', 'm', 'd', 1, '{}');
PRAGMA user_version = 11;
`;

test('schéma v12 : tables reconstruites, valeurs invalides ramenées, liens vides en NULL, copie avant', () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-v12-'));
  try {
    const f = join(dir, 'suivi.db');
    const vieux = new DatabaseSync(f);
    vieux.exec(ANCIEN);
    vieux.close();
    const db = ouvrirBase(f);
    ouvrirAnalyses(db);
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, VERSION_SCHEMA);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
    assert.ok(readdirSync(join(dir, 'data', 'backups')).some(n => n.startsWith('suivi-avant-schema-v12-')));
    // données
    assert.equal(db.prepare("SELECT categorie FROM offres WHERE id_offre = 'o2'").get()?.categorie, 'autre');
    const c = Object.fromEntries(db.prepare('SELECT id, statut, interet, offre_id FROM candidatures').all().map(r => [r.id, r]));
    assert.deepEqual([c.c1.offre_id, c.c2.offre_id, c.c3.offre_id], ['o1', null, null]);
    assert.equal(c.c2.statut, null);
    assert.equal(c.c2.interet, '');
    assert.deepEqual(db.prepare('SELECT id, candidature_id FROM taches ORDER BY id').all().map(r => [r.id, r.candidature_id]), [['t1', 'c1'], ['t2', null], ['t3', null]]);
    assert.deepEqual(db.prepare('SELECT id FROM echanges').all().map(r => r.id), ['e1']);
    assert.deepEqual(db.prepare('SELECT id, offre_id, candidature_id, reference_id FROM cv_versions ORDER BY id').all().map(r => [r.offre_id, r.candidature_id, r.reference_id]), [[null, null, 'r1'], ['o1', 'c1', null]]);
    assert.deepEqual(db.prepare('SELECT id_offre FROM analyses').all().map(r => r.id_offre), ['o1']);
    // contraintes et index
    assert.throws(() => db.prepare("INSERT INTO candidatures (id, statut) VALUES ('c9', 'nimporte')").run(), /CHECK/);
    assert.throws(() => db.prepare("INSERT INTO offres (id_offre, titre, categorie) VALUES ('o9', 't', 'x')").run(), /CHECK/);
    assert.throws(() => db.prepare("INSERT INTO taches (id, candidature_id, titre) VALUES ('t9', 'fantome', 'x')").run(), /FOREIGN KEY/);
    assert.throws(() => db.prepare("INSERT INTO analyses VALUES ('absente', 1, 'h', 'p', 'm', 'd', 1, '{}')").run(), /FOREIGN KEY/);
    const index = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(r => String(r.name)));
    for (const i of ['taches_candidature', 'echanges_candidature', 'candidatures_offre', 'offres_date']) assert.ok(index.has(i), i);
    // cascades : supprimer une candidature emporte ses tâches et échanges, une offre libère la candidature et le CV
    db.prepare("DELETE FROM candidatures WHERE id = 'c1'").run();
    assert.equal(db.prepare("SELECT COUNT(*) n FROM taches WHERE id = 't1'").get()?.n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM echanges WHERE id = 'e1'").get()?.n, 0);
    assert.equal(db.prepare("SELECT candidature_id FROM cv_versions WHERE id = 'v2'").get()?.candidature_id, null);
    db.prepare("DELETE FROM offres WHERE id_offre = 'o1'").run();
    assert.equal(db.prepare("SELECT COUNT(*) n FROM analyses").get()?.n, 0);
    // rejouable : une seconde ouverture ne refait rien
    db.close();
    const n = readdirSync(join(dir, 'data', 'backups')).length;
    ouvrirBase(f).close();
    assert.equal(readdirSync(join(dir, 'data', 'backups')).length, n);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('schéma v12 : base neuve sans copie ni reconstruction', () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-v12n-'));
  try {
    const db = ouvrirBase(join(dir, 'suivi.db'));
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, VERSION_SCHEMA);
    assert.equal(existsSync(join(dir, 'data', 'backups')), false);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
