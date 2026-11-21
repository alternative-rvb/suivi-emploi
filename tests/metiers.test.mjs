// Tests des métiers configurables (ligne 260) : catalogue et classement, liste du profil, routes /api/metiers, catégorie vue par profil, migration v33.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CATALOGUE, CLES_METIERS, ORDRE_CLASSEMENT, METIERS_MAX, poidsMetier, validerMetiers, vueCategorie } from '../lib/metiers.mjs';
import { classer } from '../lib/classement.mjs';
import { ouvrirBase, VERSION_SCHEMA } from '../lib/offres.mjs';
import { avecProfil, creerProfil, profilDefaut } from '../lib/profils.mjs';
import { lireMetiers, METIERS_HISTORIQUES } from '../lib/metiers-profil.mjs';
import { serveurTemporaire } from './serveur-temporaire.mjs';

test('catalogue : clés uniques, ordre de classement complet, champs requis', () => {
  assert.equal(new Set(CLES_METIERS).size, CATALOGUE.length);
  assert.deepEqual([...ORDRE_CLASSEMENT].sort(), [...CLES_METIERS].sort());
  for (const m of CATALOGUE) assert.ok(m.libelle && m.titre && m.couleur && /^[A-N]\d{4}$/.test(m.rome), m.cle);
  // NOTE: les quatre métiers d'avant la v33 gardent l'ordre des colonnes (intitulés, poids des puces)
  assert.deepEqual(CLES_METIERS.slice(0, 4), METIERS_HISTORIQUES);
});

test('classer : métiers d\'avant inchangés, nouveaux métiers reconnus, refus gardés', () => {
  assert.equal(classer('Comptable général H/F'), 'comptabilite');
  assert.equal(classer('Formateur développement web'), 'formateur_digital');
  assert.equal(classer('Formateur développeur web'), 'dev_web');
  assert.equal(classer('Formateur numérique et bureautique'), 'formateur_digital');
  assert.equal(classer('Formateur cariste'), 'logistique');
  assert.equal(classer('Graphiste PAO'), 'web_design');
  assert.equal(classer('Développeur Java'), 'autre');
  assert.equal(classer('Community manager'), 'marketing_digital');
  assert.equal(classer('Chargé de recrutement'), 'ressources_humaines');
  assert.equal(classer('Assistant administratif'), 'assistanat');
  assert.equal(classer('Business developer'), 'commercial');
  assert.equal(classer('Préparateur de commandes'), 'logistique');
  assert.equal(classer('Boulanger'), 'autre');
});

test('validerMetiers, vueCategorie, poidsMetier', () => {
  assert.throws(() => validerMetiers('dev_web'), /Liste/);
  assert.throws(() => validerMetiers(['dev_web', 'pilote']), /inconnus : pilote/);
  assert.throws(() => validerMetiers(CLES_METIERS), new RegExp(`${METIERS_MAX} métiers au plus`));
  assert.deepEqual(validerMetiers(['dev_web', 'dev_web', 'commercial']), ['dev_web', 'commercial']);
  assert.equal(vueCategorie('dev_web', ['commercial']), 'autre');
  assert.equal(vueCategorie('dev_web', ['dev_web']), 'dev_web');
  assert.equal(vueCategorie('dev_web', []), 'dev_web', 'sans liste, catégorie commune');
  assert.deepEqual(CLES_METIERS.slice(0, 8).map(c => poidsMetier(CLES_METIERS.slice(0, 8), c)), [14, 13, 12, 11, 10, 9, 8, 8]);
  assert.equal(poidsMetier(['dev_web'], 'autre'), 0);
});

test('liste du profil : vide pour un profil neuf, clé inconnue ignorée', () => {
  const db = ouvrirBase(':memory:');
  assert.deepEqual(lireMetiers(db), [], 'base neuve : aucun métier imposé');
  const autre = /** @type {{ id: string }} */ (creerProfil(db, { nom: 'Autre' }));
  avecProfil(autre.id, () => {
    db.prepare("INSERT INTO profil_reglages (profil_id, cle, valeur) VALUES (profil_actif(), 'metiers', ?)").run(JSON.stringify(['commercial', 'disparu']));
    assert.deepEqual(lireMetiers(db), ['commercial']);
  });
  assert.deepEqual(lireMetiers(db), []);
  db.close();
});

// ANCHOR: base v32 fabriquée depuis le schéma actuel : offres reconstruite avec l'ancien CHECK sur categorie
function baseV32(chemin) {
  ouvrirBase(chemin).close();
  const db = new DatabaseSync(chemin);
  const sql = String(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'offres'").get()?.sql);
  const ancien = sql.replace("categorie TEXT NOT NULL DEFAULT 'autre'", "categorie TEXT NOT NULL CHECK (categorie IN ('formateur_digital', 'web_design', 'dev_web', 'comptabilite', 'autre'))");
  assert.notEqual(ancien, sql);
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`DROP TABLE offres; ${ancien}; DELETE FROM profil_reglages WHERE cle = 'metiers'; PRAGMA user_version = 32`);
  db.exec(`INSERT INTO offres (id_offre, titre, categorie, date_detection) VALUES
    ('o1', 'Comptable', 'comptabilite', '2026-10-20'), ('o2', 'Community manager', 'autre', '2026-10-21'), ('o3', 'Boulanger', 'autre', '2026-10-22')`);
  db.exec(`INSERT INTO offre_suivis (profil_id, id_offre, vue) SELECT (SELECT id FROM profils LIMIT 1), id_offre, 1 FROM offres`);
  return db;
}

test('migration v33 : CHECK retiré, offres « autre » reclassées, quatre métiers pour le profil par défaut, copie faite, idempotente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-v33-'));
  try {
    const chemin = join(dir, 'suivi.db');
    baseV32(chemin).close();
    const db = ouvrirBase(chemin);
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, VERSION_SCHEMA);
    assert.ok(!/CHECK \(categorie/.test(String(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'offres'").get()?.sql)));
    assert.deepEqual(db.prepare('SELECT id_offre, categorie FROM offres ORDER BY id_offre').all().map(r => [r.id_offre, r.categorie]), [['o1', 'comptabilite'], ['o2', 'marketing_digital'], ['o3', 'autre']]);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM offre_suivis WHERE vue = 1').get()?.n, 3, 'état des offres gardé');
    assert.deepEqual(lireMetiers(db), METIERS_HISTORIQUES);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    // NOTE: les colonnes d'état sorties d'offres en v32 n'y reviennent pas
    assert.ok(!db.prepare('PRAGMA table_info(offres)').all().some(c => ['vue', 'description', 'epinglee_le'].includes(String(c.name))));
    assert.equal(readdirSync(join(dir, 'data', 'backups')).filter(f => f.startsWith('suivi-avant-schema-v33-')).length, 1);
    // NOTE: liste modifiée ensuite par l'utilisateur : une deuxième ouverture n'y touche pas
    db.prepare("UPDATE profil_reglages SET valeur = '[\"commercial\"]' WHERE cle = 'metiers' AND profil_id = ?").run(profilDefaut(db));
    db.close();
    const encore = ouvrirBase(chemin);
    assert.deepEqual(lireMetiers(encore), ['commercial']);
    encore.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('routes /api/metiers et catégorie des offres vue par le profil', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-metiers-'));
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const depart = (await appel('GET', '/api/metiers')).data;
    assert.deepEqual(depart.metiers, []);
    assert.equal(depart.catalogue.length, CATALOGUE.length);
    assert.equal(depart.max, METIERS_MAX);
    assert.equal((await appel('PUT', '/api/metiers', { metiers: ['pilote'] })).status, 400);
    assert.equal((await appel('PUT', '/api/metiers', {})).status, 400);

    const offre = await appel('POST', '/api/offres', { titre: 'Comptable' });
    assert.equal(offre.status, 201);
    const id = offre.data.id_offre;
    // NOTE: sans liste, la catégorie commune est montrée telle quelle
    assert.equal(offre.data.categorie, 'comptabilite');

    const ok = await appel('PUT', '/api/metiers', { metiers: ['dev_web', 'dev_web', 'commercial'] });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data.metiers, ['dev_web', 'commercial']);
    assert.deepEqual((await appel('GET', '/api/metiers')).data.metiers, ['dev_web', 'commercial']);
    assert.equal((await appel('GET', `/api/offres/${id}`)).data.categorie, 'autre');
    assert.deepEqual((await appel('GET', '/api/offres?categorie=autre')).data.map(o => o.id_offre), [id]);
    assert.deepEqual((await appel('GET', '/api/offres?categorie=comptabilite')).data, []);

    await appel('PUT', '/api/metiers', { metiers: ['comptabilite'] });
    assert.equal((await appel('GET', `/api/offres/${id}`)).data.categorie, 'comptabilite');
    assert.deepEqual((await appel('GET', '/api/offres?categorie=comptabilite')).data.map(o => o.id_offre), [id]);

    // NOTE: liste propre à chaque profil ; un enregistrement identique n'écrit rien au journal
    const b = (await appel('POST', '/api/profils', { nom: 'Autre' })).data.id;
    assert.deepEqual((await appel('GET', `/api/p/${b}/metiers`)).data.metiers, []);
    await appel('PUT', '/api/metiers', { metiers: ['comptabilite'] });
    const db = new DatabaseSync(join(dir, 'suivi.db'), { readOnly: true });
    const lignes = db.prepare("SELECT apres FROM journal WHERE entite = 'metiers' ORDER BY id").all().map(r => r.apres);
    db.close();
    assert.deepEqual(lignes, ['Développement web, Commercial', 'Comptabilité']);
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

// SECTION: métiers créés par le profil (ligne 266)
test('validerMetierPerso et validerMetiersPerso : nom, mots, ROME, doublons, limite', async () => {
  const { validerMetierPerso, validerMetiersPerso, PERSO_MAX, CLE_PERSO } = await import('../lib/metiers.mjs');
  const m = validerMetierPerso({ libelle: '  Boulangerie ', mots: ['boulang', 'Boulang', 'x'], rome: 'd1102' });
  assert.ok(CLE_PERSO.test(m.cle), 'clé tirée si absente');
  assert.deepEqual([m.libelle, m.titre, m.mots, m.exclus, m.rome, m.couleur], ['Boulangerie', 'Boulangerie', ['boulang'], [], 'D1102', 'grey']);
  assert.throws(() => validerMetierPerso({ libelle: 'B', mots: ['boulang'] }), /2 caractères/);
  assert.throws(() => validerMetierPerso({ libelle: 'Boulangerie', mots: [] }), /au moins un mot/);
  assert.throws(() => validerMetierPerso({ libelle: 'Boulangerie', mots: ['boulang'], rome: '1102' }), /ROME/);
  assert.throws(() => validerMetierPerso({ libelle: 'Boulangerie', mots: ['boulang'], cle: 'dev_web' }), /clé invalide/);
  assert.throws(() => validerMetiersPerso([{ libelle: 'Commercial', mots: ['vente'] }]), /existe déjà/, 'nom du catalogue refusé');
  assert.throws(() => validerMetiersPerso([{ libelle: 'Boulangerie', mots: ['a1'] }, { libelle: 'boulangerie', mots: ['b1'] }]), /existe déjà/);
  assert.throws(() => validerMetiersPerso(Array.from({ length: PERSO_MAX + 1 }, (_, i) => ({ libelle: `Métier ${i}`, mots: ['mot'] }))), /au plus/);
});

test('classerProfil : métier créé avant le catalogue, début de mot, accents, exclus ; sans métier créé, même résultat qu\'avant', async () => {
  const { classerProfil, validerMetierPerso } = await import('../lib/metiers.mjs');
  const b = validerMetierPerso({ cle: 'perso_aaaaaa', libelle: 'Boulangerie', mots: ['boulang', 'pâtissier'], exclus: ['industriel'] });
  const liste = ['comptabilite', b.cle];
  assert.equal(classerProfil('Boulanger H/F', 'autre', liste, [b]), b.cle);
  assert.equal(classerProfil('Pâtissière en alternance', 'autre', liste, [b]), b.cle);
  assert.equal(classerProfil('Comptable en boulangerie', 'comptabilite', liste, [b]), b.cle, 'le métier créé passe avant le catalogue');
  assert.equal(classerProfil('Boulanger industriel', 'autre', liste, [b]), 'autre', 'mot exclu');
  assert.equal(classerProfil('Taboulangerie', 'autre', liste, [b]), 'autre', 'début de mot seulement');
  assert.equal(classerProfil('Boulanger', 'autre', ['comptabilite'], [b]), 'autre', 'métier créé hors de la liste : ignoré');
  assert.equal(classerProfil('Offre manuelle', 'perso_zzzzzz', [], []), 'autre', 'clé d\'un métier créé puis supprimé : autre');
  assert.equal(classerProfil('Offre manuelle', b.cle, [b.cle], [b]), b.cle, 'clé d\'un métier créé encore défini : gardée');
  for (const [t, c] of [['Comptable', 'comptabilite'], ['Développeur web', 'dev_web']]) {
    assert.equal(classerProfil(t, c, METIERS_HISTORIQUES, []), vueCategorie(c, METIERS_HISTORIQUES));
    assert.equal(classerProfil(t, c, [], []), c);
  }
});

test('routes : métiers créés, catégorie et filtre par profil, aperçu, journal, poids et intitulés, catégorie commune préservée', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-perso-'));
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const boul = { cle: 'perso_boul01', libelle: 'Boulangerie', titre: 'Boulanger', mots: ['boulang'], exclus: [], rome: 'D1102', couleur: 'orange' };
    const o1 = (await appel('POST', '/api/offres', { titre: 'Boulanger H/F' })).data.id_offre;
    const o2 = (await appel('POST', '/api/offres', { titre: 'Comptable' })).data.id_offre;
    assert.equal((await appel('PUT', '/api/metiers', { metiers: ['perso_inconnu'] })).status, 400, 'clé sans définition');
    assert.equal((await appel('PUT', '/api/metiers', { metiers: [], perso: [{ libelle: 'X' }] })).status, 400);
    const ap = await appel('POST', '/api/metiers/apercu', { libelle: 'Boulangerie', mots: ['boulang'] });
    assert.deepEqual([ap.status, ap.data.total, ap.data.exemples], [200, 1, ['Boulanger H/F']]);

    const ok = await appel('PUT', '/api/metiers', { metiers: [boul.cle, 'comptabilite'], perso: [boul] });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data.metiers, [boul.cle, 'comptabilite']);
    assert.equal(ok.data.perso[0].libelle, 'Boulangerie');
    assert.equal((await appel('GET', `/api/offres/${o1}`)).data.categorie, boul.cle);
    assert.deepEqual((await appel('GET', `/api/offres?categorie=${boul.cle}`)).data.map(o => o.id_offre), [o1]);
    assert.deepEqual((await appel('GET', '/api/offres?categorie=comptabilite')).data.map(o => o.id_offre), [o2]);
    // NOTE: une liste envoyée sans perso garde les métiers créés
    assert.equal((await appel('PUT', '/api/metiers', { metiers: [boul.cle] })).data.perso.length, 1);
    assert.deepEqual((await appel('GET', '/api/offres?categorie=autre')).data.map(o => o.id_offre), [o2]);

    // NOTE: marquer vue une offre rangée dans « autre » pour ce profil ne change pas sa catégorie commune (anomalie de la ligne 260)
    assert.equal((await appel('PATCH', `/api/offres/${o2}`, { vue: true })).status, 200);
    const brute = new DatabaseSync(join(dir, 'suivi.db'), { readOnly: true });
    assert.equal(brute.prepare('SELECT categorie FROM offres WHERE id_offre = ?').get(o2)?.categorie, 'comptabilite');
    brute.close();

    // NOTE: poids, intitulés, catégorie d'expérience, accroches et lettre générique d'un métier créé sont acceptés
    const x = await appel('POST', '/api/experiences', { poste: 'Vendeur en boulangerie', categorie: boul.cle, debut: '2020-01', description: 'Accueil. Pétrissage', intitules: { [boul.cle]: 'Boulanger' }, poids: { 'Pétrissage': { [boul.cle]: 3 } } });
    assert.equal(x.status, 201, JSON.stringify(x.data));
    assert.equal(x.data.categorie, boul.cle);
    assert.deepEqual(x.data.intitules, { [boul.cle]: 'Boulanger' });
    assert.equal((await appel('POST', '/api/experiences', { poste: 'Y', categorie: 'perso_zzzzzz', debut: '2020-01' })).status, 400, 'métier créé inconnu du profil');
    const cv = await appel('POST', '/api/cv/composer', { cible: 'metier', categorie: boul.cle });
    assert.equal(cv.status, 200, JSON.stringify(cv.data));
    assert.equal(cv.data.document.libelle, 'Boulangerie');

    // NOTE: un autre profil ne voit pas ces métiers ; l'offre reste rangée par la catégorie commune
    const b = (await appel('POST', '/api/profils', { nom: 'Autre' })).data.id;
    assert.deepEqual((await appel('GET', `/api/p/${b}/metiers`)).data.perso, []);

    const db = new DatabaseSync(join(dir, 'suivi.db'), { readOnly: true });
    const champs = db.prepare("SELECT champ FROM journal WHERE entite = 'metiers'").all().map(r => r.champ);
    db.close();
    assert.ok(champs.includes('metiers_perso') && champs.includes('metiers'), champs.join(','));
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
// !SECTION
