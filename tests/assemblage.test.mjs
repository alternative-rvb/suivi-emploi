// ANCHOR: tests de l'assemblage du CV par le modèle local : le modèle ne rend que des identifiants, le code écarte tout ce qui n'existe pas au Profil.
// Faux fournisseur, base en mémoire, aucun réseau.
import test from 'node:test';
import assert from 'node:assert/strict';

const { ouvrirBase } = await import('../lib/offres.mjs');
const { CHOIX_METIERS, assemblerCv, consigneAssemblage, schemaAssemblage, validerAssemblage, viderMemoAssemblage } = await import('../lib/analyse/assemblage.mjs');
const { ErreurSync } = await import('../lib/erreurs.mjs');

const ids = ['c1', 'c2', 'c3'];

test('validation : identifiants inconnus et doublons écartés, ordre du modèle conservé, métier inconnu remplacé par le repli', () => {
  const r = validerAssemblage({ metier: 'astronaute', competences: ['c2', 'zzz', 'c1', 'c2', 42], motif: '  Parce que.  ' }, { ids, repli: 'comptabilite' });
  assert.deepEqual(r, { metier: 'comptabilite', competences: ['c2', 'c1'], motif: 'Parce que.' });
});

test('validation : métier connu conservé, réponse illisible refusée', () => {
  assert.equal(validerAssemblage({ metier: 'dev_web', competences: [], motif: '' }, { ids }).metier, 'dev_web');
  assert.throws(() => validerAssemblage({ metier: 'dev_web' }, { ids }), (/** @type {any} */ e) => e instanceof ErreurSync && e.code === 'format');
  assert.throws(() => validerAssemblage(null, { ids }), (/** @type {any} */ e) => e.code === 'format');
});

test('schéma et consigne : seuls les métiers et identifiants du Profil sont permis', () => {
  const s = schemaAssemblage(ids);
  assert.deepEqual(s.properties.metier.enum, CHOIX_METIERS);
  assert.deepEqual(s.properties.competences.items.enum, ids);
  const consigne = consigneAssemblage([{ id: 'c1', domaine: 'Compta', competence: 'Bilan' }]);
  assert.match(consigne, /c1 : Compta, Bilan/);
});

function baseTest() {
  const db = ouvrirBase(':memory:');
  const annonce = 'Poste de comptable en cabinet. '.repeat(20);
  db.prepare("INSERT INTO offres (id_offre, titre, categorie, departement, date_detection, annonce) VALUES ('o1', 'Comptable', 'comptabilite', '83', date('now'), ?)").run(annonce);
  db.prepare("INSERT INTO offres (id_offre, titre, categorie, departement, date_detection, annonce) VALUES ('court', 'Comptable', 'comptabilite', '83', date('now'), 'Trop court')").run();
  const ins = db.prepare('INSERT INTO competences (id, domaine, competence, enseigner, executer, ordre) VALUES (?, ?, ?, ?, ?, ?)');
  ins.run('c1', 'Comptabilité', 'Bilan', 2, 4, 1);
  ins.run('c2', 'Comptabilité', 'Paie', 1, 2, 2);
  ins.run('c3', 'Développement', 'React', 5, 4, 3);
  return db;
}
/** @param {any} reponse */
const fournisseur = reponse => {
  const f = { id: 'faux', modele: 'faux-modele', dernier: /** @type {any} */ (null), preparer: async () => {}, repondre: async args => { f.dernier = args; return reponse; } };
  return f;
};

test('assemblage : seules les compétences de niveau 3 ou plus sont proposées au modèle, le résultat est validé', async () => {
  const db = baseTest();
  const f = fournisseur({ metier: 'comptabilite', competences: ['c1', 'c2', 'c3'], motif: 'Cabinet comptable.' });
  const r = await assemblerCv(db, 'o1', { fournisseur: f });
  assert.deepEqual(f.dernier.schema.properties.competences.items.enum, ['c1', 'c3']);
  assert.deepEqual(r.competences, ['c1', 'c3']);
  assert.deepEqual(r.competences_noms, ['Bilan', 'React']);
  assert.equal(r.metier, 'comptabilite');
  // NOTE: offre classée dans un métier : le métier du modèle ne la contredit pas
  viderMemoAssemblage();
  const f2 = fournisseur({ metier: 'general', competences: ['c1'], motif: '' });
  assert.equal((await assemblerCv(db, 'o1', { fournisseur: f2 })).metier, 'comptabilite');
  assert.equal(r.modele, 'faux-modele');
});

test('assemblage : offre introuvable, annonce courte ou modèle absent donnent une erreur typée', async () => {
  const db = baseTest();
  const f = fournisseur({ metier: 'general', competences: [], motif: '' });
  await assert.rejects(assemblerCv(db, 'nope', { fournisseur: f }), (/** @type {any} */ e) => e.code === 'introuvable');
  await assert.rejects(assemblerCv(db, 'court', { fournisseur: f }), (/** @type {any} */ e) => e.code === 'courte');
  const ancien = process.env.ANALYSE_PROVIDER;
  process.env.ANALYSE_PROVIDER = '';
  try {
    await assert.rejects(assemblerCv(db, 'o1'), (/** @type {any} */ e) => e.code === 'config');
  } finally { if (ancien === undefined) delete process.env.ANALYSE_PROVIDER; else process.env.ANALYSE_PROVIDER = ancien; }
});

test('assemblage : même offre et même annonce, le modèle n\'est interrogé qu\'une fois (résultat gardé, demandes simultanées partagées), force relance', async () => {
  viderMemoAssemblage();
  const db = baseTest();
  let appels = 0;
  const f = { id: 'faux', modele: 'm', preparer: async () => {}, repondre: async () => { appels++; await new Promise(r => setTimeout(r, 20)); return { metier: 'comptabilite', competences: ['c1'], motif: '' }; } };
  const [a, b] = await Promise.all([assemblerCv(db, 'o1', { fournisseur: f }), assemblerCv(db, 'o1', { fournisseur: f })]);
  assert.deepEqual(a, b);
  await assemblerCv(db, 'o1', { fournisseur: f });
  assert.equal(appels, 1);
  await assemblerCv(db, 'o1', { fournisseur: f, force: true });
  assert.equal(appels, 2);
});

test('assemblage : un modèle qui ne répond pas donne une erreur delai au lieu d\'attendre sans fin', async () => {
  viderMemoAssemblage();
  const db = baseTest();
  const f = { id: 'faux', modele: 'lent', preparer: async () => {}, repondre: () => new Promise(() => {}) };
  const ancien = process.env.ASSEMBLAGE_DELAI_MS;
  try {
    process.env.ASSEMBLAGE_DELAI_MS = '30';
    await assert.rejects(assemblerCv(db, 'o1', { fournisseur: f }), (/** @type {any} */ e) => e.code === 'delai');
  } finally {
    if (ancien === undefined) delete process.env.ASSEMBLAGE_DELAI_MS; else process.env.ASSEMBLAGE_DELAI_MS = ancien;
  }
});

test('validation : un motif qui cite un outil absent du Profil est écarté, un outil du Profil est toléré', () => {
  const brut = motif => ({ metier: 'comptabilite', competences: ['c1'], motif });
  assert.equal(validerAssemblage(brut('Maîtrise de Sage et Excel demandée.'), { ids, outils: ['Bilan', 'Excel'] }).motif, '');
  // NOTE: mots français courants et comparaison par mots entiers
  assert.equal(validerAssemblage(brut('Notions de comptabilité, vue d\'ensemble du bilan.'), { ids, outils: [] }).motif, 'Notions de comptabilité, vue d\'ensemble du bilan.');
  assert.equal(validerAssemblage(brut('Excel demandé.'), { ids, outils: ['Excelsior'] }).motif, '');
  assert.equal(validerAssemblage(brut('Annonce de comptable en cabinet, avec Excel.'), { ids, outils: ['Bilan', 'Excel'] }).motif, 'Annonce de comptable en cabinet, avec Excel.');
  assert.equal(validerAssemblage(brut('Cabinet comptable, tenue des comptes.'), { ids, outils: [] }).motif, 'Cabinet comptable, tenue des comptes.');
});

test('assemblage : le délai libère la file, et le résultat tardif est gardé pour la demande suivante', async () => {
  viderMemoAssemblage();
  const db = baseTest();
  let appels = 0;
  const f = { id: 'faux', modele: 'tardif', preparer: async () => {}, repondre: async () => { appels++; await new Promise(r => setTimeout(r, 120)); return { metier: 'comptabilite', competences: ['c1'], motif: '' }; } };
  const ancien = process.env.ASSEMBLAGE_DELAI_MS;
  try {
    process.env.ASSEMBLAGE_DELAI_MS = '30';
    await assert.rejects(assemblerCv(db, 'o1', { fournisseur: f }), (/** @type {any} */ e) => e.code === 'delai');
    // NOTE: la file est libre : une autre tâche passe aussitôt
    const { enFile } = await import('../lib/analyse/competences.mjs');
    assert.equal(await enFile('x', async () => 'libre'), 'libre');
    await new Promise(r => setTimeout(r, 150));
    assert.deepEqual((await assemblerCv(db, 'o1', { fournisseur: f })).competences, ['c1']);
    assert.equal(appels, 1);
  } finally {
    if (ancien === undefined) delete process.env.ASSEMBLAGE_DELAI_MS; else process.env.ASSEMBLAGE_DELAI_MS = ancien;
  }
});
