// Tests du CV composé : composition, contrôle contre la référence, secours et routes (données fictives, sans réseau)
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveurTemporaire } from './serveur-temporaire.mjs';
import { DatabaseSync } from 'node:sqlite';
import { jsPDF } from 'jspdf';
import { composerCv, controlerCv, controlerTexte, nomCv, periode, prioritairesOffre, puces, texteProfil, trierPuces, validerDocument } from '../lib/cv.mjs';
import { cvPdf } from '../lib/cv-pdf.mjs';
import { ouvrirBase, VERSION_SCHEMA } from '../lib/offres.mjs';

const dossierTemp = () => mkdtempSync(join(tmpdir(), 'suivi-cv-'));
const aPdftotext = (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();

const ETAT = {
  profil: { accroche: 'Formateur et développeur web', resume: 'Formateur depuis 2017 chez ProjetX.', accroches: { comptabilite: 'Comptable confirmé' }, contact: { nom: 'Camille Exemple', email: 'contact@example.com' } },
  experiences: [
    { id: 'x1', poste: 'Développeur web freelance', employeur: 'ProjetX', type: 'freelance', categorie: 'dev_web', debut: '2017-05', fin: '', description: 'Sites en Astro. Mois de début à préciser.', competences: ['c1'] },
    { id: 'x2', poste: 'Formateur', employeur: 'Plusieurs organismes', type: 'formateur', categorie: 'formateur_digital', debut: '2017-05', fin: '', description: 'Animation de formations.', competences: [] },
    { id: 'x3', poste: 'Formateur React', employeur: 'ClientABC', type: 'formateur', categorie: 'formateur_digital', debut: '2025-10', fin: '2026-06', description: 'Titre DWWM.', competences: [] },
    { id: 'x4', poste: 'Consultant', employeur: 'ClientABC', type: 'formateur', categorie: 'formateur_digital', debut: '2021-01', fin: '2026-04', description: 'Formations PAO et SEO. Secteurs : immobilier.', competences: [] },
    { id: 'x5', poste: 'Consultant', employeur: 'ClientDEF', type: 'formateur', categorie: 'formateur_digital', debut: '2017-05', fin: '2020-12', description: 'Formations PAO.', competences: [] },
    { id: 'x6', poste: 'Comptable', employeur: 'ClientGHI', type: 'salarie', categorie: 'comptabilite', debut: '2006-01', fin: '2015-12', description: 'Préparation du bilan. Paie.', competences: ['c3'] },
  ],
  formations: [
    { id: 'f1', type: 'titre_pro', titre: 'Développeur web (titre pro)', etablissement: 'ProjetX', debut: '', fin: '', note: '' },
    { id: 'f2', type: 'diplome', titre: 'DUT GEA', etablissement: 'IUT Fictif', debut: '', fin: '2002', note: '' },
    { id: 'f3', type: 'diplome', titre: 'Titre Formateur', etablissement: '', debut: '2026', fin: '', note: 'Année à préciser' },
  ],
  competences: [
    { id: 'c1', domaine: 'Développement web', competence: 'React', enseigner: 4, executer: 4 },
    { id: 'c2', domaine: 'Développement web', competence: 'Angular', enseigner: 1, executer: 1 },
    { id: 'c3', domaine: 'Gestion et comptabilité (2006-2015)', competence: 'Paie', enseigner: 3, executer: 4 },
    { id: 'c4', domaine: 'Pédagogie', competence: 'Moodle', enseigner: 4, executer: 4 },
    { id: 'c5', domaine: 'Langues', competence: 'Anglais', note: 'Avancé' },
    { id: 'c6', domaine: 'Langues', competence: 'Espagnol', note: 'Plus hésitant' },
  ],
};

const REFERENCE = `CAMILLE EXEMPLE
Développeur web freelance  2017 – 2026  ProjetX
Formateur  Plusieurs organismes  Missions : ClientABC, Formateur React (octobre 2025 à juin 2026)
Consultant  Via ClientABC (2021-2026) et ClientDEF (2017-2020)
Comptable  2006 – 2015  ClientGHI
Formation : DUT GEA, IUT Fictif (2002) ; Titre Formateur, en cours (2026)
Formateur depuis 2017 chez ProjetX. Sites en Astro.`;

test('periode et puces : dates lisibles, indications de travail retirées', () => {
  assert.equal(periode('2017-05', ''), 'Depuis 2017');
  assert.equal(periode('2006-01', '2015-12'), '2006 à 2015');
  assert.equal(periode('2026-03', '2026-04'), 'mars à avril 2026');
  assert.deepEqual(puces('Sites en Astro. Mois de début à préciser. Paie.'), ['Sites en Astro', 'Paie']);
});

test('composerCv général façon LinkedIn : une ligne par expérience, antéchronologique, parapluie retiré, titres enseignés hors diplômes', () => {
  const d = composerCv(ETAT);
  assert.deepEqual(d.experiences.map(x => `${x.poste} / ${x.employeur}`), ['Développeur web freelance / ProjetX', 'Formateur React / ClientABC', 'Consultant / ClientABC', 'Consultant / ClientDEF', 'Comptable / ClientGHI']);
  assert.ok(d.experiences.every(x => x.missions.length === 0 && x.ids.length === 1));
  assert.deepEqual(d.experiences[2].puces, ['Formations PAO et SEO', 'Secteurs : immobilier']);
  assert.deepEqual(d.formation.map(f => f.titre), ['Titre Formateur', 'DUT GEA']);
  assert.equal(d.formation[0].note, '');
  assert.deepEqual(d.titres_prepares, []);
  const metier = composerCv(ETAT, { cible: 'metier', categorie: 'formateur_digital' });
  assert.deepEqual(metier.experiences.find(x => x.poste === 'Formateur').missions.map(m => m.employeur), ['ClientABC']);
  assert.equal(metier.experiences.find(x => x.poste === 'Consultant').employeur, 'ClientABC (2021 à 2026), ClientDEF (2017 à 2020)');
  assert.ok(!d.competences.flatMap(c => c.liste).includes('Angular'));
  assert.equal(d.competences.find(c => c.liste.includes('Paie')).domaine, 'Gestion et comptabilité');
  assert.deepEqual(d.langues, [{ langue: 'Anglais', niveau: 'Avancé' }, { langue: 'Espagnol', niveau: '' }]);
  assert.equal(d.accroche, 'Formateur et développeur web');
  assert.equal(nomCv(d, new Date('2026-10-22')), 'CV_Camille_Exemple_2026-10');
});

test('composerCv ne produit aucun texte absent des données d\'entrée', () => {
  const source = JSON.stringify(ETAT);
  for (const [cible, categorie] of [['general', ''], ['metier', 'comptabilite'], ['metier', 'formateur_digital']]) {
    const d = composerCv(ETAT, { cible, categorie });
    for (const x of d.experiences) for (const t of [x.poste, ...x.puces]) assert.ok(source.includes(t), `${t} inventé`);
    for (const f of d.formation) assert.ok(source.includes(f.titre));
    for (const c of d.competences) for (const t of c.liste) assert.ok(source.includes(t));
  }
});

test('composerCv : titre sous le nom propre à la cible, métier par défaut, coordonnées pour le général', () => {
  const etat = { ...ETAT, profil: { ...ETAT.profil, contact: { ...ETAT.profil.contact, titre: 'Titre commun' }, titres: { comptabilite: 'Titre comptable' } } };
  assert.equal(composerCv(etat, { cible: 'metier', categorie: 'comptabilite' }).entete.titre, 'Titre comptable');
  assert.equal(composerCv(etat, { cible: 'metier', categorie: 'dev_web' }).entete.titre, 'Développeur web');
  assert.equal(composerCv(etat, { cible: 'general' }).entete.titre, 'Titre commun');
});

test('composerCv par métier : compétences du métier et transversales seulement, le design n\'apparaît pas pour la comptabilité', () => {
  const c = (id, domaine, competence, n = 4) => ({ id, domaine, competence, enseigner: n, executer: n });
  const etat = { ...ETAT, competences: [c('1', 'Design', 'Figma'), c('2', 'Gestion et comptabilité', 'Paie', 2), c('3', 'Gestion et comptabilité', 'Excel'), c('4', 'Gestion de projet', 'Notion'), c('5', 'Gestion de projet', 'Tableaux de bord, KPI'), c('6', 'Développement web', 'React')] };
  const compta = composerCv(etat, { cible: 'metier', categorie: 'comptabilite' });
  assert.deepEqual(compta.competences.map(x => x.domaine), ['Gestion et comptabilité', 'Gestion de projet']);
  assert.deepEqual(compta.competences[0].liste.sort(), ['Excel', 'Paie']);
  assert.deepEqual(compta.competences[1].liste, ['Tableaux de bord, KPI']);
  // NOTE: une compétence trouvée dans l'offre reste affichée même hors des domaines du métier
  const offre = composerCv(etat, { cible: 'offre', categorie: 'comptabilite', prioritaires: ['1'], offre: { id_offre: 'o1' } });
  assert.ok(offre.competences.some(x => x.liste.includes('Figma')));
  assert.equal(composerCv(etat, { cible: 'general' }).competences.length, 4);
});

test('composerCv : résumé propre à la cible, repli sur le résumé du Profil', () => {
  const etat = { ...ETAT, profil: { ...ETAT.profil, resumes: { comptabilite: 'Résumé comptable' } } };
  assert.equal(composerCv(etat, { cible: 'metier', categorie: 'comptabilite' }).resume, 'Résumé comptable');
  assert.equal(composerCv(etat, { cible: 'metier', categorie: 'dev_web' }).resume, ETAT.profil.resume);
  assert.equal(composerCv(etat, { cible: 'general' }).resume, ETAT.profil.resume);
});

test('composerCv par métier : expériences du métier complètes, les autres condensées sans période supprimée', () => {
  const d = composerCv(ETAT, { cible: 'metier', categorie: 'comptabilite' });
  assert.equal(d.experiences.length, 4);
  assert.deepEqual(d.experiences.filter(x => !x.condensee).map(x => x.poste), ['Comptable']);
  assert.ok(d.experiences.filter(x => x.condensee).every(x => x.puces.length <= 2 && x.periode));
  assert.equal(d.accroche, 'Comptable confirmé');
  assert.equal(d.competences[0].domaine, 'Gestion et comptabilité');
  const f = composerCv(ETAT, { cible: 'metier', categorie: 'formateur_digital' });
  assert.deepEqual(f.titres_prepares, ['Développeur web']);
  assert.ok(f.formation.every(x => x.titre !== 'Développeur web (titre pro)'));
  assert.throws(() => composerCv(ETAT, { cible: 'metier', categorie: 'boulangerie' }), /Métier inconnu/);
});

test('composerCv pour une offre : compétences trouvées en tête, offre sans annonce ciblée par sa catégorie', () => {
  const prio = prioritairesOffre(ETAT.competences, { titre: 'Formateur Moodle', annonce: '' });
  assert.deepEqual(prio, ['c4']);
  const d = composerCv(ETAT, { cible: 'offre', categorie: 'dev_web', prioritaires: prio, offre: { id_offre: 'o1', titre: 'Formateur Moodle', entreprise: 'ClientABC' } });
  assert.equal(d.libelle, 'Formateur Moodle, ClientABC');
  assert.equal(d.competences[0].liste[0], 'React');
  assert.ok(!d.experiences.find(x => x.poste === 'Développeur web freelance').condensee);
  const sansAnnonce = composerCv(ETAT, { cible: 'offre', categorie: 'comptabilite', prioritaires: prioritairesOffre(ETAT.competences, { titre: '', annonce: '' }), offre: { id_offre: 'o2' } });
  assert.deepEqual(sansAnnonce.experiences.filter(x => !x.condensee).map(x => x.poste), ['Comptable']);
});

test('controlerCv : ok, partiel et absent, année absente détectée, sans référence le contrôle est indisponible sans bloquer', () => {
  const d = composerCv(ETAT);
  const ok = controlerCv(d, REFERENCE, texteProfil(ETAT));
  assert.equal(ok.disponible, true);
  const absent = ok.faits.filter(f => f.statut === 'absent').map(f => f.valeur);
  assert.ok(!absent.includes('2002') && !absent.includes('ClientGHI'), absent.join());
  const faux = structuredClone(d);
  faux.formation[1].annees = '2003';
  faux.experiences[3].employeur = 'EntrepriseInventee';
  const ko = controlerCv(faux, REFERENCE);
  assert.ok(ko.faits.some(f => f.valeur === '2003' && f.statut === 'absent'));
  assert.ok(ko.faits.some(f => f.valeur === 'EntrepriseInventee' && f.statut === 'absent'));
  assert.ok(ko.ecarts >= 2);
  assert.deepEqual(controlerCv(d, ''), { disponible: false, faits: [], ecarts: 0, avertissements: 0 });
});

test('controlerTexte : une accroche avec une année ou un employeur inventés est à vérifier', () => {
  const r = controlerTexte('Je forme chez ProjetX depuis 2017, et chez Inventix depuis 2012 avec Moodle.', REFERENCE, texteProfil(ETAT));
  const statut = f => r.find(x => x.fait === f)?.statut;
  assert.equal(statut('ProjetX'), 'ok');
  assert.equal(statut('2017'), 'ok');
  assert.equal(statut('Inventix'), 'absent');
  assert.equal(statut('2012'), 'absent');
  assert.equal(statut('Moodle'), 'profil');
});

test('validerDocument et cvPdf : nom obligatoire, champ mal formé refusé, PDF valide', async () => {
  const d = composerCv(ETAT);
  assert.throws(() => validerDocument({ ...d, entete: { nom: '' } }), /Nom absent/);
  assert.throws(() => validerDocument({ ...d, experiences: 'non' }), /tableau/);
  assert.throws(() => validerDocument({ ...d, cible: 'x' }), /cible/);
  const pdf = await cvPdf(validerDocument(d));
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), '%PDF-');
});

test('migration v8 : tables cv_references et cv_versions créées sur une base v7', () => {
  const dir = dossierTemp();
  try {
    const chemin = join(dir, 'suivi.db');
    ouvrirBase(chemin).close();
    const brute = new DatabaseSync(chemin);
    brute.exec('DROP TABLE cv_references; DROP TABLE cv_versions; PRAGMA user_version = 7');
    brute.close();
    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, VERSION_SCHEMA);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('cv_references', 'cv_versions')").get()?.n, 2);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const pdfFictif = texte => {
  const d = new jsPDF();
  d.setFontSize(9);
  d.text(d.splitTextToSize(texte, 180), 10, 10);
  return Buffer.from(d.output('arraybuffer'));
};

test('routes du CV : référence (PDF, refus et secours), composition sans écriture, PDF et version journalisée', { skip: !aPdftotext && 'pdftotext absent' }, async () => {
  const dir = dossierTemp();
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps, type = 'application/json') => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': type } : {}, body: corps === undefined ? undefined : type === 'application/json' ? JSON.stringify(corps) : corps });
    return { status: r.status, data: r.headers.get('content-type')?.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), entetes: r.headers };
  };
  try {
    assert.equal((await appel('POST', '/api/competences', { id: 'c1', domaine: 'Développement web', competence: 'React', enseigner: 4, executer: 4 })).status, 201);
    assert.equal((await appel('POST', '/api/experiences', { poste: 'Comptable', employeur: 'ClientGHI', categorie: 'comptabilite', debut: '2006-01', fin: '2015-12', description: 'Préparation du bilan.' })).status, 201);
    assert.equal((await appel('PUT', '/api/state', { profil: { accroche: 'Comptable', resume: '', contact: { nom: 'Camille Exemple' }, accroches: { comptabilite: 'Comptable confirmé' } } })).status, 200);
    assert.equal((await appel('PUT', '/api/state', { profil: { contact: { inconnu: 'x' } } })).status, 400);
    // NOTE: variantes nommées par champ et par cible, conservées par un envoi qui ne les mentionne pas
    const variantes = { accroches: { comptabilite: [{ nom: 'Sobre', texte: 'Comptable confirmé' }] } };
    assert.equal((await appel('PUT', '/api/state', { profil: { variantes } })).status, 200);
    assert.equal((await appel('PUT', '/api/state', { profil: { accroche: 'Comptable' } })).status, 200);
    assert.deepEqual((await appel('GET', '/api/state')).data.profil.variantes.accroches.comptabilite, [{ nom: 'Sobre', texte: 'Comptable confirmé' }]);
    assert.equal((await appel('PUT', '/api/state', { profil: { variantes: { accroches: { inconnue: [] } } } })).status, 400);
    assert.equal((await appel('PUT', '/api/state', { profil: { variantes: { accroches: { general: [{ nom: '', texte: 'x' }] } } } })).status, 400);

    // NOTE: sans référence : contrôle indisponible, export possible
    const sans = await appel('POST', '/api/cv/composer', { cible: 'metier', categorie: 'comptabilite' });
    assert.equal(sans.status, 200);
    assert.equal(sans.data.controle.disponible, false);
    assert.equal(sans.data.reference, null);
    assert.equal(sans.data.document.accroche, 'Comptable confirmé');

    assert.equal((await appel('POST', '/api/cv/reference', 'pas un pdf', 'application/pdf')).status, 400);
    const ref = await appel('POST', '/api/cv/reference?fichier=reference.pdf', pdfFictif(REFERENCE.repeat(3)), 'application/pdf');
    assert.equal(ref.status, 201, JSON.stringify(ref.data));
    assert.equal(ref.data.reference.fichier, 'reference.pdf');
    // NOTE: un PDF sans texte est refusé et la référence précédente reste en place
    assert.equal((await appel('POST', '/api/cv/reference', pdfFictif(' '), 'application/pdf')).status, 400);
    assert.equal((await appel('GET', '/api/cv/reference')).data.reference.id, ref.data.reference.id);

    const avec = await appel('POST', '/api/cv/composer', { cible: 'general' });
    assert.equal(avec.data.controle.disponible, true);
    assert.equal(avec.data.nom.startsWith('CV_Camille_Exemple_'), true);
    assert.equal((await appel('GET', '/api/cv/versions')).data.length, 0);
    assert.equal((await appel('POST', '/api/cv/composer', { cible: 'offre', offre_id: 'inconnue' })).status, 404);
    assert.equal((await appel('POST', '/api/cv/composer', { cible: 'x' })).status, 400);

    // NOTE: choix du modèle (métier, prioritaires) validés côté serveur : offre ajoutée dans la base du serveur de test
    const base = new DatabaseSync(join(dir, 'suivi.db'));
    base.prepare("INSERT INTO offres (id_offre, titre, categorie, departement, date_detection, annonce) VALUES ('o9', 'Comptable', 'comptabilite', '83', date('now'), 'Poste de comptable.')").run();
    base.close();
    assert.equal((await appel('POST', '/api/cv/composer', { cible: 'offre', offre_id: 'o9', metier: 'inconnu' })).status, 400);
    assert.equal((await appel('POST', '/api/cv/composer', { cible: 'offre', offre_id: 'o9', prioritaires: 'c1' })).status, 400);
    assert.equal((await appel('POST', '/api/cv/composer', { cible: 'offre', offre_id: 'o9', prioritaires: [1] })).status, 400);
    assert.equal((await appel('POST', '/api/cv/composer', { cible: 'general', prioritaires: null })).status, 400);
    const general = await appel('POST', '/api/cv/composer', { cible: 'offre', offre_id: 'o9', metier: 'general', prioritaires: ['c1'] });
    assert.equal(general.status, 200);
    assert.equal(general.data.document.categorie, '');
    const metier = await appel('POST', '/api/cv/composer', { cible: 'offre', offre_id: 'o9' });
    assert.equal(metier.data.document.categorie, 'comptabilite');

    const pdf = await appel('POST', '/api/cv/pdf', { document: avec.data.document });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.data.subarray(0, 5).toString(), '%PDF-');
    const idVersion = pdf.entetes.get('x-cv-version');
    assert.ok(idVersion);
    assert.equal((await appel('POST', '/api/cv/pdf', { document: { ...avec.data.document, entete: {} } })).status, 400);
    assert.equal((await appel('POST', '/api/cv/pdf', { document: avec.data.document, candidature_id: 'inconnue' })).status, 400);

    const versions = (await appel('GET', '/api/cv/versions')).data;
    assert.equal(versions.length, 1);
    assert.equal((await appel('GET', `/api/cv/versions/${idVersion}`)).data.document.entete.nom, 'Camille Exemple');
    assert.equal((await appel('GET', `/api/cv/versions/${idVersion}/pdf`)).data.subarray(0, 5).toString(), '%PDF-');
    const etat = (await appel('GET', '/api/state')).data;
    assert.equal(etat.cvVersions.length, 1);
    assert.equal(etat.cvReference.fichier, 'reference.pdf');
    assert.ok(!('texte' in etat.cvReference));
    const journal = (await appel('GET', '/api/journal?entite=cv')).data;
    assert.ok(journal.some(e => e.action === 'creation'));
    assert.equal((await appel('DELETE', `/api/cv/versions/${idVersion}`)).status, 200);
    assert.equal((await appel('GET', `/api/cv/versions/${idVersion}`)).status, 404);
    // NOTE: la candidature créée ensuite pour l'offre reprend le CV composé pour elle
    const pdfOffre = await appel('POST', '/api/cv/pdf', { document: metier.data.document });
    assert.equal(pdfOffre.status, 200);
    const idOffreVersion = pdfOffre.entetes.get('x-cv-version');
    assert.equal((await appel('POST', '/api/candidatures', { id: 'ft-o9', entreprise: 'ClientABC', poste: 'Comptable', statut: 'a_faire', offre_id: 'o9' })).status, 201);
    const lies = (await appel('GET', '/api/cv/versions')).data;
    assert.equal(lies.find(v => v.id === idOffreVersion).candidature_id, 'ft-o9');
  } finally {
    proc.kill();
    await new Promise(r => proc.once('exit', r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('composerCv : le niveau qui décide dépend de la cible (Enseigner pour le formateur, Exécuter pour les métiers opérationnels)', () => {
  const c = (id, domaine, competence, enseigner, executer) => ({ id, domaine, competence, enseigner, executer });
  const etat = { ...ETAT, competences: [c('1', 'Développement web', 'Docker', 1, 5), c('2', 'Développement web', 'Pédagogie du code', 5, 1), c('3', 'Pédagogie', 'Ateliers', 5, 1), c('4', 'Pédagogie', 'Docker pour formateurs', 1, 5)] };
  const noms = d => d.competences.flatMap(x => x.liste);
  const formateur = noms(composerCv(etat, { cible: 'metier', categorie: 'formateur_digital' }));
  assert.ok(formateur.includes('Pédagogie du code') && formateur.includes('Ateliers'));
  assert.ok(!formateur.includes('Docker') && !formateur.includes('Docker pour formateurs'));
  const dev = noms(composerCv(etat, { cible: 'metier', categorie: 'dev_web' }));
  assert.ok(dev.includes('Docker') && !dev.includes('Pédagogie du code'));
  // NOTE: CV général : le plus haut des deux, comportement inchangé
  assert.equal(noms(composerCv(etat, { cible: 'general' })).length, 4);
});

test('composerCv : le nombre de projets départage et se montre à partir de 2, sans jamais filtrer ni exposer la part de l\'IA', () => {
  const c = (id, competence) => ({ id, domaine: 'Développement web', competence, enseigner: 4, executer: 4 });
  const etat = {
    ...ETAT, competences: [c('1', 'Vue'), c('2', 'React'), c('3', 'Astro'), c('4', 'Paie'), c('5', 'Encadrement (équipe)')],
    projets: [
      { id: 'p1', nom: 'PortfolioZ', ia: 'deleguee', competences: ['2', '3', '5'] },
      { id: 'p2', nom: 'PortfolioW', ia: 'assistee', competences: ['2', '5'] },
    ],
  };
  const liste = composerCv(etat, { cible: 'metier', categorie: 'dev_web' }).competences[0].liste;
  // React (2 projets) d'abord, Astro (1 projet) avant Vue et Paie, sans mention pour un seul projet, aucune compétence sans projet écartée
  assert.deepEqual(liste, ['React (2 projets)', 'Encadrement (équipe, 2 projets)', 'Astro', 'Vue', 'Paie']);
  const sortie = JSON.stringify(composerCv(etat, { cible: 'general' }));
  assert.ok(!/deleguee|assistee|"ia"/.test(sortie));
  assert.ok(!sortie.includes('PortfolioZ'));
});

test('composerCv : le CV général garde 5 domaines, 6 preuves de projets au plus et allège les longues parenthèses', () => {
  const domaines = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];
  const competences = domaines.flatMap((d, k) => [
    { id: `a${k}`, domaine: d, competence: `Alpha${k}`, enseigner: 5 - (k > 4 ? 2 : 0), executer: 5 - (k > 4 ? 2 : 0) },
    { id: `b${k}`, domaine: d, competence: `Beta${k} (une très longue liste de technologies entre parenthèses)`, enseigner: 4, executer: 4 },
  ]);
  const projets = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, nom: `PortfolioQ${i}`, ia: '', competences: competences.map(c => c.id) }));
  const cv = composerCv({ ...ETAT, competences, projets }, { cible: 'general' });
  assert.equal(cv.competences.length, 5);
  assert.ok(!cv.competences.some(c => ['D6', 'D7'].includes(c.domaine)));
  const liste = cv.competences.flatMap(c => c.liste);
  assert.equal(liste.filter(x => /projets\)$/.test(x)).length, 6);
  assert.ok(liste.every(x => !x.includes('technologies')));
});

test('trierPuces : les puces du métier visé passent en tête, aucune puce figée, ordre du Profil gardé dans chaque groupe', () => {
  const l = ['ClientABC, activité freelance', 'Applications React et Node.js', 'Maquettes UX/UI sous Figma', 'Sites clients en maintenance', 'Chartes graphiques'];
  assert.deepEqual(trierPuces(l, 'web_design'), ['Maquettes UX/UI sous Figma', 'Chartes graphiques', 'ClientABC, activité freelance', 'Applications React et Node.js', 'Sites clients en maintenance']);
  assert.deepEqual(trierPuces(l, ''), l);
  assert.deepEqual(trierPuces(l.slice(0, 2), 'web_design'), l.slice(0, 2));
  assert.deepEqual(trierPuces(['Développement sur mesure : PHP, MERN', 'Maquettes sous Figma'], 'web_design'), ['Maquettes sous Figma', 'Développement sur mesure : PHP, MERN']);
});

test('composerCv par métier : une expérience d\'un autre métier riche en puces du métier visé n\'est pas condensée', () => {
  const etat = { profil: { contact: { nom: 'Prénom Nom' } }, experiences: [
    { id: 'a', poste: 'Développeur freelance', type: 'freelance', categorie: 'dev_web', debut: '2017-05', fin: '', description: 'ClientABC. Applications React. Maquettes UX/UI sous Figma. Chartes graphiques. Design systems. Maintenance. Hébergement. Support.' },
    { id: 'b', poste: 'Comptable', type: 'salarie', categorie: 'comptabilite', debut: '2006-01', fin: '2015-12', description: 'ProjetX. Saisie. Bilan. TVA. Paie.' },
  ] };
  const d = composerCv(etat, { cible: 'metier', categorie: 'web_design' });
  const [dev, compta] = d.experiences;
  assert.equal(dev.condensee, false);
  assert.deepEqual(dev.puces, ['Maquettes UX/UI sous Figma', 'Chartes graphiques', 'Design systems', 'ClientABC', 'Applications React']);
  assert.equal(compta.condensee, true);
});

test('intitulés par métier : validés, enregistrés par l\'API, lus dans l\'état, repris par le CV du métier visé', async () => {
  const dir = dossierTemp();
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const cree = await appel('POST', '/api/experiences', { poste: 'Développeur freelance', categorie: 'dev_web', debut: '2017-05', description: 'ClientABC. Maquettes sous Figma.', intitules: { web_design: ' Web designer freelance ' } });
    assert.equal(cree.status, 201);
    assert.deepEqual(cree.data.intitules, { web_design: 'Web designer freelance' });
    const id = cree.data.id;
    assert.equal((await appel('PATCH', `/api/experiences/${id}`, { intitules: { boulangerie: 'x' } })).status, 400);
    assert.equal((await appel('PATCH', `/api/experiences/${id}`, { intitules: { web_design: 'x'.repeat(121) } })).status, 400);
    // NOTE: même valeur renvoyée : aucune modification journalisée
    assert.equal((await appel('PATCH', `/api/experiences/${id}`, { intitules: { web_design: 'Web designer freelance' } })).status, 200);
    const journal = (await appel('GET', '/api/journal')).data;
    const lignes = (journal.evenements ?? journal).filter(e => e.entite_id === id);
    assert.ok(lignes.every(e => !(e.changements ?? []).some(c => c.champ === 'intitules')));
    // NOTE: l'interface envoie l'objet complet par PATCH (différence avec l'état chargé)
    assert.equal((await appel('PATCH', `/api/experiences/${id}`, { intitules: { dev_web: 'Développeur fullstack', web_design: 'Web designer freelance' } })).status, 200);
    assert.deepEqual((await appel('GET', '/api/state')).data.experiences.find(e => e.id === id).intitules, { web_design: 'Web designer freelance', dev_web: 'Développeur fullstack' });
    const cv = c => appel('POST', '/api/cv/composer', { cible: c ? 'metier' : 'general', categorie: c }).then(r => (r.data.document ?? r.data).experiences[0].poste);
    assert.equal(await cv('web_design'), 'Web designer freelance');
    assert.equal(await cv('comptabilite'), 'Développeur freelance');
    assert.equal(await cv(''), 'Développeur freelance');
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('composerCv : intitulé lu aussi en JSON brut, puces de l\'offre gardées, première puce hors du compte, intitulé du Profil non signalé comme écart', () => {
  const base = { profil: { contact: { nom: 'Prénom Nom' } }, competences: [{ id: 'k1', domaine: 'Développement web', competence: 'React (hooks)', executer: 4 }] };
  // NOTE: bin/cv.mjs (secours) passe la ligne SQLite telle quelle, intitules en texte JSON
  const brut = composerCv({ ...base, experiences: [{ id: 'a', poste: 'Développeur freelance', categorie: 'dev_web', debut: '2017-05', fin: '', description: 'ClientABC.', intitules: '{"web_design":"Web designer freelance"}' }] }, { cible: 'metier', categorie: 'web_design' });
  assert.equal(brut.experiences[0].poste, 'Web designer freelance');
  const offre = composerCv({ ...base, experiences: [{ id: 'a', poste: 'Développeur freelance', type: 'freelance', categorie: 'dev_web', debut: '2017-05', fin: '', competences: ['k1'], description: 'ClientABC. Hébergement. Support. Maintenance. Applications React.' }] }, { cible: 'offre', categorie: 'web_design', prioritaires: ['k1'] });
  assert.deepEqual(offre.experiences[0].puces, ['Applications React', 'ClientABC', 'Hébergement']);
  const tete = composerCv({ ...base, experiences: [{ id: 'a', poste: 'Développeur freelance', categorie: 'dev_web', debut: '2017-05', fin: '', description: 'Maquettes Figma. Chartes graphiques. Design systems. Logos. Hébergement. Support. Maintenance.' }] }, { cible: 'metier', categorie: 'web_design' });
  assert.deepEqual(tete.experiences[0].puces, ['Maquettes Figma', 'Chartes graphiques', 'Design systems', 'Logos', 'Hébergement', 'Support']);
  const etat = { ...base, experiences: [{ id: 'a', poste: 'Développeur freelance', categorie: 'dev_web', debut: '2017-05', fin: '', description: 'ClientABC.', intitules: { web_design: 'Web designer freelance' } }] };
  const c = controlerCv(brut, 'Développeur freelance ClientABC 2017', texteProfil(etat));
  assert.equal(c.faits.find(f => f.valeur === 'Web designer freelance')?.statut, 'profil');
});
