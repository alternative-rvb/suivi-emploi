// Tests des compétences relevées dans une annonce : citations contrôlées, rapprochement avec le Profil, cache, rattachement à la candidature.
// Aucun appel réseau réel, aucun modèle requis.
import test from 'node:test';
import assert from 'node:assert/strict';

const { lancerExtraction, lireCompetencesOffre, purgerCompetencesOrphelines, rapprocher, rattacherCandidature, validerCompetences, VERSION_COMPETENCES } = await import('../lib/analyse/competences.mjs');
const rapprochement = await import('../lib/correspondance.mjs');
const { ErreurSync } = await import('../lib/erreurs.mjs');
const { ouvrirBase, VERSION_SCHEMA } = await import('../lib/offres.mjs');

const ANNONCE = 'Nous recherchons un comptable. Maîtrise de Sage et d\'Excel exigée. Vous réalisez les rapprochements bancaires et la déclaration de TVA. Connaissance de Power BI appréciée. '.repeat(2);
const BRUT = {
  competences: [
    { valeur: 'Sage', citation: 'Maîtrise de Sage et d\'Excel exigée' },
    { valeur: 'Rapprochement bancaire', citation: 'les rapprochements bancaires' },
    { valeur: 'Power BI', citation: 'Connaissance de Power BI appréciée' },
    { valeur: 'Kubernetes', citation: 'Expert Kubernetes' },
    { valeur: 'sage', citation: 'Maîtrise de Sage' },
  ],
};
const PROFIL = [
  { id: 'c71', domaine: 'Comptabilité', competence: 'Sage', enseigner: 3, executer: 4 },
  { id: 'c72', domaine: 'Comptabilité', competence: 'Rapprochements bancaires et trésorerie', enseigner: 3, executer: 4 },
  { id: 'c75', domaine: 'Comptabilité', competence: 'Excel avancé', enseigner: 3, executer: 4 },
];
const faux = (repondre, extra = {}) => ({ id: 'faux', nom: 'Faux', modele: 'm', url: 'http://localhost:1', async preparer() {}, repondre, ...extra });

function baseTest() {
  const db = ouvrirBase(':memory:');
  const comp = db.prepare("INSERT INTO competences (id, domaine, competence, enseigner, executer, note, valide, ordre) VALUES (?, ?, ?, ?, ?, '', 0, ?)");
  PROFIL.forEach((c, i) => comp.run(c.id, c.domaine, c.competence, c.enseigner, c.executer, i));
  comp.run('c300', 'Data', 'Python', 1, 1, 9);
  db.prepare("INSERT INTO offres (id_offre, titre, entreprise, categorie, date_detection, annonce) VALUES ('o1', 'Comptable', 'ClientABC', 'comptabilite', '2026-10-20', ?)").run(ANNONCE);
  return db;
}

test('schéma : la table des compétences d\'offre est créée à la version 20', () => {
  assert.ok(VERSION_SCHEMA >= 20);
  const db = baseTest();
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'offre_competences'").get());
});

test('validation : citation introuvable, doublon et qualité personnelle écartés, domaine borné aux domaines du Profil', () => {
  const items = validerCompetences({ competences: [...BRUT.competences.map(x => ({ ...x, domaine: 'Data' })), { valeur: 'Rigueur', citation: 'Vous réalisez les rapprochements bancaires', domaine: 'Comptabilité' }, { valeur: 'Connaissances comptables', citation: 'Nous recherchons un comptable', domaine: 'Comptabilité' }] }, ANNONCE, ['Comptabilité', 'Data']);
  assert.deepEqual(items.map(i => i.valeur), ['Sage', 'Rapprochement bancaire', 'Power BI']);
  assert.ok(items.every(i => i.domaine === 'Data'));
  assert.equal(validerCompetences({ competences: [{ valeur: 'Sage', citation: 'Maîtrise de Sage', domaine: 'Inconnu' }] }, ANNONCE, ['Comptabilité', 'Data'])[0].domaine, 'Comptabilité');
  assert.throws(() => validerCompetences({ autre: 1 }, ANNONCE), e => e instanceof ErreurSync && e.code === 'format');
});

test('rapprochement : au Profil, proche, absente et ignorée, calculé contre le Profil du moment', () => {
  const items = validerCompetences(BRUT, ANNONCE, ['Comptabilité']);
  const r = rapprocher(items, PROFIL, ['power bi']);
  const statut = v => r.find(i => i.valeur === v)?.statut;
  assert.equal(statut('Sage'), 'profil');
  assert.equal(statut('Rapprochement bancaire'), 'profil', 'contenu mot pour mot dans « Rapprochements bancaires et trésorerie »');
  assert.equal(rapprocher([{ valeur: 'Rapprochement comptable', citation: 'x' }], PROFIL)[0].statut, 'proche');
  assert.equal(statut('Power BI'), 'ignoree');
  assert.equal(rapprocher(items, PROFIL).find(i => i.valeur === 'Power BI')?.statut, 'absente');
  // une compétence ajoutée au Profil change le statut sans nouvel appel au modèle
  const avec = rapprocher(items, [...PROFIL, { id: 'c200', domaine: 'Data', competence: 'Power BI', enseigner: null, executer: null }]);
  assert.equal(avec.find(i => i.valeur === 'Power BI')?.statut, 'profil');
});

test('extraction : enregistrée, mise en cache, relancée seulement si l\'annonce change', async () => {
  const db = baseTest();
  let appels = 0;
  const f = faux(async () => { appels++; return BRUT; });
  await lancerExtraction(db, 'o1', { fournisseur: f });
  assert.equal(appels, 1);
  const lu = lireCompetencesOffre(db, 'o1');
  assert.equal(lu?.items.length, 3);
  assert.equal(lu?.version, VERSION_COMPETENCES);
  await lancerExtraction(db, 'o1', { fournisseur: f });
  assert.equal(appels, 1, 'à jour : pas de nouvel appel');
  await lancerExtraction(db, 'o1', { fournisseur: f, refaire: true });
  assert.equal(appels, 2);
  db.prepare("UPDATE offres SET annonce = ? WHERE id_offre = 'o1'").run(ANNONCE + ' Ajout.');
  await lancerExtraction(db, 'o1', { fournisseur: f });
  assert.equal(appels, 3, 'annonce modifiée : relue');
});

test('extraction : appels concurrents partagés, annonce courte et échec du modèle sans effet sur la base', async () => {
  const db = baseTest();
  let appels = 0;
  const f = faux(async () => { appels++; await new Promise(r => setTimeout(r, 20)); return BRUT; });
  await Promise.all([lancerExtraction(db, 'o1', { fournisseur: f }), lancerExtraction(db, 'o1', { fournisseur: f })]);
  assert.equal(appels, 1);

  db.prepare("INSERT INTO offres (id_offre, titre, categorie, annonce) VALUES ('court', 'Court', 'autre', 'Trop bref')").run();
  await lancerExtraction(db, 'court', { fournisseur: f });
  assert.equal(lireCompetencesOffre(db, 'court'), null);

  db.prepare("INSERT INTO offres (id_offre, titre, categorie, annonce) VALUES ('o2', 'Autre', 'autre', ?)").run(ANNONCE);
  await lancerExtraction(db, 'o2', { fournisseur: faux(async () => { throw new ErreurSync('reseau', 'Ollama injoignable'); }) });
  assert.equal(lireCompetencesOffre(db, 'o2'), null);
});

test('candidature : l\'extraction suit la candidature et survit à la purge de l\'offre', async () => {
  const db = baseTest();
  await lancerExtraction(db, 'o1', { fournisseur: faux(async () => BRUT) });
  db.prepare("INSERT INTO candidatures (id, entreprise, poste, statut, offre_id) VALUES ('cand1', 'ClientABC', 'Comptable', 'en_cours', 'o1')").run();
  rattacherCandidature(db, 'o1', 'cand1');
  assert.equal(db.prepare("SELECT candidature_id FROM offre_competences WHERE id_offre = 'o1'").get().candidature_id, 'cand1');

  db.prepare("INSERT INTO offres (id_offre, titre, categorie, annonce) VALUES ('o3', 'Sans candidature', 'autre', ?)").run(ANNONCE);
  await lancerExtraction(db, 'o3', { fournisseur: faux(async () => BRUT) });
  db.exec("PRAGMA foreign_keys = OFF");
  db.prepare("DELETE FROM offres WHERE id_offre IN ('o1', 'o3')").run();
  purgerCompetencesOrphelines(db);
  assert.ok(lireCompetencesOffre(db, 'o1'), 'rattachée à une candidature : conservée');
  assert.equal(lireCompetencesOffre(db, 'o3'), null, 'sans candidature : purgée avec l\'offre');
});

test('rapprochement : « HTML / CSS » est éclaté, déjà au Profil séparément, et les doublons sont écartés', () => {
  const profil = [{ id: 'c1', domaine: 'Web', competence: 'HTML', enseigner: 4, executer: 4 }, { id: 'c2', domaine: 'Web', competence: 'CSS', enseigner: 4, executer: 4 }];
  const r = rapprocher([{ valeur: 'HTML / CSS', citation: 'x', domaine: 'Web' }, { valeur: 'css', citation: 'y', domaine: 'Web' }, { valeur: 'React, Vue', citation: 'z', domaine: 'Web' }], profil);
  assert.deepEqual(r.map(i => [i.valeur, i.statut]), [['HTML', 'profil'], ['CSS', 'profil'], ['React', 'absente'], ['Vue', 'absente']]);
});

test('pluriels : Maquette et Maquettes sont la même compétence, au Profil comme entre elles', () => {
  const profil = [{ id: 'c1', domaine: 'Design', competence: 'Maquette', enseigner: 4, executer: 4 }];
  const r = rapprocher([{ valeur: 'Maquettes', citation: 'x', domaine: 'Design' }, { valeur: 'Maquette', citation: 'y', domaine: 'Design' }, { valeur: 'Wireframes', citation: 'z', domaine: 'Design' }, { valeur: 'wireframe', citation: 'z', domaine: 'Design' }], profil, ['wireframes']);
  assert.deepEqual(r.map(i => [i.valeur, i.statut]), [['Maquettes', 'profil'], ['Wireframes', 'ignoree']]);
});

test('versions : HTML5 et HTML, CSS3 et CSS sont la même compétence, dans le Profil comme dans les annonces', () => {
  const profil = [{ id: 'c1', domaine: 'Web', competence: 'HTML', enseigner: 4, executer: 4 }, { id: 'c2', domaine: 'Web', competence: 'CSS3, responsive design', enseigner: 4, executer: 4 }];
  const r = rapprocher([{ valeur: 'HTML5', citation: 'x', domaine: 'Web' }, { valeur: 'CSS', citation: 'y', domaine: 'Web' }], profil);
  assert.deepEqual(r.map(i => [i.valeur, i.statut]), [['HTML5', 'profil'], ['CSS', 'profil']]);
  const { termesCompetences, competencesTrouvees } = rapprochement;
  const trouvees = competencesTrouvees(termesCompetences(profil, 3), 'integrateur', 'integrateur html5 et css maitrise');
  assert.deepEqual(trouvees.map(c => c.id), ['c1', 'c2']);
});

test('éclatement : CI/CD, UI/UX et R&D restent entiers', () => {
  const r = rapprocher([{ valeur: 'CI/CD', citation: 'x', domaine: 'DevOps' }, { valeur: 'UI / UX', citation: 'y', domaine: 'Design' }, { valeur: 'R&D', citation: 'z', domaine: 'Design' }], []);
  assert.deepEqual(r.map(i => i.valeur), ['CI/CD', 'UI / UX', 'R&D']);
});

test('rapprochement : CI/CD est couvert par CI/CD GitHub Actions du Profil', () => {
  const r = rapprocher([{ valeur: 'CI/CD', citation: 'x', domaine: 'DevOps' }, { valeur: 'Gestion', citation: 'y', domaine: 'DevOps' }], [{ id: 'c38', domaine: 'DevOps', competence: 'CI/CD GitHub Actions', enseigner: 3, executer: 4 }, { id: 'c9', domaine: 'DevOps', competence: 'Gestion de projet', enseigner: 3, executer: 4 }]);
  assert.deepEqual(r.map(i => [i.valeur, i.statut]), [['CI/CD', 'profil'], ['Gestion', 'absente']]);
});

test('file : une extraction à la fois, la dernière offre demandée passe devant les précédentes', async () => {
  const db = baseTest();
  for (const id of ['a', 'b', 'c', 'd']) db.prepare("INSERT INTO offres (id_offre, titre, categorie, annonce) VALUES (?, 'T', 'autre', ?)").run(id, ANNONCE);
  const ordre = [];
  let actives = 0, max = 0;
  const f = id => faux(async () => { actives++; max = Math.max(max, actives); ordre.push(id); await new Promise(r => setTimeout(r, 10)); actives--; return BRUT; });
  const lots = ['a', 'b', 'c', 'd'].map(id => lancerExtraction(db, id, { fournisseur: f(id) }));
  await Promise.all(lots);
  assert.equal(max, 1);
  // NOTE: a part tout de suite (file vide), puis le dernier demandé passe devant
  assert.deepEqual(ordre, ['a', 'd', 'c', 'b']);
});
