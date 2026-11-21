// Tests de la migration v31 (profils) : base v30 remplie, lignes rattachées au profil par défaut, kv réparti, journal complété, copie faite, deuxième ouverture sans effet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DDL_ANALYSES, DDL_SYNTHESES, ouvrirBase, sansProfil, TABLES_PROFIL, VERSION_SCHEMA } from '../lib/offres.mjs';
import { lireReglages } from '../lib/reglages.mjs';
import { profilDefaut } from '../lib/profils.mjs';

const PERSONNELLES = [...TABLES_PROFIL, 'analyses', 'syntheses'];

// ANCHOR: base v30 fabriquée depuis le schéma actuel : profil_id et clés composites retirés, tables des profils supprimées, journal sans profil ni auteur
function baseV30(chemin) {
  ouvrirBase(chemin).close();
  const db = new DatabaseSync(chemin);
  db.exec('PRAGMA foreign_keys = OFF');
  const sql = t => String(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)?.sql);
  // NOTE: analyses et syntheses sont créées au démarrage du serveur, hors ouvrirBase : reprises directement de leur modèle sans profil
  db.exec(sansProfil(DDL_ANALYSES));
  db.exec(sansProfil(DDL_SYNTHESES));
  for (const t of TABLES_PROFIL) {
    const ancien = sansProfil(sql(t)).replace(/^CREATE TABLE (IF NOT EXISTS )?"?\w+"?/, `CREATE TABLE ${t}_v30`);
    assert.ok(!ancien.includes('profil_id'), t);
    db.exec(`DROP TABLE ${t}`);
    db.exec(ancien);
    db.exec(`ALTER TABLE ${t}_v30 RENAME TO ${t}`);
  }
  db.exec('DROP INDEX journal_profil; ALTER TABLE journal DROP COLUMN profil_id; ALTER TABLE journal DROP COLUMN auteur');
  // NOTE: avant la v32, l'état des offres était dans offres et offre_suivis n'existait pas
  db.exec(`DROP TABLE offre_suivis; ALTER TABLE offres ADD COLUMN proche INTEGER NOT NULL DEFAULT 0; ALTER TABLE offres ADD COLUMN ignoree INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE offres ADD COLUMN vue INTEGER NOT NULL DEFAULT 0; ALTER TABLE offres ADD COLUMN postuler_via TEXT NOT NULL DEFAULT '';
  ALTER TABLE offres ADD COLUMN description TEXT NOT NULL DEFAULT ''; ALTER TABLE offres ADD COLUMN epinglee_le TEXT NOT NULL DEFAULT ''`);
  db.exec("DROP TABLE profil_reglages; DROP TABLE profils; DROP TABLE comptes; DELETE FROM kv WHERE cle = 'profil_defaut'; PRAGMA user_version = 30");
  return db;
}

function remplir(db) {
  db.exec(`INSERT INTO offres (id_offre, titre, categorie, date_detection) VALUES ('o1', 'Comptable', 'comptabilite', '2026-10-20'), ('o2', 'Formateur', 'formateur_digital', '2026-10-21');
  INSERT INTO candidatures (id, entreprise, poste, statut, date, offre_id) VALUES ('c1', 'ClientABC', 'Comptable', 'en_cours', '2026-10-22', 'o1'), ('c2', 'ProjetX', 'Formateur', 'entretien', '2026-10-23', NULL);
  INSERT INTO taches (id, titre, candidature_id) VALUES ('t1', 'Relancer', 'c1'), ('t2', 'Préparer', NULL);
  INSERT INTO echanges (id, candidature_id, canal) VALUES ('e1', 'c1', 'email');
  INSERT INTO competences (id, domaine, competence) VALUES ('k1', 'Comptabilité', 'Saisie'), ('k2', 'Web', 'HTML');
  INSERT INTO lettre_brouillons (cle, offre_id, texte, maj_le) VALUES ('offre:o1', 'o1', 'Brouillon fictif', '2026-10-22');
  INSERT INTO analyses (id_offre, version, hash, provider, modele, date, duree_ms, reponses) VALUES ('o1', 1, 'h', 'p', 'm', '2026-10-20', 1, '{}');
  INSERT INTO syntheses (cle, version, hash, provider, modele, date, duree_ms, resultat) VALUES ('veille', 1, 'h', 'p', 'm', '2026-10-20', 1, '{}');
  INSERT INTO journal (ts, jour, entite, entite_id, action) VALUES ('2026-10-22T08:00:00Z', '2026-10-22', 'candidature', 'c1', 'creation');`);
  const kv = db.prepare('INSERT INTO kv (cle, valeur) VALUES (?, ?)');
  kv.run('reglages', JSON.stringify({ zones: ['83'], mots_cles: ['comptable'], mots_exclus: [], contrats_exclus: [], entreprises: [] }));
  kv.run('profil', JSON.stringify({ accroche: 'Accroche fictive' }));
  kv.run('agenda', JSON.stringify({ calendrier: 'primary' }));
  kv.run('veille', JSON.stringify({ zones: ['13'] }));
  kv.run('synchro_derniere', JSON.stringify('2026-10-22T08:00:00Z'));
  kv.run('cle_inconnue', '1');
}

const compter = (db, t) => Number(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get()?.n);

test('migration v31 : lignes rattachées au profil par défaut, kv réparti, journal complété, copie faite, idempotente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-v31-'));
  try {
    const chemin = join(dir, 'suivi.db');
    const brute = baseV30(chemin);
    for (const t of PERSONNELLES) assert.ok(!brute.prepare(`PRAGMA table_info(${t})`).all().some(c => c.name === 'profil_id'), t);
    remplir(brute);
    const avant = Object.fromEntries([...PERSONNELLES, 'offres', 'echanges', 'journal'].map(t => [t, compter(brute, t)]));
    brute.close();

    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    const id = profilDefaut(db);
    assert.deepEqual(db.prepare('SELECT id, nom FROM profils').all().map(p => [p.id, p.nom]), [[id, 'Mon profil']]);
    for (const [t, n] of Object.entries(avant)) assert.equal(compter(db, t), n, t);
    for (const t of PERSONNELLES) assert.equal(Number(db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE profil_id <> ?`).get(id)?.n), 0, t);
    // NOTE: la v32 suit dans la foulée : chaque offre suivie par le profil par défaut
    assert.deepEqual(db.prepare('SELECT profil_id, id_offre FROM offre_suivis ORDER BY id_offre').all().map(r => [r.profil_id, r.id_offre]), [[id, 'o1'], [id, 'o2']]);
    assert.deepEqual(db.prepare('SELECT profil_id, auteur FROM journal').all().map(r => [r.profil_id, r.auteur]), [[id, 'utilisateur']]);

    // ANCHOR: kv réparti : clés personnelles dans profil_reglages, clés d'installation et inconnues restées dans le kv
    const reglages = db.prepare('SELECT cle FROM profil_reglages WHERE profil_id = ? ORDER BY cle').all(id).map(r => r.cle);
    // NOTE: metiers est ajouté ensuite par la v33 (base avec données)
    assert.deepEqual(reglages, ['agenda', 'metiers', 'profil', 'reglages']);
    const kv = db.prepare('SELECT cle FROM kv ORDER BY cle').all().map(r => r.cle);
    assert.deepEqual(kv, ['cle_inconnue', 'profil_defaut', 'synchro_derniere', 'veille']);
    const lus = lireReglages(db);
    assert.equal(lus.origine, 'app');
    assert.deepEqual(lus.reglages.zones, ['83']);

    // NOTE: index et contraintes du schéma actuel en place
    const index = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(r => r.name));
    for (const t of TABLES_PROFIL) assert.ok(index.has(`${t}_profil`), t);
    assert.ok(index.has('rendez_vous_google_profil'));
    assert.ok(!index.has('rendez_vous_google'));
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.throws(() => db.prepare("INSERT INTO lettre_brouillons (cle, profil_id, maj_le) VALUES ('x', 'p-00000000', '2026-10-22')").run(), /FOREIGN KEY/);
    db.close();

    const copies = () => readdirSync(join(dir, 'data', 'backups')).filter(f => f.startsWith('suivi-avant-schema-v31-'));
    assert.equal(copies().length, 1);
    const copie = new DatabaseSync(join(dir, 'data', 'backups', copies()[0]), { readOnly: true });
    assert.equal(copie.prepare('PRAGMA user_version').get().user_version, 30);
    assert.equal(compter(copie, 'candidatures'), 2);
    copie.close();

    // ANCHOR: deuxième ouverture : rien ne bouge, aucune nouvelle copie
    const re = ouvrirBase(chemin);
    assert.equal(profilDefaut(re), id);
    for (const [t, n] of Object.entries(avant)) assert.equal(compter(re, t), n, t);
    assert.equal(compter(re, 'profils'), 1);
    re.close();
    assert.equal(copies().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migration v31 : base neuve, un profil par défaut, aucune copie', () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-v31-'));
  try {
    const db = ouvrirBase(join(dir, 'suivi.db'));
    assert.equal(compter(db, 'profils'), 1);
    assert.equal(db.prepare('SELECT nom FROM profils').get()?.nom, 'Mon profil');
    db.prepare("INSERT INTO candidatures (id, entreprise, poste) VALUES ('c1', 'ClientABC', 'Comptable')").run();
    assert.equal(db.prepare("SELECT profil_id FROM candidatures WHERE id = 'c1'").get()?.profil_id, profilDefaut(db));
    db.close();
    let copies = [];
    try { copies = readdirSync(join(dir, 'data', 'backups')); } catch { /* dossier absent : aucune copie */ }
    assert.deepEqual(copies, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migration v31 : modèles analyses et syntheses avec clé composite, sans profil pour les anciennes bases', () => {
  for (const ddl of [DDL_ANALYSES, DDL_SYNTHESES]) {
    assert.match(ddl, /PRIMARY KEY \(profil_id, \w+\)/);
    assert.ok(!sansProfil(ddl).includes('profil_id'));
  }
});
