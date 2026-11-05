// Tests du marquage des offres clôturées : absence à la recherche France Travail, contrôle unitaire, garde-fous de la synchro.
// Aucun réseau, base en mémoire ou temporaire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { expirerDisparues, appliquerVerification, offreProtegee, ouvrirBase } = await import('../lib/offres.mjs');
const { lancerSync } = await import('../lib/sync.mjs');

const jour = decalage => {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function baseTest(extra = []) {
  const db = ouvrirBase(':memory:');
  const ins = db.prepare("INSERT INTO offres (id_offre, titre, categorie, departement, source, date_detection, epinglee_le) VALUES (?, ?, 'comptabilite', '83', ?, ?, ?)");
  ins.run('en-ligne', 'Comptable en ligne', 'France Travail', jour(-3), '');
  ins.run('disparue', 'Comptable disparue', 'France Travail', jour(-3), '');
  ins.run('epinglee', 'Comptable épinglée', 'France Travail', jour(-3), jour(-1));
  ins.run('man-1', 'Offre manuelle', 'France Travail', jour(-3), '');
  ins.run('autre-1', 'Offre autre source', 'Autre source', jour(-3), '');
  ins.run('ancienne', 'Comptable ancienne', 'France Travail', jour(-45), '');
  ins.run('candidatee', 'Comptable candidatée', 'France Travail', jour(-3), '');
  db.prepare("INSERT INTO candidatures (id, offre_id) VALUES ('c1', 'candidatee')").run();
  for (const [id] of extra) ins.run(id, 'Autre', 'France Travail', jour(-2), '');
  return db;
}
const expiree = (db, id) => db.prepare('SELECT expiree FROM offres WHERE id_offre = ?').get(id).expiree;

test('absence : seule une offre France Travail libre, récente et absente de la recherche est marquée', () => {
  const db = baseTest();
  const r = expirerDisparues(db, ['en-ligne']);
  assert.deepEqual(r, { marquees: 1, ignoree: null });
  assert.equal(expiree(db, 'disparue'), 1);
  for (const id of ['en-ligne', 'epinglee', 'man-1', 'autre-1', 'ancienne', 'candidatee']) assert.equal(expiree(db, id), 0, id);
});

test('absence : le marquage est écrit au journal', () => {
  const db = baseTest();
  expirerDisparues(db, ['en-ligne']);
  const l = db.prepare("SELECT * FROM journal WHERE entite = 'offre' AND entite_id = 'disparue'").all();
  assert.equal(l.length, 1);
});

test('absence : liste vide, rien n\'est marqué', () => {
  const db = baseTest();
  assert.deepEqual(expirerDisparues(db, []), { marquees: 0, ignoree: 'vide' });
  assert.equal(expiree(db, 'disparue'), 0);
});

test('absence : volume anormal (20 absentes ou plus, plus de la moitié), rien n\'est marqué', () => {
  const db = baseTest(Array.from({ length: 25 }, (_, i) => [`x${i}`]));
  assert.deepEqual(expirerDisparues(db, ['en-ligne']), { marquees: 0, ignoree: 'volume' });
  assert.equal(expiree(db, 'disparue'), 0);
});

test('absence : une offre déjà expirée à la main n\'est pas comptée ni retouchée', () => {
  const db = baseTest();
  db.prepare("UPDATE offres SET expiree = 1 WHERE id_offre = 'disparue'").run();
  assert.deepEqual(expirerDisparues(db, ['en-ligne']), { marquees: 0, ignoree: null });
  assert.equal(expiree(db, 'disparue'), 1);
});

test('contrôle unitaire : clôturée libre marquée et journalisée, protégée seulement signalée, inconnue ignorée', () => {
  const db = baseTest();
  assert.deepEqual(appliquerVerification(db, 'disparue', 'cloturee'), { statut: 'cloturee', protegee: false, marquee: true });
  assert.equal(expiree(db, 'disparue'), 1);
  assert.deepEqual(appliquerVerification(db, 'candidatee', 'cloturee'), { statut: 'cloturee', protegee: true, marquee: false });
  assert.equal(expiree(db, 'candidatee'), 0);
  assert.deepEqual(appliquerVerification(db, 'en-ligne', 'inconnu'), { statut: 'inconnu', protegee: false, marquee: false });
  assert.deepEqual(appliquerVerification(db, 'en-ligne', 'en_ligne'), { statut: 'en_ligne', protegee: false, marquee: false });
  assert.equal(appliquerVerification(db, 'introuvable', 'cloturee'), null);
  assert.equal(offreProtegee(db, 'epinglee'), true);
});

// --- Synchro : garde-fous de marquerCloturees ---
const aujourdhui = jour(0);
const ligne = id => ({ id_offre: id, titre: 'Comptable (H/F)', entreprise: 'ClientABC', lieu: '83 - Villeneuve', type_de_contrat: 'CDI', salaire: null, lien: '', date_de_detection: aujourdhui, description: 'Texte' });
const cloturee = async () => 'cloturee';
const fournisseur = (offres, couverture, mots = ['comptable']) => ({ id: 'p', nom: 'p', secours: false, recuperer: async () => ({ date: 'x', offres, zones: ['83'], exclusions: [], config: { mots_cles: mots, zones: ['83'] }, couverture }) });

test('synchro : première synchro et réglages changés ne marquent rien, la suivante marque les disparues', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'suivi-test-'));
  const db = ouvrirBase(join(dossier, 'suivi.db'));
  try {
    const ids = ['1AAAAAA', '2BBBBBB'];
    await lancerSync(db, dossier, 'test', [fournisseur(ids.map(ligne), { complete: true, ids, verifier: cloturee })]);
    const r1 = await lancerSync(db, dossier, 'test', [fournisseur([ligne('1AAAAAA')], { complete: true, ids: ['1AAAAAA'], verifier: cloturee })]);
    assert.equal(r1.expiration.ignoree, 'reglages');
    assert.equal(expiree(db, '2BBBBBB'), 0);
    const r2 = await lancerSync(db, dossier, 'test', [fournisseur([ligne('1AAAAAA')], { complete: true, ids: ['1AAAAAA'], verifier: cloturee })]);
    assert.equal(r2.expiration.marquees, 1);
    assert.equal(expiree(db, '2BBBBBB'), 1);
    assert.equal(expiree(db, '1AAAAAA'), 0);
  } finally { db.close(); rmSync(dossier, { recursive: true, force: true }); }
});

test('synchro : couverture incomplète, rien n\'est marqué', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'suivi-test-'));
  const db = ouvrirBase(join(dossier, 'suivi.db'));
  try {
    const ids = ['1AAAAAA', '2BBBBBB'];
    await lancerSync(db, dossier, 'test', [fournisseur(ids.map(ligne), { complete: true, ids, verifier: cloturee })]);
    const r = await lancerSync(db, dossier, 'test', [fournisseur([ligne('1AAAAAA')], { complete: false, ids: ['1AAAAAA'], verifier: cloturee })]);
    assert.equal(r.expiration.ignoree, 'incomplete');
    assert.equal(expiree(db, '2BBBBBB'), 0);
  } finally { db.close(); rmSync(dossier, { recursive: true, force: true }); }
});

test('synchro : une absente encore en ligne ou au contrôle incertain n\'est pas marquée, sans contrôle disponible rien n\'est marqué', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'suivi-test-'));
  const db = ouvrirBase(join(dossier, 'suivi.db'));
  try {
    const ids = ['1AAAAAA', '2BBBBBB', '3CCCCCC', '4DDDDDD'];
    const complet = verifier => fournisseur([ligne('1AAAAAA')], { complete: true, ids: ['1AAAAAA'], verifier });
    await lancerSync(db, dossier, 'test', [fournisseur(ids.map(ligne), { complete: true, ids, verifier: cloturee })]);
    await lancerSync(db, dossier, 'test', [complet(cloturee)]);
    const statuts = { '2BBBBBB': 'en_ligne', '3CCCCCC': 'inconnu', '4DDDDDD': 'cloturee' };
    const r = await lancerSync(db, dossier, 'test', [complet(async id => statuts[id])]);
    assert.equal(r.expiration.marquees, 1);
    assert.equal(r.expiration.ecartees, 2);
    assert.equal(expiree(db, '4DDDDDD'), 1);
    assert.equal(expiree(db, '2BBBBBB'), 0);
    assert.equal(expiree(db, '3CCCCCC'), 0);
    const sans = await lancerSync(db, dossier, 'test', [complet(undefined)]);
    assert.equal(sans.expiration.ignoree, 'sans_controle');
    assert.equal(expiree(db, '2BBBBBB'), 0);
  } finally { db.close(); rmSync(dossier, { recursive: true, force: true }); }
});
