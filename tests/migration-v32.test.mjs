// Tests de la migration v32 (offres partagées) : l'état des offres passe dans offre_suivis du profil par défaut, les colonnes quittent offres, copie faite, deuxième ouverture sans effet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ouvrirBase, VERSION_SCHEMA } from '../lib/offres.mjs';
import { profilDefaut } from '../lib/profils.mjs';

const ANCIENNES = ['proche', 'ignoree', 'vue', 'postuler_via', 'description', 'epinglee_le'];
const colonnes = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => String(c.name));

// ANCHOR: base v31 fabriquée depuis le schéma actuel : état remis dans offres, offre_suivis supprimée
function baseV31(chemin) {
  ouvrirBase(chemin).close();
  const db = new DatabaseSync(chemin);
  db.exec(`DROP TABLE offre_suivis; ALTER TABLE offres ADD COLUMN proche INTEGER NOT NULL DEFAULT 0; ALTER TABLE offres ADD COLUMN ignoree INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE offres ADD COLUMN vue INTEGER NOT NULL DEFAULT 0; ALTER TABLE offres ADD COLUMN postuler_via TEXT NOT NULL DEFAULT '';
  ALTER TABLE offres ADD COLUMN description TEXT NOT NULL DEFAULT ''; ALTER TABLE offres ADD COLUMN epinglee_le TEXT NOT NULL DEFAULT ''; PRAGMA user_version = 31`);
  db.exec(`INSERT INTO offres (id_offre, titre, categorie, date_detection, proche, ignoree, vue, postuler_via, description, epinglee_le) VALUES
    ('o1', 'Comptable', 'comptabilite', '2026-10-20', 1, 0, 1, 'France Travail', 'Note fictive', '2026-10-21'),
    ('o2', 'Formateur', 'formateur_digital', '2026-10-21', 0, 1, 0, '', '', ''),
    ('man-1', 'Offre saisie', 'autre', '2026-10-22', 0, 0, 0, 'Autre site', '', '')`);
  return db;
}

test('migration v32 : état des offres repris dans offre_suivis du profil par défaut, colonnes retirées, copie faite, idempotente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-v32-'));
  try {
    const chemin = join(dir, 'suivi.db');
    baseV31(chemin).close();
    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    const id = profilDefaut(db);
    for (const c of ANCIENNES) assert.ok(!colonnes(db, 'offres').includes(c), c);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM offres').get()?.n, 3);
    const suivis = db.prepare(`SELECT profil_id, id_offre, ${ANCIENNES.join(', ')} FROM offre_suivis ORDER BY id_offre`).all().map(r => ({ ...r }));
    assert.deepEqual(suivis, [
      { profil_id: id, id_offre: 'man-1', proche: 0, ignoree: 0, vue: 0, postuler_via: 'Autre site', description: '', epinglee_le: '' },
      { profil_id: id, id_offre: 'o1', proche: 1, ignoree: 0, vue: 1, postuler_via: 'France Travail', description: 'Note fictive', epinglee_le: '2026-10-21' },
      { profil_id: id, id_offre: 'o2', proche: 0, ignoree: 1, vue: 0, postuler_via: '', description: '', epinglee_le: '' },
    ]);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.close();
    const copies = () => readdirSync(join(dir, 'data', 'backups')).filter(f => f.startsWith('suivi-avant-schema-v32-'));
    assert.equal(copies().length, 1);
    const copie = new DatabaseSync(join(dir, 'data', 'backups', copies()[0]), { readOnly: true });
    assert.equal(copie.prepare('PRAGMA user_version').get().user_version, 31);
    assert.ok(colonnes(copie, 'offres').includes('vue'));
    copie.close();

    const re = ouvrirBase(chemin);
    assert.equal(re.prepare('SELECT COUNT(*) n FROM offre_suivis').get()?.n, 3);
    re.close();
    assert.equal(copies().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migration v32 : base neuve créée directement au schéma actuel, sans colonne d\'état dans offres', () => {
  const db = ouvrirBase(':memory:');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
  for (const c of ANCIENNES) assert.ok(!colonnes(db, 'offres').includes(c), c);
  assert.ok(colonnes(db, 'offre_suivis').includes('profil_id'));
  db.close();
});
