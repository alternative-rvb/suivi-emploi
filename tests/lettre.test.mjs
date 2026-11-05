// ANCHOR: tests de la lettre de motivation (ligne 178) : matrice, contrôle (faits et méthode), brouillon du modèle, PDF, Word et routes.
// Faux fournisseur, base en mémoire ou serveur temporaire, aucun réseau.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { serveurTemporaire } from './serveur-temporaire.mjs';
import { compterMots, conseilsMethode, controlerLettre, lignesEntete, MATRICE_DEFAUT, STYLE_DEFAUT, anglesDuMetier, nomLettre, reprisesPrecedentes, validerStyle, texteLettre, validerLettre, validerMatrice } from '../lib/lettre.mjs';
import { codePostalVille, separerLieu } from '../lib/coordonnees.mjs';
import { texteSur } from '../lib/cv-pdf.mjs';
import { lettrePdf } from '../lib/lettre-pdf.mjs';
import { lettreDocx } from '../lib/docx.mjs';
import { infosImage } from '../lib/signature.mjs';
import { ouvrirBase } from '../lib/offres.mjs';
import { consigneLettre, faitsProfil, redigerLettre, validerBrouillon, viderMemoLettre } from '../lib/analyse/lettre.mjs';

const aUnzip = (() => { try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();

// NOTE: petite image PNG valide (4 x 2 pixels), construite ici pour ne versionner aucun fichier binaire
function png() {
  const morceau = (type, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(type), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
    return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const brut = Buffer.concat([0, 1].map(() => Buffer.concat([Buffer.from([0]), Buffer.alloc(12, 0x30)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), morceau('IHDR', ihdr), morceau('IDAT', deflateSync(brut)), morceau('IEND', Buffer.alloc(0))]);
}

const CORPS = 'Madame, Monsieur,\n\nVotre cabinet ClientABC renforce son pôle paie.\n\nJ\'ai géré la paie de 50 salariés sous Sage.\n\nJe vous propose un échange.';
const LETTRE = { entete: { nom: 'Camille Exemple', ville: 'Ville', email: 'contact@example.com' }, destinataire: 'ClientABC', lieu_date: 'Ville, le 1 janvier 2026', objet: 'Candidature au poste de comptable', texte: CORPS };

test('matrice : valeurs inconnues ramenées au défaut, longueur bornée, consignes et compétences bornées', () => {
  const m = validerMatrice({ ton: 'agressif', mots: 9000, competences: ['c1', 'c1', 3, 'c2'], blocs: { faible: { actif: true, consigne: '  reconversion  ' }, inconnu: { actif: true } } });
  assert.equal(m.ton, MATRICE_DEFAUT.ton);
  assert.equal(m.mots, 450);
  assert.deepEqual(m.competences, ['c1', 'c2']);
  assert.deepEqual(m.blocs.faible, { actif: true, consigne: 'reconversion' });
  assert.equal(m.blocs.vous.actif, true);
  assert.equal('inconnu' in m.blocs, false);
  assert.equal(validerMatrice(null).mots, 250);
});

test('document : nom et texte exigés, texte brut pour formulaire, nom de fichier sans accents', () => {
  assert.throws(() => validerLettre({ ...LETTRE, entete: {} }), /Nom absent/);
  assert.throws(() => validerLettre({ ...LETTRE, texte: '  ' }), /Lettre vide/);
  const d = validerLettre(LETTRE);
  // NOTE: texte pour formulaire : sans objet, signé du prénom et du nom
  assert.match(texteLettre(d, { avecEntete: false }), /^Madame, Monsieur,/);
  assert.doesNotMatch(texteLettre(d, { avecEntete: false }), /Objet :/);
  assert.ok(texteLettre(d, { avecEntete: false }).endsWith('\n\n' + d.entete.nom));
  assert.equal(nomLettre({ nom: 'Camille Dupont', entreprise: 'Société Générale', poste: 'Comptable unique' }, new Date('2026-10-25')), 'LM_Camille-Dupont_Societe-Generale_Comptable-unique_2026-10');
  // NOTE: lettre par métier : le nom de la personne et le métier, jamais « Generique » (le recruteur voit le nom du fichier)
  assert.equal(nomLettre({ nom: 'Camille Dupont', poste: 'Comptabilité' }, new Date('2026-10-25')), 'LM_Camille-Dupont_Comptabilite_2026-10');
  assert.equal(compterMots("J'ai géré la paie."), 4);
});

test('contrôle : faits de l\'annonce reconnus, civilités ignorées, fait inventé signalé', () => {
  const r = controlerLettre(CORPS + '\n\nJ\'ai dirigé Oracle.', { reference: 'Paie de 50 salariés sous Sage.', profil: '', offre: 'Cabinet ClientABC, poste de comptable.' });
  const statut = f => r.faits.find(x => x.fait === f)?.statut;
  assert.equal(statut('ClientABC'), 'offre');
  assert.equal(statut('Sage'), 'ok');
  assert.equal(statut('50'), 'ok');
  assert.equal(statut('Monsieur'), 'ok');
  assert.equal(statut('Oracle'), 'absent');
  assert.equal(r.ecarts, 1);
});

test('méthode : longueur, cliché, humilité, mention discriminante et typographie signalés ; une lettre propre ne l\'est pas', () => {
  const codes = t => conseilsMethode(t, { mots: 250 }).map(c => c.code);
  const mauvaise = 'Madame, Monsieur,\n\nJe me permets de vous écrire, je suis dynamique et motivé — et je pense pouvoir convenir malgré mon âge de 58 ans.';
  const c = codes(mauvaise);
  for (const k of ['longueur', 'paragraphes', 'accroche', 'cliche', 'humilite', 'typographie']) assert.ok(c.includes(k), k);
  assert.ok(codes('Madame, Monsieur,\n\nJ\'ai 58 ans et je cherche.').includes('discriminant'));
  // NOTE: « assurance maladie » et « secteur de la santé » sont du vocabulaire métier, pas une information personnelle
  assert.ok(!codes('Je gère les déclarations à l\'assurance maladie pour le secteur de la santé.').includes('discriminant'));
  const propre = ['Madame, Monsieur,', ...Array.from({ length: 4 }, () => 'Votre cabinet développe la paie de ses clients et je pilote depuis dix ans des paies complètes, des déclarations sociales aux bilans, avec une méthode claire et des délais tenus pour chaque client suivi. '.repeat(1).trim() + ' Je structure les dossiers, je forme les équipes et je fiabilise les clôtures mensuelles.')].join('\n\n');
  assert.deepEqual(codes(propre).filter(k => k !== 'longueur'), []);
});

test('brouillon du modèle : blocs inconnus écartés, salutation ajoutée une fois, point faible jamais au bord, ponctuation ramenée au clavier', () => {
  const m = validerMatrice({ blocs: { faible: { actif: true } } });
  const r = validerBrouillon({ objet: 'Candidature — comptable', paragraphes: [{ bloc: 'faible', texte: 'Une reconversion — un atout.' }, { bloc: 'vous', texte: 'Madame, Monsieur,' }, { bloc: 'vous', texte: 'Votre cabinet grandit.' }, { bloc: 'pirate', texte: 'x' }, { bloc: 'moi', texte: 'J’ai géré la paie.' }, { bloc: 'conclusion', texte: 'Échangeons.' }] }, m);
  assert.deepEqual(r.paragraphes.map(p => p.bloc), ['vous', 'moi', 'faible', 'conclusion']);
  assert.equal(r.objet, 'Candidature, comptable');
  assert.match(r.texte, /^Madame, Monsieur,\n\nVotre cabinet grandit\.\n\nJ'ai géré la paie\.\n\nUne reconversion, un atout\./);
  // NOTE: matrice sans bloc Moi ni Nous : le point faible seul au bord est retiré
  const seul = validerBrouillon({ objet: '', paragraphes: [{ bloc: 'vous', texte: 'A.' }, { bloc: 'faible', texte: 'B.' }] }, validerMatrice({ blocs: { faible: { actif: true }, moi: { actif: false }, nous: { actif: false }, conclusion: { actif: false } } }));
  assert.deepEqual(seul.paragraphes.map(p => p.bloc), ['vous']);
  assert.throws(() => validerBrouillon({ paragraphes: [] }, m), (/** @type {any} */ e) => e.code === 'format');
});

test('rédaction : consigne avec les faits du Profil et la matrice, résultat gardé, erreurs typées', async () => {
  viderMemoLettre();
  const db = ouvrirBase(':memory:');
  db.prepare("INSERT INTO offres (id_offre, titre, entreprise, categorie, departement, date_detection, annonce) VALUES ('o1', 'Comptable', 'ClientABC', 'comptabilite', '83', date('now'), ?)").run('Poste de comptable en cabinet. '.repeat(20));
  db.prepare("INSERT INTO offres (id_offre, titre, categorie, departement, date_detection, annonce) VALUES ('court', 'Comptable', 'comptabilite', '83', date('now'), 'Trop court')").run();
  db.prepare("INSERT INTO experiences (id, poste, employeur, debut, fin, description) VALUES ('x1', 'Comptable', 'ClientDEF', '2006-01', '2015-12', 'Paie de 50 salariés.')").run();
  db.prepare("INSERT INTO competences (id, domaine, competence, enseigner, executer, ordre) VALUES ('c1', 'Comptabilité', 'Paie', 2, 4, 1), ('c2', 'Comptabilité', 'Fiscalité', 1, 1, 2)").run();
  db.prepare("INSERT INTO kv (cle, valeur) VALUES ('profil', ?)").run(JSON.stringify({ resume: 'Comptable confirmé.' }));
  const faits = faitsProfil(db, ['c1', 'c2']);
  assert.deepEqual(faits.choisies, ['Paie']);
  assert.match(faits.texte, /Comptable, ClientDEF \(2006 à 2015\) : Paie de 50 salariés\./);
  assert.ok(!faits.texte.includes('Fiscalité'));
  const consigne = consigneLettre(validerMatrice({ mots: 200, blocs: { nous: { actif: false } } }), faits);
  assert.match(consigne, /Environ 200 mots/);
  assert.match(consigne, /dans cet ordre : vous, moi, conclusion/);
  // NOTE: angles et formules à éviter viennent du style (celui par défaut ici), un angle propre à un autre métier n'y figure pas
  assert.match(consigne, /Le défi du poste/);
  const style = validerStyle({ angles: [{ nom: 'Angle web', consigne: 'Ouvrir sur un site livré', metiers: ['web_design'] }, { nom: 'Angle commun', consigne: 'Ouvrir sur un fait', metiers: [] }], eviter: ['formule maison unique'] });
  const c2 = consigneLettre(validerMatrice({}), faits, style, 'comptabilite');
  assert.match(c2, /Angle commun/);
  assert.ok(!c2.includes('Angle web') && !c2.includes('Le défi du poste'));
  assert.match(c2, /formule maison unique/);
  assert.match(consigneLettre(validerMatrice({}), faits, style, 'web_design'), /Angle web/);
  let appels = 0;
  const f = { id: 'faux', modele: 'faux-modele', preparer: async () => {}, repondre: async () => { appels++; return { objet: 'Candidature', paragraphes: [{ bloc: 'vous', texte: 'Votre cabinet.' }, { bloc: 'moi', texte: 'Ma paie.' }] }; } };
  const r = await redigerLettre(db, 'o1', {}, { fournisseur: f });
  assert.equal(r.paragraphes.length, 2);
  await redigerLettre(db, 'o1', {}, { fournisseur: f });
  assert.equal(appels, 1);
  await redigerLettre(db, 'o1', {}, { fournisseur: f, force: true });
  assert.equal(appels, 2);
  await assert.rejects(redigerLettre(db, 'nope', {}, { fournisseur: f }), (/** @type {any} */ e) => e.code === 'introuvable');
  await assert.rejects(redigerLettre(db, 'court', {}, { fournisseur: f }), (/** @type {any} */ e) => e.code === 'courte');
});

test('fichiers : PDF non vide, Word lisible contenant le texte et la signature, image reconnue par ses octets', async () => {
  const image = png();
  const infos = infosImage(image);
  assert.deepEqual(infos, { type: 'PNG', largeur: 4, hauteur: 2 });
  assert.equal(infosImage(Buffer.from('pas une image')), null);
  const doc = validerLettre(LETTRE);
  const pdf = await lettrePdf(doc, { signature: { octets: image, type: 'PNG' } });
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString('latin1'), '%PDF-');
  const docx = lettreDocx(doc, { signature: { octets: image, ...infos } });
  assert.equal(docx.subarray(0, 4).toString('hex'), '504b0304');
  if (!aUnzip) return;
  const dir = mkdtempSync(join(tmpdir(), 'suivi-lettre-'));
  try {
    writeFileSync(join(dir, 'l.docx'), docx);
    execFileSync('unzip', ['-tq', join(dir, 'l.docx')]);
    const xml = execFileSync('unzip', ['-p', join(dir, 'l.docx'), 'word/document.xml'], { encoding: 'utf8' });
    assert.match(xml, /J&apos;ai géré|J'ai géré/);
    assert.match(xml, /rIdSignature/);
    assert.match(execFileSync('unzip', ['-l', join(dir, 'l.docx')], { encoding: 'utf8' }), /word\/media\/signature\.png/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('routes : brouillon écrit puis relu, conflit 409, export lié à la candidature (lettre jointe), versions, signature, journal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-lettre-'));
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps, type = 'application/json') => {
    const r = await fetch(url + chemin, { method: methode, headers: corps !== undefined ? { 'Content-Type': type } : {}, body: corps === undefined ? undefined : type === 'application/json' ? JSON.stringify(corps) : corps });
    return { status: r.status, data: r.headers.get('content-type')?.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), entetes: r.headers };
  };
  try {
    const offre = (await appel('POST', '/api/offres', { titre: 'Comptable', entreprise: 'ClientABC', categorie: 'comptabilite', annonce: 'Cabinet ClientABC, poste de comptable.' })).data;
    assert.equal((await appel('GET', `/api/lettre/brouillons/${offre.id_offre}`)).data, null);
    assert.equal((await appel('GET', '/api/lettre/brouillons/inconnue')).status, 404);
    const b1 = await appel('PUT', `/api/lettre/brouillons/${offre.id_offre}`, { texte: CORPS, objet: 'Candidature', matrice: { mots: 120 } });
    assert.equal(b1.status, 200);
    assert.equal(b1.data.origine, 'utilisateur');
    assert.equal(b1.data.matrice.mots, 150);
    // NOTE: Claude réécrit sans base_maj_le ; l'interface restée sur l'ancienne version reçoit un 409
    const b2 = await appel('PUT', `/api/lettre/brouillons/${offre.id_offre}`, { texte: CORPS + '\n\nMerci.', origine: 'claude' });
    assert.equal(b2.data.origine, 'claude');
    assert.equal((await appel('PUT', `/api/lettre/brouillons/${offre.id_offre}`, { texte: 'ancienne', base_maj_le: b1.data.maj_le })).status, 409);
    assert.equal((await appel('PUT', `/api/lettre/brouillons/${offre.id_offre}`, { origine: 'pirate' })).status, 400);
    assert.equal((await appel('GET', `/api/lettre/brouillons/${offre.id_offre}`)).data.texte, CORPS + '\n\nMerci.');
    const ctl = await appel('POST', '/api/lettre/controler', { texte: CORPS, cle: offre.id_offre });
    assert.equal(ctl.data.faits.find(f => f.fait === 'ClientABC').statut, 'offre');
    // NOTE: export lié à la candidature de l'offre : version enregistrée, « lettre jointe » cochée
    const cand = (await appel('POST', '/api/candidatures', { entreprise: 'ClientABC', poste: 'Comptable', offre_id: offre.id_offre, lettre: false })).data;
    assert.equal((await appel('POST', '/api/lettre/pdf', { lettre: { ...LETTRE, entete: {} }, cle: offre.id_offre })).status, 400);
    const pdf = await appel('POST', '/api/lettre/pdf', { lettre: LETTRE, cle: offre.id_offre });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.data.subarray(0, 5).toString('latin1'), '%PDF-');
    const idVersion = pdf.entetes.get('x-lettre-version');
    assert.equal((await appel('GET', `/api/candidatures/${cand.id}`)).data.lettre, true);
    const docx = await appel('POST', '/api/lettre/docx', { lettre: LETTRE, cle: offre.id_offre });
    assert.match(docx.entetes.get('content-type') ?? '', /wordprocessingml/);
    const versions = (await appel('GET', '/api/lettre/versions')).data;
    assert.equal(versions.length, 2);
    assert.ok(versions.every(v => v.candidature_id === cand.id && v.nom.startsWith('LM_Camille-Exemple_ClientABC_Comptable_')));
    assert.equal((await appel('GET', `/api/lettre/versions/${idVersion}`)).data.lettre.objet, LETTRE.objet);
    assert.equal((await appel('GET', `/api/lettre/versions/${idVersion}/docx`)).status, 200);
    assert.equal((await appel('DELETE', `/api/lettre/versions/${idVersion}`)).status, 200);
    // ANCHOR: signature : image refusée si ce n'en est pas une, sinon servie et présente dans l'état
    assert.equal((await appel('GET', '/api/signature')).status, 404);
    assert.equal((await appel('POST', '/api/signature', Buffer.from('<svg/>'), 'image/svg+xml')).status, 400);
    assert.equal((await appel('POST', '/api/signature', png(), 'image/png')).status, 201);
    assert.equal((await appel('GET', '/api/signature')).entetes.get('content-type'), 'image/png');
    const etat = (await appel('GET', '/api/state')).data;
    assert.equal(etat.signature, true);
    assert.equal(etat.lettreVersions.length, 1);
    assert.equal((await appel('DELETE', '/api/signature')).status, 200);
    // NOTE: matrice par défaut gardée dans le kv
    assert.equal((await appel('PUT', '/api/lettre/matrice', { ton: 'chaleureux', mots: 300 })).data.ton, 'chaleureux');
    assert.equal((await appel('GET', '/api/lettre/matrice')).data.mots, 300);
    // NOTE: consigne du dernier bloc, au-delà des 300 premiers caractères du JSON : doit s'enregistrer
    const consignes = Object.fromEntries(['vous', 'moi', 'faible', 'nous'].map(b => [b, { consigne: 'x'.repeat(100) }]));
    await appel('PUT', '/api/lettre/matrice', { blocs: consignes });
    await appel('PUT', '/api/lettre/matrice', { blocs: { ...consignes, conclusion: { consigne: 'fin changee' } } });
    assert.equal((await appel('GET', '/api/lettre/matrice')).data.blocs.conclusion.consigne, 'fin changee');
    const journal = (await appel('GET', '/api/journal?limite=100')).data;
    const entites = new Set((journal.evenements ?? journal).map(e => e.entite));
    for (const e of ['lettre', 'lettre_version', 'signature']) assert.ok(entites.has(e), e);
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('routes : lettre générique par métier (clé metier:), préparation en arrière-plan qui n\'écrase jamais un texte', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-lettre-'));
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps !== undefined ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: r.headers.get('content-type')?.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), entetes: r.headers };
  };
  try {
    // ANCHOR: générique : clé metier:<métier> connue seulement, export nommé LM_<Prénom-Nom>_<métier>, jamais Generique, aucune candidature cochée
    assert.equal((await appel('PUT', '/api/lettre/brouillons/metier:comptabilite', { texte: CORPS, origine: 'claude' })).data.offre_id, null);
    assert.equal((await appel('GET', '/api/lettre/brouillons/metier:comptabilite')).data.origine, 'claude');
    assert.equal((await appel('PUT', '/api/lettre/brouillons/metier:inconnu', { texte: CORPS })).status, 404);
    const pdf = await appel('POST', '/api/lettre/pdf', { lettre: LETTRE, cle: 'metier:comptabilite' });
    assert.equal(pdf.status, 200);
    assert.ok(decodeURIComponent(pdf.entetes.get('x-lettre-nom') ?? '').startsWith('LM_Camille-Exemple_Comptabilite_'));
    // NOTE: préparation : sans modèle configuré l'échec est suivi par GET ; une lettre déjà écrite n'est jamais relancée
    const offre = (await appel('POST', '/api/offres', { titre: 'Comptable', entreprise: 'ClientABC', categorie: 'comptabilite', annonce: 'Cabinet ClientABC. '.repeat(30) })).data;
    assert.equal((await appel('POST', '/api/lettre/preparer', { offre_id: 'nope' })).status, 404);
    assert.equal((await appel('POST', '/api/lettre/preparer', { offre_id: offre.id_offre })).data.etat, 'attente');
    let etat;
    for (let i = 0; i < 50 && (etat = (await appel('GET', `/api/lettre/preparer/${offre.id_offre}`)).data).etat === 'attente';) { i++; await new Promise(r => setTimeout(r, 50)); }
    assert.equal(etat.etat, 'echec');
    assert.equal(etat.code, 'config');
    assert.equal((await appel('GET', `/api/lettre/brouillons/${offre.id_offre}`)).data, null);
    await appel('PUT', `/api/lettre/brouillons/${offre.id_offre}`, { texte: CORPS });
    assert.equal((await appel('POST', '/api/lettre/preparer', { offre_id: offre.id_offre })).data.etat, 'existe');
    assert.equal((await appel('GET', '/api/lettre/preparer/autre')).data.etat, null);
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('entête : coordonnées en noir une par ligne, sans titre ni site, identiques dans le Word', () => {
  const entete = { nom: 'Prénom Nom', titre: 'Titre', adresse: '1 rue Exemple', code_postal: '49100', ville: 'Ville', telephone: '0600000000', email: 'contact@example.com', site: 'example.com' };
  assert.deepEqual(lignesEntete(entete), ['Prénom Nom', '1 rue Exemple', '49100 Ville', '0600000000', 'contact@example.com']);
  assert.deepEqual(lignesEntete({ nom: ' ', ville: 'Ville' }), ['Ville']);
  assert.deepEqual(lignesEntete(), []);
  const doc = lettreDocx(validerLettre({ entete, destinataire: '', lieu_date: '', objet: '', texte: 'Madame, Monsieur,\n\nBonjour.', signature: false }));
  const dir = mkdtempSync(join(tmpdir(), 'lettre-entete-'));
  try {
    writeFileSync(join(dir, 'l.docx'), doc);
    const xml = execFileSync('unzip', ['-p', join(dir, 'l.docx'), 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(xml.includes('1 rue Exemple') && xml.includes('contact@example.com'));
    assert.ok(!xml.includes('Titre') && !xml.includes('>example.com'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('code postal et ville : champs séparés, ancien format et doublons', () => {
  assert.equal(codePostalVille({ code_postal: '49100', ville: 'Villeneuve' }), '49100 Villeneuve');
  assert.equal(codePostalVille({ code_postal: ' 49100 ', ville: '' }), '49100');
  assert.equal(codePostalVille({ ville: 'Villeneuve' }), 'Villeneuve');
  assert.equal(codePostalVille({ ville: '49100 Villeneuve' }), '49100 Villeneuve');
  assert.equal(codePostalVille({ code_postal: '49100', ville: '49100 Villeneuve' }), '49100 Villeneuve');
  assert.deepEqual(separerLieu({ ville: '49100 Villeneuve' }), { code_postal: '49100', ville: 'Villeneuve' });
  assert.equal(codePostalVille({ code_postal: '35000', ville: '49100 Villeneuve' }), '35000 49100 Villeneuve');
  assert.equal(codePostalVille(), '');
  assert.deepEqual(lignesEntete({ nom: 'Prénom Nom', ville: '49100 Villeneuve', code_postal: '49100' }), ['Prénom Nom', '49100 Villeneuve']);
});

test('PDF : les symboles hors latin-1 gardent un équivalent lisible', () => {
  assert.equal(texteSur('≥ 5 ans, ≤ 3, ≠, ≈ 2 − 1, non‑breaking'), '>= 5 ans, <= 3, !=, ~ 2 - 1, non-breaking');
});

test('limites par plateforme : France Travail à 1500 caractères', async () => {
  const { LIMITES_PLATEFORME } = await import('../lib/lettre.mjs');
  assert.equal(LIMITES_PLATEFORME.find(l => l.nom.startsWith('France Travail'))?.max, 1500);
});

test('validerStyle : bornes, doublons, métiers inconnus, défaut si vide', () => {
  assert.equal(validerStyle({}).angles.length, STYLE_DEFAUT.angles.length);
  assert.deepEqual(validerStyle(null).eviter, [...STYLE_DEFAUT.eviter]);
  const s = validerStyle({
    angles: [{ nom: 'A', consigne: 'x', metiers: ['dev_web', 'inconnu'] }, { nom: 'A', consigne: 'doublon', metiers: [] }, { nom: '', consigne: 'sans nom' }, { nom: 'B', consigne: '' }, 'texte'],
    eviter: ['  Je ME  permets ', 'je me permets', 'ab', 12],
  });
  assert.deepEqual(s.angles, [{ id: 'a', nom: 'A', consigne: 'x', metiers: ['dev_web'] }]);
  assert.deepEqual(s.eviter, ['je me permets']);
  assert.equal(validerStyle({ angles: Array.from({ length: 30 }, (_, i) => ({ nom: `N${i}`, consigne: 'c' })) }).angles.length, 20);
  assert.deepEqual(anglesDuMetier(s, 'web_design'), []);
  assert.equal(anglesDuMetier(s, 'dev_web').length, 1);
});

test('conseil repetition : ouverture ou clôture reprise, formules perso à éviter', () => {
  const avant = { nom: 'LM_Prenom_ClientABC_2026-11', texte: 'Madame, Monsieur,\n\nDepuis 2017 en freelance, sous la marque Atelier, je forme et je conçois des sites.\n\nMes preuves.\n\nSi mon parcours vous parle, échangeons ensemble rapidement.\n\nJe vous prie d\'agréer, Madame, Monsieur, mes salutations distinguées.' };
  const proche = 'Madame, Monsieur,\n\nDepuis 2017 en freelance, sous la marque Atelier, je réponds à votre besoin.\n\nAutres preuves.\n\nÀ bientôt pour en parler.';
  const r = reprisesPrecedentes(proche, [avant]);
  assert.equal(r.length, 1);
  assert.equal(r[0].code, 'repetition');
  assert.match(r[0].message, /LM_Prenom_ClientABC/);
  const autre = 'Madame, Monsieur,\n\nVotre annonce parle de former autant que de concevoir, et je fais les deux.\n\nPreuves.\n\nParlons-en de vive voix cette semaine.\n\nJe vous prie d\'agréer, Madame, Monsieur, mes salutations distinguées.';
  assert.deepEqual(reprisesPrecedentes(autre, [avant]), []);
  assert.equal(controlerLettre(proche, { precedentes: [avant] }).conseils.some(c => c.code === 'repetition'), true);
  const eviter = controlerLettre('Madame, Monsieur,\n\nSi mon parcours vous parle, écrivez-moi.', { eviter: ['si mon parcours vous parle'] }).conseils;
  assert.ok(eviter.some(c => c.code === 'eviter'));
});

test('route /api/lettre/style : défaut, PUT valide, état, formules lues par le contrôle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-style-'));
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps !== undefined ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const defaut = (await appel('GET', '/api/lettre/style')).data;
    assert.ok(defaut.angles.length >= 5 && defaut.eviter.length > 0);
    const n = (await appel('PUT', '/api/lettre/style', { angles: [{ nom: 'Mon angle', consigne: 'Ouvrir sur un fait', metiers: ['dev_web'] }], eviter: ['phrase interdite maison'] })).data;
    assert.equal(n.angles[0].id, 'mon-angle');
    // NOTE: ajouter une seule formule à une liste longue doit s'enregistrer (le journal tronque les longues valeurs)
    const longue = Array.from({ length: 40 }, (_, i) => `formule numero ${i} de la liste`);
    await appel('PUT', '/api/lettre/style', { angles: n.angles, eviter: longue });
    await appel('PUT', '/api/lettre/style', { angles: n.angles, eviter: [...longue, 'derniere formule ajoutee'] });
    assert.equal((await appel('GET', '/api/lettre/style')).data.eviter.at(-1), 'derniere formule ajoutee');
    await appel('PUT', '/api/lettre/style', { angles: n.angles, eviter: ['phrase interdite maison'] });
    assert.deepEqual((await appel('GET', '/api/lettre/style')).data.eviter, ['phrase interdite maison']);
    assert.equal((await appel('GET', '/api/state')).data.lettreStyle.angles.length, 1);
    const c = (await appel('POST', '/api/lettre/controler', { texte: 'Madame, Monsieur,\n\nUne phrase interdite maison ici.' })).data;
    assert.ok(c.conseils.some(x => x.code === 'eviter'));
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
