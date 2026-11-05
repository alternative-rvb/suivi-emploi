// Tests des réglages de recherche (page Admin) : validation, priorité sur la veille, retrait des offres. Base temporaire, aucun réseau.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ecrireReglages, ErreurReglages, lireReglages, validerReglages } from '../lib/reglages.mjs';
import { offresRetirables, ouvrirBase, retirerOffres } from '../lib/offres.mjs';
import { lancerSync } from '../lib/sync.mjs';

const valide = (extra = {}) => ({ zones: ['83'], mots_cles: ['comptable'], mots_exclus: [], contrats_exclus: ['FRA'], entreprises: [], ...extra });
const base = () => {
  const dossier = mkdtempSync(join(tmpdir(), 'suivi-reglages-'));
  const db = ouvrirBase(join(dossier, 'suivi.db'));
  return { db, dossier, fin: () => { db.close(); rmSync(dossier, { recursive: true, force: true }); } };
};
const aujourdhui = new Date().toISOString().slice(0, 10);
const ligne = (id, extra = {}) => ({ id_offre: id, titre: 'Comptable (H/F)', entreprise: 'ClientABC', lieu: '83 - Villeneuve', type_de_contrat: 'CDI', salaire: null, lien: '', date_de_detection: aujourdhui, description: 'T', ...extra });
const kv = (db, cle, valeur) => db.prepare('INSERT OR REPLACE INTO kv (cle, valeur) VALUES (?, ?)').run(cle, JSON.stringify(valeur));

test('validation : nettoie, déduplique et normalise', () => {
  const r = validerReglages(valide({ zones: [' 83 ', '83', '2a'], mots_cles: ['  assistant   comptable ', 'Assistant comptable', ''], contrats_exclus: ['fra', 'sta'] }));
  assert.deepEqual(r.zones, ['83', '2A']);
  assert.deepEqual(r.mots_cles, ['assistant comptable']);
  assert.deepEqual(r.contrats_exclus, ['FRA', 'STA']);
});

test('validation : refuse les valeurs invalides avec un message clair', () => {
  /** @type {[any, RegExp][]} */
  const echecs = [
    [null, /Objet/], [[], /Objet/],
    [{ ...valide(), inconnu: 1 }, /inconnus/],
    [{ zones: ['83'] }, /obligatoire/],
    [valide({ zones: ['abc'] }), /zones/],
    [valide({ zones: [] }), /zone/],
    [valide({ mots_cles: [] }), /mot-clé/],
    [valide({ mots_exclus: 'x' }), /liste/],
    [valide({ mots_exclus: [1] }), /texte/],
    [valide({ contrats_exclus: ['TROPLONG'] }), /contrats_exclus/],
    [valide({ mots_cles: ['x'.repeat(101)] }), /dépasse/],
    [valide({ mots_cles: Array.from({ length: 501 }, (_, i) => 'm' + i) }), /500/],
  ];
  for (const [entree, motif] of echecs) assert.throws(() => validerReglages(entree), (/** @type {any} */ e) => e instanceof ErreurReglages && motif.test(e.message), JSON.stringify(entree)?.slice(0, 60));
});

test('lecture : aucun réglage, aucune veille', () => {
  const t = base();
  try { assert.equal(lireReglages(t.db).origine, 'aucun'); } finally { t.fin(); }
});

test('lecture : reprend la copie de la veille tant que rien n\'est enregistré, puis les réglages de l\'app', () => {
  const t = base();
  try {
    kv(t.db, 'veille', { zones: ['13'], mots_cles: ['compta'], mots_exclus: ['x'], contrats_exclus: ['FRA'], entreprises: [] });
    const a = lireReglages(t.db);
    assert.equal(a.origine, 'veille');
    assert.deepEqual(a.reglages.zones, ['13']);
    ecrireReglages(t.db, valide());
    const b = lireReglages(t.db);
    assert.equal(b.origine, 'app');
    assert.deepEqual(b.reglages.zones, ['83']);
  } finally { t.fin(); }
});

test('lecture : un enregistrement abîmé retombe sur la veille sans planter', () => {
  const t = base();
  try {
    kv(t.db, 'veille', { zones: ['13'], mots_cles: ['compta'] });
    t.db.prepare("INSERT INTO kv (cle, valeur) VALUES ('reglages', '{pas du json')").run();
    assert.equal(lireReglages(t.db).origine, 'veille');
    kv(t.db, 'reglages', { zones: 'faux' });
    assert.equal(lireReglages(t.db).origine, 'veille');
  } finally { t.fin(); }
});

test('synchro : les réglages de l\'app l\'emportent sur les zones et exclusions du provider', async () => {
  const t = base();
  try {
    ecrireReglages(t.db, valide({ zones: ['83'], mots_exclus: ['senior'] }));
    const provider = { id: 'p', nom: 'p', secours: false, recuperer: async () => ({ date: 'x', zones: ['13', '83'], exclusions: [], offres: [
      ligne('1AAAAAA'), ligne('2BBBBBB', { lieu: '13 - Aubagne' }), ligne('3CCCCCC', { titre: 'Comptable senior (H/F)' }),
    ] }) };
    await lancerSync(t.db, t.dossier, 'test', [provider]);
    assert.deepEqual(t.db.prepare('SELECT id_offre FROM offres').all().map(o => o.id_offre), ['1AAAAAA']);
  } finally { t.fin(); }
});

test('synchro : les réglages de l\'app sont transmis au provider et la veille n\'est pas polluée', async () => {
  const t = base();
  try {
    kv(t.db, 'veille', { zones: ['13'], mots_cles: ['ancien'], date: 'x' });
    ecrireReglages(t.db, valide({ mots_cles: ['nouveau'] }));
    let vu;
    await lancerSync(t.db, t.dossier, 'test', [{ id: 'p', nom: 'p', secours: false, recuperer: async ctx => { vu = ctx.config; return { date: 'x', offres: [ligne('1AAAAAA')] }; } }]);
    assert.deepEqual(vu.mots_cles, ['nouveau']);
    const veille = JSON.parse(String(t.db.prepare("SELECT valeur FROM kv WHERE cle = 'veille'").get()?.valeur));
    assert.deepEqual(veille.mots_cles, ['ancien']);
  } finally { t.fin(); }
});

test('retrait : aperçu et suppression, en gardant offres liées à une candidature et offres manuelles', async () => {
  const t = base();
  try {
    await lancerSync(t.db, t.dossier, 'test', [{ id: 'p', nom: 'p', secours: false, recuperer: async () => ({ date: 'x', zones: ['83', '13'], exclusions: [], offres: [
      ligne('1AAAAAA'), ligne('2BBBBBB', { lieu: '13 - Aubagne' }), ligne('3CCCCCC', { lieu: '13 - Aix' }), ligne('4DDDDDD', { titre: 'Comptable senior (H/F)' }),
    ] }) }]);
    t.db.prepare("INSERT INTO offres (id_offre, titre, departement, categorie) VALUES ('man-1', 'Perso', '99', 'autre')").run();
    t.db.prepare("INSERT INTO candidatures (id, entreprise, poste, statut, offre_id) VALUES ('c1', 'ClientABC', 'Comptable', 'en_cours', '3CCCCCC')").run();
    const r = valide({ zones: ['83'], mots_exclus: ['senior'] });
    assert.deepEqual(offresRetirables(t.db, r), { hors_zone: 1, exclues: 1, total: 2 });
    assert.equal(retirerOffres(t.db, r), 2);
    assert.deepEqual(t.db.prepare('SELECT id_offre FROM offres ORDER BY id_offre').all().map(o => o.id_offre), ['1AAAAAA', '3CCCCCC', 'man-1']);
  } finally { t.fin(); }
});
