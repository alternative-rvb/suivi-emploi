// Tests du parcours du Profil (ligne 88) : migration v7, années par métier, note des offres, lecture de l'export LinkedIn, routes du serveur.
// Le serveur est lancé sur une copie dans un dossier temporaire, sans .env (aucun appel réseau, la synchro échoue en configuration).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveurTemporaire } from './serveur-temporaire.mjs';
import { DatabaseSync } from 'node:sqlite';
import { lierMatieres, ouvrirBase, VERSION_SCHEMA } from '../lib/offres.mjs';
import { anneesParCategorie } from '../lib/parcours.mjs';
import { construireProfil, noter } from '../lib/analyse/questions.mjs';
import { lireExportLinkedin, moisLinkedin, proposerImport } from '../lib/linkedin.mjs';

const dossierTemp = () => mkdtempSync(join(tmpdir(), 'suivi-parcours-'));

test('migration v7 : compétences et titres du kv passent dans leurs tables, ids et ordre conservés, copie faite, rejouable', () => {
  const dir = dossierTemp();
  try {
    const chemin = join(dir, 'suivi.db');
    ouvrirBase(chemin).close();
    // NOTE: base remise à l'état v6, avec les anciennes clés kv
    const brute = new DatabaseSync(chemin);
    const skills = [
      { id: 'c1', domaine: 'Comptabilité', competence: 'Saisie', enseigner: 5, executer: 4, note: '' },
      { id: 'c2', domaine: 'Langues', competence: 'Anglais', enseigner: null, executer: 3, note: 'B2', valide: true },
    ];
    const titres = [{ id: 't1', titre: 'Titre pro ProjetX', etablissement: 'ClientABC', annees: '2020', matieres: 'Paie', note: '' }];
    brute.prepare('INSERT INTO kv (cle, valeur) VALUES (?, ?), (?, ?)').run('skills', JSON.stringify(skills), 'titres', JSON.stringify(titres));
    brute.exec('PRAGMA user_version = 6');
    brute.close();

    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    const comp = db.prepare('SELECT * FROM competences ORDER BY ordre').all();
    assert.deepEqual(comp.map(c => [c.id, c.ordre, c.enseigner, c.valide]), [['c1', 0, 5, 0], ['c2', 1, null, 1]]);
    const form = db.prepare('SELECT * FROM formations').all();
    assert.equal(form.length, 1);
    assert.equal(form[0].type, 'titre_pro');
    assert.equal(form[0].matieres, 'Paie');
    assert.deepEqual([form[0].debut, form[0].fin], ['', '2020']);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM kv WHERE cle IN ('skills', 'titres')").get().n, 0);
    db.close();
    assert.ok(readdirSync(join(dir, 'data', 'backups')).some(f => f.startsWith('suivi-avant-schema-v')));

    const encore = ouvrirBase(chemin);
    assert.equal(encore.prepare('SELECT COUNT(*) AS n FROM competences').get().n, 2);
    encore.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('experience_competences : la base refuse un lien vers une ligne absente et supprime les liens en cascade', () => {
  const db = ouvrirBase(':memory:');
  db.exec("INSERT INTO competences (id, competence) VALUES ('c1', 'Saisie'); INSERT INTO experiences (id, poste) VALUES ('x1', 'Comptable')");
  db.exec("INSERT INTO experience_competences VALUES ('x1', 'c1')");
  assert.throws(() => db.exec("INSERT INTO experience_competences VALUES ('x1', 'absente')"), /FOREIGN KEY/);
  db.exec("DELETE FROM competences WHERE id = 'c1'");
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM experience_competences').get().n, 0);
  db.exec("INSERT INTO competences (id, competence) VALUES ('c2', 'Paie'); INSERT INTO experience_competences VALUES ('x1', 'c2')");
  db.exec("DELETE FROM experiences WHERE id = 'x1'");
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM experience_competences').get().n, 0);
  db.close();
});

test('lierMatieres : une seule compétence candidate exigée, le reste à reclasser', () => {
  const comps = [
    { id: 'h', competence: 'HTML5' }, { id: 'c', competence: 'CSS3, responsive design' }, { id: 't', competence: 'Tailwind CSS' },
    { id: 'w1', competence: 'WordPress Elementor' }, { id: 'w2', competence: 'WordPress dev' }, { id: 'b', competence: 'E-mailing, CRM (Brevo)' },
  ];
  const r = lierMatieres('HTML, CSS, WordPress, Brevo (ex-Sendinblue), Suite Adobe, html', comps);
  assert.deepEqual(r.ids, ['h', 'c', 'b']);
  assert.deepEqual(r.reste, ['WordPress', 'Suite Adobe']);
});

test('migration v9 : matières rattachées aux compétences, reste conservé, copie faite', () => {
  const dir = dossierTemp();
  try {
    const chemin = join(dir, 'suivi.db');
    ouvrirBase(chemin).close();
    const brute = new DatabaseSync(chemin);
    brute.exec("INSERT INTO competences (id, competence) VALUES ('c1', 'Paie'), ('c2', 'Saisie comptable')");
    brute.exec("INSERT INTO formations (id, type, titre, matieres) VALUES ('t1', 'titre_pro', 'Titre pro ProjetX', 'Paie, Saisie, Fiscalité'), ('t2', 'titre_pro', 'Autre', '')");
    brute.exec('DELETE FROM formation_competences; PRAGMA user_version = 8');
    brute.close();

    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, VERSION_SCHEMA);
    assert.deepEqual(db.prepare("SELECT competence_id AS c FROM formation_competences WHERE formation_id = 't1' ORDER BY rowid").all().map(x => x.c), ['c1', 'c2']);
    assert.equal(db.prepare("SELECT matieres FROM formations WHERE id = 't1'").get().matieres, 'Fiscalité');
    db.close();
    assert.ok(readdirSync(join(dir, 'data', 'backups')).some(f => f.startsWith('suivi-avant-schema-v')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('anneesParCategorie : périodes qui se chevauchent comptées une fois, fin vide = mois en cours', () => {
  const quand = new Date('2026-10-15T12:00:00Z');
  const a = anneesParCategorie([
    { categorie: 'comptabilite', debut: '2010-01', fin: '2014-12' },
    { categorie: 'comptabilite', debut: '2013-01', fin: '2016-12' },
    { categorie: 'formateur_digital', debut: '2017-05', fin: '' },
    { categorie: 'dev_web', debut: '', fin: '2020-01' },
  ], quand);
  assert.equal(a.comptabilite, 7);
  assert.equal(a.formateur_digital, 9.5);
  assert.equal(a.dev_web, undefined);
});

test('noter : les années du parcours relèvent le seuil sans pénalité', () => {
  const r = { niveau: 'confirme', verifie: { experience: true }, experience_annees: 5, teletravail: 'inconnu' };
  const sans = noter(r);
  const avec = noter(r, { anneesProfil: 9 });
  assert.equal(sans.note, 50);
  assert.equal(avec.note, 60);
  assert.match(avec.details[0].libelle, /5 ans d'expérience demandés, 9 ans dans votre parcours/);
  assert.equal(avec.details[0].points, 0);
  assert.equal(noter(r, { anneesProfil: 4 }).note, 55);
});

test('construireProfil : les titres enseignés ne sont jamais présentés comme des diplômes obtenus', () => {
  const texte = construireProfil([], [{ titre: 'Titre ProjetX', type: 'titre_pro' }, { titre: 'Diplôme ClientABC', type: 'diplome' }]);
  assert.match(texte, /Diplômes et certifications obtenus : Diplôme ClientABC\n/);
  assert.match(texte, /Titres enseignés en tant que formateur \(non détenus\) : Titre ProjetX$/);
  assert.doesNotMatch(construireProfil([], [{ titre: 'Titre ProjetX', type: 'titre_pro' }]), /obtenus/);
});

test('moisLinkedin : formats anglais, français et numériques', () => {
  assert.equal(moisLinkedin('Jan 2020'), '2020-01');
  assert.equal(moisLinkedin('janv. 2019'), '2019-01');
  assert.equal(moisLinkedin('déc. 2018'), '2018-12');
  assert.equal(moisLinkedin('2021'), '2021-01');
  assert.equal(moisLinkedin('03/2022'), '2022-03');
  assert.equal(moisLinkedin(''), '');
  assert.equal(moisLinkedin('bientôt'), '');
});

// NOTE: ZIP fictif au format de l'export LinkedIn, créé avec la commande zip (données génériques)
function zipFictif(dir) {
  const src = join(dir, 'export');
  const fichiers = {
    'Profile.csv': 'First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary\nJean,Exemple,,1 rue X,01/01/1980,Comptable et formateur,"Résumé sur deux\nlignes, avec virgule"\n',
    'Positions.csv': 'Company Name,Title,Description,Location,Started On,Finished On\nClientABC,Comptable unique,Tenue des comptes,Villeneuve,Jan 2015,Dec 2019\nProjetX,Formateur web,,Marseille,mai 2020,\n',
    'Education.csv': 'School Name,Start Date,End Date,Notes,Degree Name,Activities\nÉcole Exemple,2008,2010,,BTS Comptabilité,\n',
    'Certifications.csv': 'Name,Url,Authority,Started On,Finished On,License Number\nCertification ProjetX,,Organisme ABC,Mar 2021,,\n',
    'Skills.csv': 'Name\nSaisie comptable\nWordPress\n',
    'Languages.csv': 'Name,Proficiency\nAnglais,Compétence professionnelle\n',
  };
  mkdirSync(join(src, 'Basic_LinkedInDataExport'), { recursive: true });
  for (const [nom, contenu] of Object.entries(fichiers)) writeFileSync(join(src, 'Basic_LinkedInDataExport', nom), contenu);
  const zip = join(dir, 'export.zip');
  execFileSync('zip', ['-qr', zip, 'Basic_LinkedInDataExport'], { cwd: src });
  return zip;
}

test('lireExportLinkedin : postes, formations, certifications, compétences et langues, sans adresse ni date de naissance', () => {
  const dir = dossierTemp();
  try {
    const lu = lireExportLinkedin(zipFictif(dir));
    assert.deepEqual(lu.profil, { accroche: 'Comptable et formateur', resume: 'Résumé sur deux\nlignes, avec virgule' });
    assert.ok(!JSON.stringify(lu).includes('1 rue X') && !JSON.stringify(lu).includes('1980'));
    assert.deepEqual(lu.experiences.map(x => [x.poste, x.employeur, x.debut, x.fin, x.categorie]), [
      ['Comptable unique', 'ClientABC', '2015-01', '2019-12', 'comptabilite'],
      ['Formateur web', 'ProjetX', '2020-05', '', 'formateur_digital'],
    ]);
    assert.deepEqual(lu.formations.map(f => [f.type, f.titre, f.etablissement, f.debut, f.fin]), [
      ['diplome', 'BTS Comptabilité', 'École Exemple', '2008', '2010'],
      ['certification', 'Certification ProjetX', 'Organisme ABC', '', '2021'],
    ]);
    assert.deepEqual(lu.competences.map(c => [c.domaine, c.competence, c.note]), [
      ['À classer (LinkedIn)', 'Saisie comptable', ''], ['À classer (LinkedIn)', 'WordPress', ''], ['Langues', 'Anglais', 'Compétence professionnelle'],
    ]);
    const p = proposerImport(lu, { competences: [{ competence: 'wordpress' }], formations: [], experiences: [{ poste: 'Comptable unique', employeur: 'ClientABC', debut: '2015-01' }] });
    assert.deepEqual(p.competences.map(c => c.present), [false, true, false]);
    assert.deepEqual(p.experiences.map(x => x.present), [true, false]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lireExportLinkedin : un fichier qui n\'est pas un ZIP est refusé avec un message clair', () => {
  const dir = dossierTemp();
  try {
    const faux = join(dir, 'faux.zip');
    writeFileSync(faux, 'pas un zip');
    assert.throws(() => lireExportLinkedin(faux), /ZIP/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('routes du parcours : CRUD, liens expérience-compétence, cascade, refus de l\'ancien format, import LinkedIn sans écriture', async () => {
  const dir = dossierTemp();
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps, type = 'application/json') => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': type } : {}, body: corps === undefined ? undefined : type === 'application/json' ? JSON.stringify(corps) : corps });
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal((await appel('POST', '/api/competences', { id: 'c1', domaine: 'Comptabilité', competence: 'Saisie', enseigner: 4, executer: 5 })).status, 201);
    assert.equal((await appel('POST', '/api/competences', { id: 'c2', competence: 'Paie' })).status, 201);
    assert.equal((await appel('POST', '/api/competences', { competence: 'X', enseigner: 9 })).status, 400);
    assert.equal((await appel('POST', '/api/competences', { id: 'c1', competence: 'Doublon' })).status, 409);

    const x = await appel('POST', '/api/experiences', { poste: 'Comptable', employeur: 'ClientABC', categorie: 'comptabilite', debut: '2015-01', fin: '2019-12', competences: ['c1', 'c2'] });
    assert.equal(x.status, 201);
    assert.deepEqual(x.data.competences, ['c1', 'c2']);
    assert.equal((await appel('POST', '/api/experiences', { poste: 'Y', competences: ['inconnue'] })).status, 400);
    assert.equal((await appel('POST', '/api/experiences', { poste: 'Y', debut: '2020-13' })).status, 400);
    assert.equal((await appel('POST', '/api/experiences', { poste: 'Y', debut: '2020-06', fin: '2019-01' })).status, 400);
    assert.equal((await appel('PATCH', `/api/experiences/${x.data.id}`, { fin: '2014-01' })).status, 400);
    // NOTE: filtre candidature_id ignoré sur une collection sans cette colonne (erreur 500 avant la ligne 115)
    assert.equal((await appel('GET', '/api/experiences?candidature_id=c1')).status, 200);
    assert.equal((await appel('PATCH', `/api/experiences/${x.data.id}`, { competences: ['c2'] })).data.competences.join(), 'c2');

    assert.equal((await appel('DELETE', '/api/competences/c2')).status, 200);
    assert.deepEqual((await appel('GET', `/api/experiences/${x.data.id}`)).data.competences, []);

    assert.equal((await appel('POST', '/api/formations', { titre: 'BTS', type: 'diplome' })).status, 201);
    assert.equal((await appel('POST', '/api/formations', { titre: 'BTS', type: 'licence' })).status, 400);
    // NOTE: compétences enseignées d'un titre (v9), retirées avec la compétence
    assert.equal((await appel('POST', '/api/formations', { titre: 'Titre pro', competences: ['c1', 'inconnue'] })).status, 400);
    assert.equal((await appel('POST', '/api/competences', { id: 'c3', competence: 'Bilan' })).status, 201);
    const tp = await appel('POST', '/api/formations', { titre: 'Titre pro', competences: ['c1', 'c3'] });
    assert.deepEqual(tp.data.competences, ['c1', 'c3']);
    assert.equal((await appel('DELETE', '/api/competences/c3')).status, 200);
    assert.deepEqual((await appel('GET', `/api/formations/${tp.data.id}`)).data.competences, ['c1']);

    assert.equal((await appel('PUT', '/api/state', { profil: { accroche: 'Comptable', resume: '' } })).status, 200);
    assert.equal((await appel('PUT', '/api/state', { profil: { accroche: 'A', age: 3 } })).status, 400);
    const perimee = await appel('PUT', '/api/state', { skills: [] });
    assert.equal(perimee.status, 400);
    assert.match(perimee.data.erreur, /rechargez la page/);

    const etat = (await appel('GET', '/api/state')).data;
    assert.equal(etat.profil.accroche, 'Comptable');
    assert.equal(etat.competences.length, 1);
    assert.equal(etat.formations.length, 2);
    assert.equal(etat.experiences.length, 1);
    assert.ok(!('skills' in etat) && !('titres' in etat));

    const zip = readFileSync(zipFictif(dir));
    const prop = await appel('POST', '/api/import/linkedin', zip, 'application/zip');
    assert.equal(prop.status, 200);
    assert.equal(prop.data.experiences.length, 2);
    assert.equal(prop.data.experiences.find(e => e.employeur === 'ClientABC').present, false);
    assert.equal((await appel('GET', '/api/experiences')).data.length, 1);
    assert.equal((await appel('POST', '/api/import/linkedin', 'pas un zip', 'application/zip')).status, 400);

    const journal = (await appel('GET', '/api/journal?entite=experience')).data;
    assert.ok(journal.some(e => e.action === 'creation') && journal.some(e => e.champ === 'competences'));
  } finally {
    proc.kill();
    await new Promise(r => proc.once('exit', r));
    rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(!existsSync(dir));
});

// ANCHOR: dates des formations (ligne 112, schéma v10)
test('lireAnnees et periodeFormation : anciens textes convertis, illisible conservé, affichage généré', async () => {
  const { lireAnnees, periodeFormation } = await import('../lib/periode.mjs');
  const cas = [
    ['2016', '', '2016', '', '2016'],
    ['2002 à 2004', '2002', '2004', '', '2002 à 2004'],
    ['En cours (2026)', '2026', '', '', 'En cours (depuis 2026)'],
    ['Octobre 2025 à juin 2026 (ProjetX)', '2025-10', '2026-06', 'ProjetX', 'Octobre 2025 à juin 2026'],
    ['Mars à avril 2026', '2026-03', '2026-04', '', 'Mars à avril 2026'],
  ];
  for (const [texte, debut, fin, reste, affiche] of cas) {
    const r = lireAnnees(texte);
    assert.deepEqual([r.debut, r.fin, r.reste], [debut, fin, reste], texte);
    assert.equal(periodeFormation(r), affiche, texte);
  }
  assert.deepEqual(lireAnnees('un jour'), { debut: '', fin: '', reste: 'un jour' });
  assert.equal(periodeFormation({ debut: '2020-13', fin: '' }), '');
});

test('migration v10 : annees devient debut et fin, la précision va dans l organisme vide, l illisible dans la remarque', () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-v10-'));
  try {
    const chemin = join(dir, 'suivi.db');
    ouvrirBase(chemin).close();
    const brute = new DatabaseSync(chemin);
    brute.exec('ALTER TABLE formations DROP COLUMN debut; ALTER TABLE formations DROP COLUMN fin');
    brute.exec("ALTER TABLE formations ADD COLUMN annees TEXT NOT NULL DEFAULT ''");
    const ins = brute.prepare('INSERT INTO formations (id, type, titre, etablissement, annees, note) VALUES (?, ?, ?, ?, ?, ?)');
    ins.run('a', 'diplome', 'Diplôme A', 'École X', '2002 à 2004', '');
    ins.run('b', 'titre_pro', 'Titre B', '', 'Octobre 2025 à juin 2026 (ProjetX)', '');
    ins.run('c', 'diplome', 'Diplôme C', '', 'en son temps', '');
    brute.exec('PRAGMA user_version = 9');
    brute.close();
    const db = ouvrirBase(chemin);
    assert.ok(!db.prepare('PRAGMA table_info(formations)').all().some(c => c.name === 'annees'));
    const l = Object.fromEntries(db.prepare('SELECT * FROM formations').all().map(f => [f.id, f]));
    assert.deepEqual([l.a.debut, l.a.fin, l.a.etablissement], ['2002', '2004', 'École X']);
    assert.deepEqual([l.b.debut, l.b.fin, l.b.etablissement], ['2025-10', '2026-06', 'ProjetX']);
    assert.deepEqual([l.c.debut, l.c.fin, l.c.note], ['', '', 'en son temps']);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
