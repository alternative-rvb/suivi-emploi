// ANCHOR: poids des compétences par métier (competences.poids, schéma v27) : composition du CV, routes et migration
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { serveurTemporaire } from './serveur-temporaire.mjs';
import { composerCv, normaliserPoidsCompetence, validerDocument } from '../lib/cv.mjs';
import { ouvrirBase, VERSION_SCHEMA } from '../lib/offres.mjs';

const dossierTemp = () => mkdtempSync(join(tmpdir(), 'suivi-poidsc-'));
const comp = (id, nom, niveau, poids) => ({ id, domaine: 'Développement', competence: nom, enseigner: niveau, executer: niveau, note: '', valide: true, ordre: 0, ...(poids ? { poids } : {}) });
const noms = (etat, req) => composerCv({ profil: { contact: { nom: 'Prénom Nom' } }, experiences: [], ...etat }, req).competences.flatMap(d => d.liste);

test('normaliserPoidsCompetence : métiers connus, entiers de 0 à 3, le reste est retiré', () => {
  assert.deepEqual(normaliserPoidsCompetence({ dev_web: 3, web_design: 4, boulangerie: 1, comptabilite: '2', formateur_digital: 0 }), { formateur_digital: 0, dev_web: 3 });
  for (const v of [null, [], 'x', 5, undefined]) assert.deepEqual(normaliserPoidsCompetence(v), {});
});

test('composerCv : sans poids, le tri des compétences reste celui du niveau', () => {
  const competences = [comp('a', 'Astro', 3), comp('b', 'React', 5), comp('c', 'Node', 4)];
  assert.deepEqual(noms({ competences }, { cible: 'metier', categorie: 'dev_web' }), ['React', 'Node', 'Astro']);
});

test('composerCv : le poids du métier visé trie avant le niveau, ceux des autres métiers et du CV général sont ignorés', () => {
  const competences = [comp('a', 'Astro', 3, { dev_web: 3 }), comp('b', 'React', 5), comp('c', 'Node', 4, { dev_web: 1 })];
  assert.deepEqual(noms({ competences }, { cible: 'metier', categorie: 'dev_web' }), ['Astro', 'React', 'Node']);
  assert.deepEqual(noms({ competences }, { cible: 'metier', categorie: 'web_design' }), ['React', 'Node', 'Astro']);
  assert.deepEqual(noms({ competences }), ['React', 'Node', 'Astro']);
});

test('composerCv : un poids 0 masque la compétence pour le métier visé, sauf si l\'offre la demande', () => {
  const competences = [comp('a', 'Astro', 4, { dev_web: 0 }), comp('b', 'React', 5)];
  assert.deepEqual(noms({ competences }, { cible: 'metier', categorie: 'dev_web' }), ['React']);
  assert.deepEqual(noms({ competences }, { cible: 'offre', categorie: 'dev_web', prioritaires: ['a'] }), ['Astro', 'React']);
});

test('composerCv : le niveau minimum reste exigé, un poids 3 ne fait pas apparaître une compétence faible', () => {
  const competences = [comp('a', 'Astro', 2, { dev_web: 3 }), comp('b', 'React', 4)];
  assert.deepEqual(noms({ competences }, { cible: 'metier', categorie: 'dev_web' }), ['React']);
});

test('composerCv : au plafond, une compétence pesée 3 est gardée avant les autres de même niveau', () => {
  const beaucoup = Array.from({ length: 30 }, (_, i) => comp('x' + i, 'Techno ' + i, 4));
  const competences = [...beaucoup, comp('z', 'Pépite', 3, { dev_web: 3 })];
  const liste = noms({ competences }, { cible: 'metier', categorie: 'dev_web' });
  assert.ok(liste.includes('Pépite'));
  assert.ok(liste.length <= 26);
});

test('routes : poids de compétence créé, validé, relu, vidé', async () => {
  const dir = dossierTemp();
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const cree = await appel('POST', '/api/competences', { domaine: 'Test', competence: 'CompétenceX' });
    assert.equal(cree.status, 201);
    assert.deepEqual(cree.data.poids, {});
    const id = cree.data.id;
    for (const mauvais of [{ dev_web: 4 }, { dev_web: -1 }, { dev_web: 1.5 }, { dev_web: '2' }, { boulangerie: 1 }, [], 'x', 5, null]) {
      assert.equal((await appel('PATCH', `/api/competences/${id}`, { poids: mauvais })).status, 400, JSON.stringify(mauvais));
    }
    assert.equal((await appel('PATCH', `/api/competences/${id}`, { poids: { web_design: 3, dev_web: 0 } })).status, 200);
    const relu = (await appel('GET', '/api/state')).data.competences.find(c => c.id === id);
    assert.deepEqual(relu.poids, { web_design: 3, dev_web: 0 });
    assert.equal(relu.competence, 'CompétenceX');
    assert.equal((await appel('PATCH', `/api/competences/${id}`, { note: 'Contexte' })).status, 200);
    assert.deepEqual((await appel('GET', '/api/state')).data.competences.find(c => c.id === id).poids, { web_design: 3, dev_web: 0 });
    assert.equal((await appel('PATCH', `/api/competences/${id}`, { poids: {} })).status, 200);
    assert.deepEqual((await appel('GET', '/api/state')).data.competences.find(c => c.id === id).poids, {});
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('migration v27 : colonne competences.poids ajoutée avec sauvegarde, données gardées, deuxième ouverture sans effet', () => {
  assert.ok(VERSION_SCHEMA >= 27);
  const dir = dossierTemp();
  try {
    const chemin = join(dir, 'suivi.db');
    ouvrirBase(chemin).close();
    const ancienne = new DatabaseSync(chemin);
    ancienne.exec("INSERT INTO competences (id, domaine, competence, enseigner, executer) VALUES ('c1', 'Dev', 'Astro', 4, 4)");
    ancienne.exec('ALTER TABLE competences DROP COLUMN poids; PRAGMA user_version = 26');
    ancienne.close();
    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    assert.deepEqual({ ...db.prepare("SELECT competence, enseigner, poids FROM competences WHERE id = 'c1'").get() }, { competence: 'Astro', enseigner: 4, poids: '{}' });
    db.close();
    const sauvegardes = readdirSync(join(dir, 'data', 'backups')).filter(f => f.startsWith(`suivi-avant-schema-v${VERSION_SCHEMA}-`));
    assert.equal(sauvegardes.length, 1);
    const copie = new DatabaseSync(join(dir, 'data', 'backups', sauvegardes[0]), { readOnly: true });
    assert.ok(!copie.prepare('PRAGMA table_info(competences)').all().some(c => c.name === 'poids'), 'la sauvegarde est celle d\'avant la migration');
    copie.close();
    ouvrirBase(chemin).close();
    assert.equal(readdirSync(join(dir, 'data', 'backups')).length, 1, 'pas de nouvelle sauvegarde à la réouverture');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('avecCompetence : ajout depuis une offre = poids 3 pour le seul métier de l\'offre, jamais de baisse, sans métier aucun poids', async () => {
  const { avecCompetence } = await import('../client/src/competences.ts');
  const base = [{ id: 'c1', domaine: 'Dev', competence: 'Astro', enseigner: 4, executer: 4, note: '', valide: true, ordre: 0, poids: { dev_web: 2 } }];
  const ajoutee = avecCompetence(base, 'Dev', 'Hugo', { executer: 3 }, 'dev_web').find(s => s.competence === 'Hugo');
  assert.deepEqual(ajoutee.poids, { dev_web: 3 });
  assert.deepEqual(avecCompetence(base, 'Dev', 'Hugo', {}, '').find(s => s.competence === 'Hugo').poids, {}, 'offre « autre » : aucun poids');
  assert.deepEqual(avecCompetence(base, 'Dev', 'Astros', {}, 'dev_web')[0].poids, { dev_web: 3 }, 'compétence déjà au Profil : montée à 3');
  assert.deepEqual(avecCompetence(base, 'Dev', 'Astro', {}, 'web_design')[0].poids, { dev_web: 2, web_design: 3 }, 'les autres métiers gardent leur poids');
  const haute = [{ ...base[0], poids: { dev_web: 3 } }];
  assert.equal(avecCompetence(haute, 'Dev', 'Astro', {}, 'dev_web'), haute, 'déjà à 3 : liste inchangée');
  assert.equal(avecCompetence(base, 'Dev', 'Astro', {}, ''), base, 'sans métier : liste inchangée');
});

test('composerCvPages : seuil de poids puis plafond de compétences relevés jusqu\'à tenir en 2 pages, puces de poids 3 jamais retirées', async () => {
  const { composerCvPages } = await import('../lib/cv-pages.mjs');
  const { clePuce } = await import('../lib/cv.mjs');
  const poids = { [clePuce('Logos')]: { dev_web: 1 }, [clePuce('Support')]: { dev_web: 2 }, [clePuce('Hébergement')]: { dev_web: 3 } };
  const etat = {
    profil: { contact: { nom: 'Prénom Nom' } },
    experiences: [{ id: 'a', poste: 'Développeur', type: 'freelance', categorie: 'dev_web', debut: '2017-05', fin: '', description: 'Hébergement. Support. Logos. Sites en Astro', poids }],
    competences: Array.from({ length: 30 }, (_, i) => comp('x' + i, 'Techno ' + i, 4)),
  };
  let essais = 0;
  const mesurer = nbPages => async () => nbPages(++essais);
  const offre = { cible: 'offre', categorie: 'dev_web' };
  const tient = await composerCvPages(etat, offre, { mesurer: mesurer(() => 2) });
  assert.equal(essais, 1, 'tient d\'emblée : un seul essai');
  assert.deepEqual({ pages: tient.pages, tient: tient.tient }, { pages: 2, tient: true });
  assert.ok(tient.document.experiences[0].puces.includes('Logos'));
  essais = 0;
  const serre = await composerCvPages(etat, offre, { mesurer: mesurer(n => (n < 3 ? 3 : 2)) });
  assert.equal(essais, 3, 'tient au seuil 2');
  assert.ok(!serre.document.experiences[0].puces.includes('Support'));
  assert.ok(serre.document.experiences[0].puces.includes('Hébergement'));
  essais = 0;
  const plafonne = await composerCvPages(etat, offre, { mesurer: mesurer(n => (n < 5 ? 3 : 2)) });
  assert.ok(plafonne.document.competences.flatMap(d => d.liste).length <= 16);
  essais = 0;
  const trop = await composerCvPages(etat, offre, { mesurer: mesurer(() => 4) });
  assert.equal(essais, 8, 'tous les essais utilisés');
  assert.deepEqual({ pages: trop.pages, tient: trop.tient }, { pages: 4, tient: false }, 'le dépassement est signalé');
  essais = 0;
  const sansMetier = await composerCvPages(etat, { cible: 'offre', categorie: '' }, { mesurer: mesurer(() => 4) });
  assert.equal(essais, 1, 'offre sans métier : un seul rendu, les essais ne changeraient rien');
  assert.equal(sansMetier.tient, false);
  essais = 0;
  const metier = await composerCvPages(etat, { cible: 'metier', categorie: 'dev_web' }, { mesurer: mesurer(() => 9) });
  assert.equal(essais, 0, 'seule la cible Offre est limitée');
  assert.equal(metier.tient, true);
  assert.ok((await composerCvPages(etat, offre)).document.entete, 'mesure réelle par le PDF');
});

test('routes : le champ angle est refusé, une compétence modifiée sans poids garde ses poids', async () => {
  const dir = dossierTemp();
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const refus = await appel('POST', '/api/cv/composer', { cible: 'metier', angle: 'comptabilite' });
    assert.equal(refus.status, 400);
    assert.match(refus.data.erreur ?? refus.data.error ?? JSON.stringify(refus.data), /metier/);
    const c = (await appel('POST', '/api/competences', { domaine: 'Test', competence: 'CompétenceY', poids: { dev_web: 3 } })).data;
    assert.equal((await appel('PATCH', `/api/competences/${c.id}`, { competence: 'CompétenceY2', enseigner: 4 })).status, 200);
    assert.deepEqual((await appel('GET', '/api/state')).data.competences.find(x => x.id === c.id).poids, { dev_web: 3 });
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('lieux : migration v28 (formations.lieu), CV avec lieu d\'établissement et d\'employeur regroupé', () => {
  assert.ok(VERSION_SCHEMA >= 28);
  const dir = dossierTemp();
  try {
    const chemin = join(dir, 'suivi.db');
    ouvrirBase(chemin).close();
    const ancienne = new DatabaseSync(chemin);
    ancienne.exec("INSERT INTO formations (id, type, titre, etablissement) VALUES ('f1', 'diplome', 'DUT', 'IUT')");
    ancienne.exec('ALTER TABLE formations DROP COLUMN lieu; PRAGMA user_version = 27');
    ancienne.close();
    const db = ouvrirBase(chemin);
    assert.deepEqual({ ...db.prepare("SELECT etablissement, lieu FROM formations WHERE id = 'f1'").get() }, { etablissement: 'IUT', lieu: '' });
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const etat = {
    profil: { contact: { nom: 'Prénom Nom' } },
    formations: [{ id: 'f1', type: 'diplome', titre: 'DUT', etablissement: 'IUT', lieu: 'Villeneuve (83)', debut: '', fin: '2002', note: '' }],
    experiences: [
      { id: 'a', poste: 'Formateur', type: 'formateur', categorie: 'formateur_digital', employeur: 'AFPA', lieu: 'Marseille (13)', debut: '2020-01', fin: '2020-12', description: 'Cours' },
      { id: 'b', poste: 'Formateur', type: 'formateur', categorie: 'formateur_digital', employeur: 'AFPA', lieu: '', debut: '2021-01', fin: '2021-12', description: 'Cours' },
    ],
  };
  const doc = composerCv(etat, { cible: 'metier', categorie: 'formateur_digital' });
  assert.equal(doc.formation[0].lieu, 'Villeneuve (83)');
  assert.equal(doc.experiences[0].lieu, 'Marseille (13)', 'postes regroupés : le seul lieu renseigné est repris');
  assert.equal(validerDocument(doc).formation[0].lieu, 'Villeneuve (83)');
});
