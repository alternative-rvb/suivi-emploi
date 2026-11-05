// Tests de l'épingle d'une offre : colonne du schéma v21, protection de la purge pendant 14 jours, échéance remise à vide.
// Aucun réseau, base en mémoire.
import test from 'node:test';
import assert from 'node:assert/strict';

const { expirerEpingles, fusionnerOffres, JOURS_EPINGLE, ouvrirBase, VERSION_SCHEMA } = await import('../lib/offres.mjs');

const jour = decalage => {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function baseTest() {
  const db = ouvrirBase(':memory:');
  const ins = db.prepare("INSERT INTO offres (id_offre, titre, categorie, departement, date_detection, epinglee_le) VALUES (?, ?, 'comptabilite', '83', ?, ?)");
  ins.run('libre', 'Comptable libre', jour(-40), '');
  ins.run('epinglee', 'Comptable épinglée', jour(-40), jour(-3));
  ins.run('echue', 'Comptable échue', jour(-40), jour(-JOURS_EPINGLE));
  return db;
}

test('schéma : la colonne epinglee_le existe à la version 21', () => {
  assert.ok(VERSION_SCHEMA >= 21);
  const db = baseTest();
  assert.ok(db.prepare('PRAGMA table_info(offres)').all().some(c => c.name === 'epinglee_le'));
});

test('purge : une offre épinglée depuis moins de 14 jours est gardée, une libre ou une épingle échue est retirée', () => {
  const db = baseTest();
  fusionnerOffres(db, [], { zones: ['83'], exclusions: [] });
  const restantes = db.prepare('SELECT id_offre FROM offres ORDER BY id_offre').all().map(r => r.id_offre);
  assert.deepEqual(restantes, ['epinglee']);
});

test('échéance : les épingles de 14 jours ou plus sont remises à vide et renvoyées pour le journal', () => {
  const db = baseTest();
  const echues = expirerEpingles(db);
  assert.deepEqual(echues.map(o => o.id_offre), ['echue']);
  assert.equal(db.prepare("SELECT epinglee_le FROM offres WHERE id_offre = 'echue'").get().epinglee_le, '');
  assert.equal(db.prepare("SELECT epinglee_le FROM offres WHERE id_offre = 'epinglee'").get().epinglee_le, jour(-3));
  assert.deepEqual(expirerEpingles(db), [], 'rien à refaire au second passage');
});
