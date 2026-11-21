// Démonstration : lance l'application sur une base fictive, dans un dossier temporaire, sans toucher à votre suivi.db.
// Usage : npm run demo   (PORT=3100 par défaut, DEMO_PORT pour en changer). Ctrl+C arrête tout et efface la démo.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrirBase, recalculerProches } from '../lib/offres.mjs';
import { avecProfil, creerProfil, ecrireReglageProfil, modifierProfil, profilDefaut } from '../lib/profils.mjs';

// NOTE: la commande est dans bin/ ; le serveur, lib/ et dist/ sont à la racine du projet
const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.DEMO_PORT ?? 3100);

// NOTE: l'interface est servie depuis dist/ : on la construit au premier lancement
if (!existsSync(join(racine, 'dist', 'index.html'))) {
  console.log('Construction de l\'interface (une seule fois)...');
  const r = spawnSync('npm', ['run', 'build'], { cwd: racine, stdio: 'inherit' });
  if (r.status !== 0) { console.error('La construction a échoué : lancer npm install puis npm run build.'); process.exit(1); }
}

// ANCHOR: copie jetable (serveur, lib, interface) : le serveur lit et écrit sa base à côté de server.mjs, la démo ne peut donc jamais toucher vos données
const dir = mkdtempSync(join(tmpdir(), 'suivi-emploi-demo-'));
for (const f of ['server.mjs', 'package.json']) cpSync(join(racine, f), join(dir, f));
for (const d of ['lib', 'dist']) cpSync(join(racine, d), join(dir, d), { recursive: true });
symlinkSync(join(racine, 'node_modules'), join(dir, 'node_modules'));

// ANCHOR: données fictives, dates relatives à aujourd'hui pour que la démo paraisse toujours récente ; tout est inventé
const jour = n => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const db = ouvrirBase(join(dir, 'suivi.db'));
const ajout = db.prepare('INSERT INTO offres (id_offre, titre, entreprise, lieu, departement, ville, contrat, salaire, lien, date_detection, categorie, annonce) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
// NOTE: chaque offre est suivie par le profil par défaut (offre_suivis), la zone « proche » est recalculée plus bas d'après la zone du profil
const suivre = db.prepare('INSERT INTO offre_suivis (id_offre, epinglee_le) VALUES (?, ?)');
const offre = { run: (id, titre, entreprise, lieu, dep, ville, _proche, contrat, salaire, lien, date, cat, epingle, annonce) => { ajout.run(id, titre, entreprise, lieu, dep, ville, contrat, salaire, lien, date, cat, annonce); suivre.run(id, epingle); } };
const ANNONCE = 'Dans une équipe de cinq personnes, vous concevez et maintenez des applications web. Compétences attendues : JavaScript, React, SQL, tests automatisés. Poste en CDI, télétravail partiel.';
[
  ['d1', 'Développeur web React', 'Studio Alizé', '44 - Nantes', '44', 'Nantes', 1, 'CDI', '38 000 à 45 000 euros par an', 'https://example.com/offre/d1', jour(-1), 'dev_web', new Date().toISOString(), ANNONCE],
  ['d2', 'Formateur développement web', 'Centre Horizon Formation', '44 - Nantes', '44', 'Nantes', 1, 'CDD 12 mois', '2 400 euros par mois', 'https://example.com/offre/d2', jour(-1), 'formateur_digital', '', ANNONCE],
  ['d3', 'Intégrateur web', 'Agence Pixelor', '35 - Rennes', '35', 'Rennes', 0, 'CDI', '', 'https://example.com/offre/d3', jour(-2), 'dev_web', '', ANNONCE],
  ['d4', 'Web designer', 'Atelier Mirabelle', '44 - Saint-Herblain', '44', 'Saint-Herblain', 1, 'CDI', '32 000 euros par an', 'https://example.com/offre/d4', jour(-2), 'web_design', '', ANNONCE],
  ['d5', 'Comptable général', 'Cabinet Valmont', '44 - Nantes', '44', 'Nantes', 1, 'CDI', '30 000 euros par an', 'https://example.com/offre/d5', jour(-3), 'comptabilite', '', ANNONCE],
  ['d6', 'Formateur bureautique et numérique', 'Organisme Cap Savoir', '49 - Angers', '49', 'Angers', 0, 'CDD 6 mois', '', 'https://example.com/offre/d6', jour(-3), 'formateur_digital', '', ANNONCE],
  ['d7', 'UI designer', 'Studio Nébuline', '44 - Nantes', '44', 'Nantes', 1, 'CDD 12 mois', '', 'https://example.com/offre/d7', jour(-4), 'web_design', '', ANNONCE],
  ['d8', 'Développeur full stack', 'Société Aquilon', '44 - Nantes', '44', 'Nantes', 1, 'CDI', '42 000 euros par an', 'https://example.com/offre/d8', jour(-5), 'dev_web', '', ANNONCE],
  ['d9', 'Assistant comptable', 'Entreprise Boréale', '85 - La Roche-sur-Yon', '85', 'La Roche-sur-Yon', 0, 'CDD 3 mois', '', 'https://example.com/offre/d9', jour(-6), 'comptabilite', '', ANNONCE],
  ['d10', 'Responsable communication', 'Association Sillage', '44 - Nantes', '44', 'Nantes', 1, 'CDI', '', 'https://example.com/offre/d10', jour(-7), 'autre', '', ANNONCE],
].forEach(o => offre.run(...o));

const cand = db.prepare('INSERT INTO candidatures (id, entreprise, poste, statut, date, plateforme, interet, notes, offre_id, maj_locale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)');
[
  ['c1', 'Agence Pixelor', 'Intégrateur web', 'entretien', jour(-9), 'France Travail', 'fort', 'Entretien téléphonique passé, suite prévue.', 'd3'],
  ['c2', 'Société Lumen', 'Développeur front-end', 'en_cours', jour(-6), 'Candidature spontanée', 'moyen', 'Envoyée par e-mail.', null],
  ['c3', 'Centre Horizon Formation', 'Formateur numérique', 'en_cours', jour(-4), 'France Travail', 'important', '', 'd2'],
  ['c4', 'Cabinet Valmont', 'Comptable', 'sans_reponse', jour(-21), 'France Travail', 'faible', '', null],
  ['c5', 'Atelier Mirabelle', 'Web designer', 'refuse', jour(-15), 'Site de l\'entreprise', 'moyen', 'Profil jugé trop junior.', null],
  ['c6', 'Studio Nébuline', 'UI designer', 'a_faire', jour(0), 'France Travail', 'fort', '', 'd7'],
  ['c7', 'Organisme Cap Savoir', 'Formateur bureautique', 'accepte', jour(-30), 'Réseau', 'important', '', null],
].forEach(c => cand.run(...c));

const tache = db.prepare('INSERT INTO taches (id, candidature_id, titre, echeance, faite, creee) VALUES (?, ?, ?, ?, ?, ?)');
[['t1', 'c1', 'Préparer l\'entretien technique', jour(2), 0], ['t2', 'c2', 'Relancer par e-mail', jour(1), 0], ['t3', 'c3', 'Envoyer le portfolio', jour(-1), 0], ['t4', 'c1', 'Remercier pour l\'appel', jour(-8), 1]]
  .forEach(([id, c, titre, echeance, faite]) => tache.run(id, c, titre, echeance, faite, jour(-9)));
const echange = db.prepare('INSERT INTO echanges (id, candidature_id, date, heure, canal, sens, resume) VALUES (?, ?, ?, ?, ?, ?, ?)');
echange.run('e1', 'c1', jour(-5), '14:30', 'telephone', 'recu', 'Appel de la responsable du recrutement : présentation du poste, entretien technique proposé.');
echange.run('e2', 'c2', jour(-6), '09:10', 'email', 'envoye', 'Envoi du CV et d\'un lien vers le portfolio.');

const comp = db.prepare('INSERT INTO competences (id, domaine, competence, enseigner, executer, ordre, valide) VALUES (?, ?, ?, ?, ?, ?, 1)');
[['k1', 'Développement web', 'JavaScript', 4, 4], ['k2', 'Développement web', 'React', 3, 4], ['k3', 'Développement web', 'SQL', 3, 3], ['k4', 'Design', 'Maquettage', 3, 4], ['k5', 'Formation', 'Animation de groupe', 4, 4], ['k6', 'Comptabilité', 'Saisie comptable', 2, 3]]
  .forEach(([id, d, c, e, x], i) => comp.run(id, d, c, e, x, i + 1));
db.prepare('INSERT INTO contacts (id, prenom, nom, fonction, entreprise, email, note, cree) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .run('p1', 'Camille', 'Exemple', 'Responsable du recrutement', 'Agence Pixelor', 'camille@example.com', 'Contact de la candidature d\'intégrateur web.', jour(-5));

// ANCHOR: deux profils fictifs sur les mêmes offres : le profil par défaut (emploi, données ci-dessus) et un profil alternance avec ses propres candidatures, réglages et offres suivies
// NOTE: zone fictive (Nantes et alentours) enregistrée dans chaque profil, aucune variable de zone dans l'environnement du serveur
const ZONE = { departement_proche: '44', villes_proches: ['Nantes', 'Saint-Herblain'], origines: ['47.2184,-1.5536'], departements_distance: [], lieu_bonus: '' };
modifierProfil(db, profilDefaut(db), { nom: 'Démo emploi', couleur: 'bleu' });
ecrireReglageProfil(db, 'zone', ZONE);
// NOTE: métiers du profil (ligne 260) : les quatre de la démo, dans l'ordre de leur poids dans le score
ecrireReglageProfil(db, 'metiers', ['formateur_digital', 'web_design', 'dev_web', 'comptabilite']);
recalculerProches(db);
const alternance = /** @type {{ id: string }} */ (creerProfil(db, { nom: 'Démo alternance', couleur: 'vert' }));
avecProfil(alternance.id, () => {
  ecrireReglageProfil(db, 'reglages', { zones: ['44'], mots_cles: ['alternance développeur', 'apprenti web'], mots_exclus: [], contrats_exclus: [], entreprises: [], mode: 'alternance' });
  ecrireReglageProfil(db, 'zone', { ...ZONE, villes_proches: ['Nantes'] });
  // NOTE: un métier créé (ligne 266) : les offres d'intégrateur passent avant le développement web pour ce profil
  ecrireReglageProfil(db, 'metiers_perso', [{ cle: 'perso_demo01', libelle: 'Intégration web', titre: 'Intégrateur web', mots: ['integrat'], exclus: [], rome: 'M1805', couleur: 'orange' }]);
  ecrireReglageProfil(db, 'metiers', ['perso_demo01', 'dev_web', 'web_design', 'marketing_digital']);
  for (const id of ['d1', 'd3', 'd8']) suivre.run(id, '');
  recalculerProches(db);
  cand.run('a1', 'Studio Alizé', 'Développeur web en alternance', 'en_cours', jour(-3), 'Site de l\'entreprise', 'fort', 'Rythme proposé : trois semaines en entreprise, une en formation.', 'd1');
  tache.run('ta1', 'a1', 'Envoyer le calendrier de l\'école', jour(3), 0, jour(-3));
  comp.run('ka1', 'Développement web', 'HTML et CSS', 1, 3, 1);
});
// NOTE: la dernière synchro est déclarée récente pour que le serveur ne cherche pas à joindre France Travail
db.prepare('INSERT INTO kv (cle, valeur) VALUES (?, ?)').run('synchro_derniere', JSON.stringify({ ok: true, date: new Date().toISOString(), declencheur: 'demo', nouvelles: 0 }));
db.close();

// ANCHOR: serveur de démonstration : environnement vidé (aucune clé lue), aucune synchronisation
const proc = spawn(process.execPath, ['--no-warnings', 'server.mjs'], {
  cwd: dir,
  env: { PATH: process.env.PATH, PORT: String(port), SUIVI_PROVIDERS: 'n8n', SUIVI_SYNC_MIN_MINUTES: '1440' },
  stdio: 'inherit',
});
console.log(`\nDémo : http://localhost:${port}\nDonnées fictives, effacées à l'arrêt (Ctrl+C).\n`);
const fin = () => { proc.kill(); rmSync(dir, { recursive: true, force: true }); process.exit(0); };
process.on('SIGINT', fin);
process.on('SIGTERM', fin);
proc.on('exit', () => { rmSync(dir, { recursive: true, force: true }); process.exit(0); });
