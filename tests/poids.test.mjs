// Tests de la matrice de poids des puces par métier : normalisation, tri, composition, routes et migration v24 (données fictives, sans réseau)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { serveurTemporaire } from './serveur-temporaire.mjs';
import { clePuce, composerCv, normaliserPoids, POIDS_MAX, poidsSuggere, trierPuces } from '../lib/cv.mjs';
import { ouvrirBase, VERSION_SCHEMA } from '../lib/offres.mjs';

const dossierTemp = () => mkdtempSync(join(tmpdir(), 'suivi-poids-'));

test('clePuce : casse, accents, espaces et ponctuation de bord ne changent pas la clé', () => {
  assert.equal(clePuce('  Développement  sur   mesure : PHP '), clePuce('developpement sur mesure : php'));
  assert.notEqual(clePuce('Maquettes Figma'), clePuce('Maquettes Canva'));
  assert.equal(clePuce(''), '');
});

test('normaliserPoids : clés normalisées, métiers connus, entiers de 0 à 3, vides retirés, ordre stable', () => {
  assert.equal(POIDS_MAX, 3);
  assert.deepEqual(normaliserPoids({ 'Maquettes Figma': { web_design: 3, dev_web: 1 } }), { 'maquettes figma': { dev_web: 1, web_design: 3 } });
  // NOTE: métier inconnu, poids hors bornes, non entier, texte : écartés ; une puce sans poids valide disparaît
  assert.deepEqual(normaliserPoids({ a: { boulangerie: 2, dev_web: 4, web_design: -1, comptabilite: 1.5, formateur_digital: '2' } }), {});
  assert.deepEqual(normaliserPoids({ a: { dev_web: 0 } }), { a: { dev_web: 0 } });
  // NOTE: deux clés qui se normalisent pareil sont fusionnées
  assert.deepEqual(normaliserPoids({ 'Logos': { web_design: 2 }, 'logos ': { dev_web: 1 } }), { logos: { dev_web: 1, web_design: 2 } });
  for (const mauvais of [null, undefined, [], 'x', 3, { a: null }, { a: 'x' }, { '': { dev_web: 1 } }]) assert.deepEqual(normaliserPoids(mauvais), {});
  const une = normaliserPoids({ a: { web_design: 1, comptabilite: 2 } });
  assert.deepEqual(normaliserPoids(une), une);
  assert.equal(JSON.stringify(une), '{"a":{"web_design":1,"comptabilite":2}}');
});

test('poidsSuggere : 0 sans mot du métier, 2 avec un mot, 3 avec deux mots différents', () => {
  assert.equal(poidsSuggere('Hébergement et support', 'dev_web'), 0);
  assert.equal(poidsSuggere('Sites en Astro', 'dev_web'), 2);
  assert.equal(poidsSuggere('Applications React avec une API Node', 'dev_web'), 3);
  assert.equal(poidsSuggere('React et React', 'dev_web'), 2);
  assert.equal(poidsSuggere('Quoi que ce soit', 'inconnu'), 0);
  assert.equal(poidsSuggere('Quoi que ce soit', ''), 0);
});

const LISTE = ['Hébergement', 'Maquettes Figma', 'Applications React', 'Support', 'Logos'];

test('trierPuces : sans poids pour le métier, le tri par mots-clés est inchangé', () => {
  assert.deepEqual(trierPuces(LISTE, 'web_design'), ['Maquettes Figma', 'Logos', 'Hébergement', 'Applications React', 'Support']);
  // NOTE: des poids d'un autre métier ne comptent pas
  const poids = { [clePuce('Support')]: { dev_web: 3 } };
  assert.deepEqual(trierPuces(LISTE, 'web_design', [], poids), trierPuces(LISTE, 'web_design'));
  assert.deepEqual(trierPuces(LISTE, '', [], { [clePuce('Support')]: { dev_web: 3 } }), LISTE);
});

test('trierPuces : poids décroissants, égalités dans l\'ordre du Profil, métier sans mots-clés trié aussi', () => {
  const poids = { [clePuce('Support')]: { web_design: 3 }, [clePuce('Logos')]: { web_design: 1 }, [clePuce('Maquettes Figma')]: { web_design: 1 }, [clePuce('Hébergement')]: { web_design: 0 } };
  assert.deepEqual(trierPuces(LISTE, 'web_design', [], poids), ['Support', 'Maquettes Figma', 'Logos', 'Applications React', 'Hébergement']);
  // NOTE: « Applications React » sans poids vaut 0,5 (aucun mot web design) : devant Hébergement, pesé 0 explicitement
  const seul = { [clePuce('Support')]: { comptabilite: 2 } };
  assert.deepEqual(trierPuces(['Zéro', 'Support', 'Autre'], 'comptabilite', [], seul), ['Support', 'Zéro', 'Autre']);
  assert.deepEqual(trierPuces(['b', 'a'], 'web_design', [], { b: { web_design: 0 }, a: { web_design: 0 } }), ['b', 'a']);
});

test('trierPuces : une puce pesée à 0 passe après une puce sans poids pertinente, et l\'inverse pour une puce non pertinente', () => {
  const poids = { [clePuce('Maquettes Figma')]: { web_design: 0 } };
  // Maquettes pesée 0, Logos non pesée mais pertinente (2) : Logos devant ; Hébergement non pesée non pertinente (0) : égalité, ordre d'origine
  assert.deepEqual(trierPuces(['Hébergement', 'Maquettes Figma', 'Logos'], 'web_design', [], poids), ['Logos', 'Hébergement', 'Maquettes Figma']);
  // NOTE: un 0 explicite passe après les puces non pesées et non pertinentes
  assert.deepEqual(trierPuces(['Zéro', 'Autre', 'Dernier'], 'web_design', [], { zero: { web_design: 0 } }), ['Autre', 'Dernier', 'Zéro']);
});

test('trierPuces : bonus +1 pour une puce pesée qui cite une compétence de l\'offre, à poids égal seulement', () => {
  const poids = { [clePuce('Hébergement')]: { dev_web: 2 }, [clePuce('Maquettes Figma')]: { dev_web: 2 }, [clePuce('Support')]: { dev_web: 3 } };
  assert.deepEqual(trierPuces(['Hébergement', 'Maquettes Figma', 'Support'], 'dev_web', ['Figma'], poids), ['Maquettes Figma', 'Support', 'Hébergement']);
  // NOTE: 2 + 1 égale 3 : l'égalité garde l'ordre d'origine (Maquettes avant Support), le bonus ne dépasse pas un niveau d'écart
  assert.deepEqual(trierPuces(['Maquettes Figma', 'Support'], 'dev_web', ['Figma'], { [clePuce('Maquettes Figma')]: { dev_web: 2 }, [clePuce('Support')]: { dev_web: 3 } }), ['Maquettes Figma', 'Support']);
  // NOTE: terme de l'offre à mot entier, comme pertinence
  assert.deepEqual(trierPuces(['Hébergement', 'Figmatique'], 'dev_web', ['Figma'], { [clePuce('Hébergement')]: { dev_web: 1 }, [clePuce('Figmatique')]: { dev_web: 1 } }), ['Hébergement', 'Figmatique']);
});

test('trierPuces : ne modifie pas la liste d\'entrée et garde 0 ou 1 puce telle quelle', () => {
  const entree = ['b', 'a', 'c'];
  const copie = [...entree];
  trierPuces(entree, 'dev_web', [], { a: { dev_web: 3 } });
  assert.deepEqual(entree, copie);
  assert.deepEqual(trierPuces([], 'dev_web', [], { a: { dev_web: 3 } }), []);
  assert.deepEqual(trierPuces(['a'], 'dev_web', [], { a: { dev_web: 3 } }), ['a']);
});

const BASE = { profil: { contact: { nom: 'Prénom Nom' } }, competences: [] };
const XP = { id: 'a', poste: 'Développeur freelance', type: 'freelance', categorie: 'dev_web', debut: '2017-05', fin: '', description: 'Hébergement. Sites en Astro. Maquettes Figma. Support. Applications React avec une API Node. Logos' };

test('composerCv : les poids du métier visé ordonnent les puces, ceux des autres métiers sont ignorés, le CV général garde l\'ordre du Profil', () => {
  const poids = { [clePuce('Logos')]: { web_design: 3, dev_web: 0 }, [clePuce('Support')]: { dev_web: 3 }, [clePuce('Hébergement')]: { dev_web: 2 } };
  const dev = composerCv({ ...BASE, experiences: [{ ...XP, poids }] }, { cible: 'metier', categorie: 'dev_web' }).experiences[0].puces;
  assert.deepEqual(dev.slice(0, 2), ['Support', 'Hébergement']);
  assert.ok(!dev.includes('Logos'), 'poids 0 pour le dev web : puce masquée');
  const design = composerCv({ ...BASE, experiences: [{ ...XP, poids }] }, { cible: 'metier', categorie: 'web_design' }).experiences[0].puces;
  assert.equal(design[0], 'Logos');
  const general = composerCv({ ...BASE, experiences: [{ ...XP, poids }] }).experiences[0].puces;
  assert.deepEqual(general, ['Hébergement', 'Sites en Astro', 'Maquettes Figma', 'Support', 'Applications React avec une API Node', 'Logos']);
});

test('composerCv : un poids 0 masque la puce sauf si elle cite une compétence de l\'offre', () => {
  const zero = { [clePuce('Logos')]: { dev_web: 0 }, [clePuce('Support')]: { dev_web: 3 } };
  const puces = (x, req = { cible: 'metier', categorie: 'dev_web' }) => composerCv({ ...BASE, experiences: [x] }, req).experiences[0].puces;
  assert.ok(!puces({ ...XP, poids: zero }).includes('Logos'));
  const tous = Object.fromEntries(['Hébergement', 'Sites en Astro', 'Maquettes Figma', 'Support', 'Applications React avec une API Node', 'Logos'].map(p => [clePuce(p), { dev_web: 0 }]));
  const cvMetier = composerCv({ ...BASE, experiences: [{ ...XP, poids: tous }] }, { cible: 'metier', categorie: 'dev_web' }).experiences;
  assert.equal(cvMetier.length, 1, 'toutes à 0, cible Métier : l\'expérience reste, sur une ligne');
  assert.deepEqual({ puces: cvMetier[0].puces, condensee: cvMetier[0].condensee }, { puces: [], condensee: true });
  assert.equal(composerCv({ ...BASE, experiences: [{ ...XP, poids: tous }] }, { cible: 'offre', categorie: 'dev_web' }).experiences.length, 0, 'toutes à 0, cible Offre : expérience masquée');
  assert.equal(composerCv({ ...BASE, experiences: [{ ...XP, poids: tous }] }).experiences[0].puces.length, 6, 'CV général : les poids sont ignorés');
});

test('composerCv : le seuil de poids masque les puces pesées jusqu\'au seuil, jamais celles de poids 3 ni celles qui citent l\'offre, ni les puces non pesées', () => {
  const poids = { [clePuce('Logos')]: { dev_web: 1 }, [clePuce('Support')]: { dev_web: 2 }, [clePuce('Hébergement')]: { dev_web: 3 }, [clePuce('Maquettes Figma')]: { dev_web: 1 } };
  const compo = (seuilPuces, extra = {}) => composerCv({ ...BASE, competences: [{ id: 'f', domaine: 'Design', competence: 'Figma', enseigner: 4, executer: 4 }], experiences: [{ ...XP, poids }] }, { cible: 'offre', categorie: 'dev_web', seuilPuces, ...extra }).experiences[0].puces;
  assert.ok(compo(0).includes('Logos'));
  assert.ok(!compo(1).includes('Logos'));
  assert.ok(compo(1).includes('Support'));
  assert.ok(!compo(2).includes('Support'));
  assert.ok(compo(2).includes('Hébergement'), 'poids 3 jamais masqué');
  assert.ok(compo(2, { prioritaires: ['f'] }).includes('Maquettes Figma'), 'puce qui cite une compétence de l\'offre gardée');
  assert.ok(compo(2).includes('Sites en Astro'), 'puce non pesée gardée');
});

test('composerCv : plafondCompetences limite le total des compétences d\'un CV par métier ou sur mesure', () => {
  const competences = Array.from({ length: 12 }, (_, i) => ({ id: 'k' + i, domaine: 'Développement', competence: 'Techno ' + i, enseigner: 4, executer: 4 }));
  const total = plafondCompetences => composerCv({ ...BASE, competences }, { cible: 'metier', categorie: 'dev_web', plafondCompetences }).competences.flatMap(d => d.liste).length;
  assert.equal(total(5), 5);
  assert.ok(total(26) > 5);
});

test('composerCv : poids en JSON brut (secours), JSON invalide ou absent sans effet, expériences regroupées fusionnent leurs poids', () => {
  const poids = { [clePuce('Support')]: { dev_web: 3 } };
  const ordre = x => composerCv({ ...BASE, experiences: [x] }, { cible: 'metier', categorie: 'dev_web' }).experiences[0].puces;
  assert.equal(ordre({ ...XP, poids: JSON.stringify(poids) })[0], 'Support');
  assert.deepEqual(ordre({ ...XP, poids: '{pas du json' }), ordre({ ...XP }));
  assert.deepEqual(ordre({ ...XP, poids: '{}' }), ordre({ ...XP }));
  assert.deepEqual(ordre({ ...XP, poids: null }), ordre({ ...XP }));
  const groupe = composerCv({ ...BASE, experiences: [
    { ...XP, id: 'a', employeur: 'ClientABC', debut: '2020-01', fin: '2021-01', description: 'Hébergement. Support', poids: { [clePuce('Support')]: { dev_web: 3 } } },
    { ...XP, id: 'b', employeur: 'ClientDEF', debut: '2022-01', fin: '2023-01', description: 'Logos. Sites en Astro', poids: { [clePuce('Logos')]: { dev_web: 3 } } },
  ] }, { cible: 'metier', categorie: 'dev_web' }).experiences[0].puces;
  // NOTE: l'expérience la plus récente passe d'abord, à poids égal (3 et 3) : Logos, puis Support
  assert.deepEqual(groupe.slice(0, 2), ['Logos', 'Support']);
});

test('composerCv : une expérience d\'un autre métier à trois puces pesées 2 et plus est gardée (puces pesées, puis PUCES_CONDENSEE autres), sinon condensée', () => {
  const xp = { ...XP, categorie: 'formateur_digital', description: 'A. B. C. D. E. F. G', poids: Object.fromEntries(['D', 'E', 'F'].map(p => [p, { web_design: 3 }])) };
  const avec = composerCv({ ...BASE, experiences: [xp] }, { cible: 'metier', categorie: 'web_design' }).experiences[0];
  assert.deepEqual(avec.puces, ['D', 'E', 'F', 'A', 'B']);
  assert.equal(avec.condensee, false);
  // NOTE: deux puces pesées seulement : sous PUCES_DU_METIER, l'expérience reste condensée à ses 2 puces les plus lourdes
  const deux = composerCv({ ...BASE, experiences: [{ ...xp, poids: { d: { web_design: 3 }, e: { web_design: 3 } } }] }, { cible: 'metier', categorie: 'web_design' }).experiences[0];
  assert.equal(deux.condensee, true);
  assert.equal(deux.puces.length, 2);
  // NOTE: un poids de 1 ne compte pas comme pertinent
  const faibles = composerCv({ ...BASE, experiences: [{ ...xp, poids: Object.fromEntries(['D', 'E', 'F'].map(p => [p, { web_design: 1 }])) }] }, { cible: 'metier', categorie: 'web_design' }).experiences[0];
  assert.equal(faibles.condensee, true);
});

test('routes : poids créé, normalisé, validé, relu, PATCH identique sans journal, pas d\'effet sur les autres champs', async () => {
  const dir = dossierTemp();
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const sans = await appel('POST', '/api/experiences', { poste: 'Poste sans poids', categorie: 'dev_web', debut: '2017-05' });
    assert.equal(sans.status, 201);
    assert.deepEqual(sans.data.poids, {});
    const cree = await appel('POST', '/api/experiences', { poste: 'Développeur freelance', categorie: 'dev_web', debut: '2017-05', description: 'Maquettes Figma. Support', poids: { 'Maquettes Figma': { web_design: 3, comptabilite: 0 } } });
    assert.equal(cree.status, 201);
    assert.deepEqual(cree.data.poids, { 'maquettes figma': { comptabilite: 0, web_design: 3 } });
    const id = cree.data.id;
    for (const mauvais of [{ a: { web_design: 4 } }, { a: { web_design: -1 } }, { a: { web_design: 1.5 } }, { a: { web_design: '2' } }, { a: { boulangerie: 1 } }, { a: 3 }, { a: null }, { '': { dev_web: 1 } }, [], 'x', 5, null]) {
      assert.equal((await appel('PATCH', `/api/experiences/${id}`, { poids: mauvais })).status, 400, JSON.stringify(mauvais));
    }
    const trop = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`puce ${i}`, { dev_web: 1 }]));
    assert.equal((await appel('PATCH', `/api/experiences/${id}`, { poids: trop })).status, 400);
    assert.equal((await appel('PATCH', `/api/experiences/${id}`, { poids: { ['x'.repeat(1001)]: { dev_web: 1 } } })).status, 400);
    // NOTE: les refus ne touchent à rien
    assert.deepEqual((await appel('GET', '/api/state')).data.experiences.find(e => e.id === id).poids, { 'maquettes figma': { comptabilite: 0, web_design: 3 } });
    // NOTE: même valeur sous une autre forme : aucune modification journalisée
    assert.equal((await appel('PATCH', `/api/experiences/${id}`, { poids: { 'maquettes figma': { web_design: 3, comptabilite: 0 } } })).status, 200);
    const journal = (await appel('GET', '/api/journal')).data;
    assert.ok(((journal.evenements ?? journal).filter(e => e.entite_id === id)).every(e => !(e.changements ?? []).some(c => c.champ === 'poids')));
    // NOTE: PATCH d'un autre champ garde les poids ; PATCH des poids garde les autres champs
    assert.equal((await appel('PATCH', `/api/experiences/${id}`, { employeur: 'ClientABC' })).status, 200);
    assert.equal((await appel('PATCH', `/api/experiences/${id}`, { poids: { Support: { dev_web: 2 } } })).status, 200);
    const relu = (await appel('GET', '/api/state')).data.experiences.find(e => e.id === id);
    assert.deepEqual(relu.poids, { support: { dev_web: 2 } });
    assert.equal(relu.employeur, 'ClientABC');
    assert.equal(relu.description, 'Maquettes Figma. Support');
    // NOTE: le CV composé par l'API utilise les poids
    const cv = (await appel('POST', '/api/cv/composer', { cible: 'metier', categorie: 'dev_web' })).data;
    assert.equal((cv.document ?? cv).experiences.find(e => e.ids.includes(id)).puces[0], 'Support');
    // NOTE: vider les poids
    assert.equal((await appel('PATCH', `/api/experiences/${id}`, { poids: {} })).status, 200);
    assert.deepEqual((await appel('GET', '/api/state')).data.experiences.find(e => e.id === id).poids, {});
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('migration v24 : colonne ajoutée avec sauvegarde, données gardées, poids par défaut vide, deuxième ouverture sans effet', () => {
  assert.ok(VERSION_SCHEMA >= 24);
  const dir = dossierTemp();
  try {
    const chemin = join(dir, 'suivi.db');
    ouvrirBase(chemin).close();
    const ancienne = new DatabaseSync(chemin);
    ancienne.exec("INSERT INTO experiences (id, poste, employeur, description) VALUES ('x1', 'Poste', 'ClientABC', 'Une phrase')");
    ancienne.exec('ALTER TABLE experiences DROP COLUMN poids; PRAGMA user_version = 23');
    ancienne.close();
    assert.ok(!existsSync(join(dir, 'data', 'backups')));
    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    assert.ok(db.prepare('PRAGMA table_info(experiences)').all().some(c => c.name === 'poids'));
    assert.deepEqual({ ...db.prepare("SELECT poste, employeur, description, intitules, poids FROM experiences WHERE id = 'x1'").get() }, { poste: 'Poste', employeur: 'ClientABC', description: 'Une phrase', intitules: '{}', poids: '{}' });
    db.close();
    const sauvegardes = readdirSync(join(dir, 'data', 'backups')).filter(f => f.startsWith(`suivi-avant-schema-v${VERSION_SCHEMA}-`));
    assert.equal(sauvegardes.length, 1);
    const copie = new DatabaseSync(join(dir, 'data', 'backups', sauvegardes[0]), { readOnly: true });
    assert.ok(!copie.prepare('PRAGMA table_info(experiences)').all().some(c => c.name === 'poids'), 'la sauvegarde est celle d\'avant la migration');
    copie.close();
    ouvrirBase(chemin).close();
    assert.equal(readdirSync(join(dir, 'data', 'backups')).length, 1, 'pas de nouvelle sauvegarde à la réouverture');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('migration v26 : clés des lettres génériques angle:<métier> renommées metier:<métier> avec sauvegarde, autres clés intactes', () => {
  assert.ok(VERSION_SCHEMA >= 26);
  const dir = dossierTemp();
  try {
    const chemin = join(dir, 'suivi.db');
    ouvrirBase(chemin).close();
    const ancienne = new DatabaseSync(chemin);
    ancienne.exec("INSERT INTO lettre_brouillons (cle, texte, maj_le) VALUES ('angle:comptabilite', 'Texte A', '2026-01-01'), ('angle:dev_web', 'Texte B', '2026-01-01'), ('man-1', 'Texte C', '2026-01-01')");
    ancienne.exec('PRAGMA user_version = 25');
    ancienne.close();
    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    assert.deepEqual(db.prepare('SELECT cle, texte FROM lettre_brouillons ORDER BY cle').all().map(r => ({ ...r })), [
      { cle: 'man-1', texte: 'Texte C' },
      { cle: 'metier:comptabilite', texte: 'Texte A' },
      { cle: 'metier:dev_web', texte: 'Texte B' },
    ]);
    db.close();
    assert.equal(readdirSync(join(dir, 'data', 'backups')).filter(f => f.startsWith(`suivi-avant-schema-v${VERSION_SCHEMA}-`)).length, 1);
    ouvrirBase(chemin).close();
    assert.equal(readdirSync(join(dir, 'data', 'backups')).length, 1, 'pas de nouvelle sauvegarde à la réouverture');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('migration v26 : une clé metier: déjà présente est gardée, l\'ancienne clé angle: est retirée sans erreur', () => {
  const dir = dossierTemp();
  try {
    const chemin = join(dir, 'suivi.db');
    ouvrirBase(chemin).close();
    const ancienne = new DatabaseSync(chemin);
    ancienne.exec("INSERT INTO lettre_brouillons (cle, texte, maj_le) VALUES ('angle:dev_web', 'Ancien', '2026-01-01'), ('metier:dev_web', 'Récent', '2026-02-01')");
    ancienne.exec('PRAGMA user_version = 25');
    ancienne.close();
    const db = ouvrirBase(chemin);
    assert.deepEqual(db.prepare('SELECT cle, texte FROM lettre_brouillons').all().map(r => ({ ...r })), [{ cle: 'metier:dev_web', texte: 'Récent' }]);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('composerCv : la formation qui parle du métier visé passe avant, sinon ordre chronologique inverse', () => {
  const formations = [
    { id: 'f1', type: 'diplome', titre: 'DUT Gestion des entreprises', etablissement: 'IUT', debut: '', fin: '2002', note: '' },
    { id: 'f2', type: 'diplome', titre: 'Web Designer (bac+2)', etablissement: 'École', debut: '', fin: '2016', note: '' },
    { id: 'f3', type: 'diplome', titre: 'Master Gestion', etablissement: 'Fac', debut: '', fin: '2020', note: '' },
  ];
  const titres = cible => composerCv({ ...BASE, formations }, cible).formation.map(f => f.id);
  assert.deepEqual(titres({ cible: 'general' }), ['f3', 'f2', 'f1']);
  assert.deepEqual(titres({ cible: 'metier', categorie: 'web_design' }), ['f2', 'f3', 'f1']);
  assert.deepEqual(titres({ cible: 'metier', categorie: 'dev_web' }), ['f3', 'f2', 'f1']);
});

// ANCHOR: v30, l'ancienne origine (le prénom) des lettres devient « utilisateur » ; aucune ligne perdue, sauvegarde avant, rien d'autre modifié
test('migration v30 : origine des lettres renommée, textes intacts, sauvegarde faite', () => {
  const dir = dossierTemp();
  try {
    const chemin = join(dir, 'suivi.db');
    ouvrirBase(chemin).close();
    const ancienne = new DatabaseSync(chemin);
    ancienne.exec("INSERT INTO lettre_brouillons (cle, texte, origine, maj_le) VALUES ('man-1', 'Texte A', 'ancien-prenom', '2026-01-01'), ('man-2', 'Texte B', 'claude', '2026-01-01')");
    ancienne.exec('PRAGMA user_version = 29');
    ancienne.close();
    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    assert.deepEqual(db.prepare('SELECT cle, texte, origine FROM lettre_brouillons ORDER BY cle').all().map(r => ({ ...r })), [
      { cle: 'man-1', texte: 'Texte A', origine: 'utilisateur' },
      { cle: 'man-2', texte: 'Texte B', origine: 'claude' },
    ]);
    db.close();
    assert.equal(readdirSync(join(dir, 'data', 'backups')).filter(f => f.startsWith(`suivi-avant-schema-v${VERSION_SCHEMA}-`)).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
