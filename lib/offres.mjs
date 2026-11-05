// Logique commune aux providers d'offres et à bin/sync.mjs : base, classement, filtres, fusion des offres.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { journaliser, ouvrirJournal } from './journal.mjs';
import { CATEGORIES_OFFRE, COULEURS_CONTACT, INTERETS_CANDIDATURE, STATUTS_CANDIDATURE, TYPES_EXPERIENCE, TYPES_FORMATION } from './listes.mjs';
import { lireAnnees } from './periode.mjs';
import { norm } from './texte.mjs';
import { classer } from './classement.mjs';

export { classer, norm };

// ANCHOR: fenêtre de fraîcheur, les offres plus anciennes sont écartées
export const JOURS_MAX = 31;

// ANCHOR: durée de vie d'une épingle sur une offre : sans action (candidature, offre écartée) elle tombe seule et l'offre retourne à la purge normale
export const JOURS_EPINGLE = 14;

// ANCHOR: fenêtre de la recherche France Travail (publieeDepuis 31) moins une marge : au-delà, l'absence d'une offre ne prouve plus rien
export const JOURS_RECHERCHE_FT = 30;

// ANCHOR: version du schéma (PRAGMA user_version). Toute évolution passe par migrer(), après une copie de la base.
export const VERSION_SCHEMA = 30;

// NOTE: listes fermées du parcours définies dans lib/listes.mjs (partagées avec l'interface), réexportées pour le serveur et l'import LinkedIn
export { CATEGORIES_OFFRE, TYPES_EXPERIENCE, TYPES_FORMATION };

// ANCHOR: offres jamais retirées par la purge ou les réglages : liées à une candidature, à un contact ou à un rendez-vous
const PROTEGEES = `id_offre NOT IN (SELECT offre_id FROM candidatures WHERE offre_id IS NOT NULL)
  AND id_offre NOT IN (SELECT offre_id FROM contact_offres)
  AND id_offre NOT IN (SELECT offre_id FROM rendez_vous WHERE offre_id IS NOT NULL)
  AND id_offre NOT IN (SELECT id_offre FROM offres WHERE epinglee_le != '' AND epinglee_le > date('now', 'localtime', '-${JOURS_EPINGLE} days'))`;

const sqlListe = l => l.map(x => `'${x}'`).join(', ');

// ANCHOR: schéma complet de la base (tables, contraintes, index), créé tel quel pour une base neuve ; la migration v12 en tire aussi le texte des tables à reconstruire
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS offres (
  id_offre TEXT PRIMARY KEY,
  titre TEXT NOT NULL,
  entreprise TEXT,
  lieu TEXT,
  departement TEXT,
  ville TEXT,
  proche INTEGER NOT NULL DEFAULT 0,
  contrat TEXT,
  salaire TEXT,
  lien TEXT,
  date_detection TEXT,
  categorie TEXT NOT NULL CHECK (categorie IN (${sqlListe(CATEGORIES_OFFRE)})),
  ignoree INTEGER NOT NULL DEFAULT 0,
  vue INTEGER NOT NULL DEFAULT 0,
  expiree INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'France Travail',
  postuler_via TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  annonce TEXT NOT NULL DEFAULT '',
  epinglee_le TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS kv (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS candidatures (
  id TEXT PRIMARY KEY,
  entreprise TEXT,
  poste TEXT,
  description TEXT,
  statut TEXT CHECK (statut IS NULL OR statut IN (${sqlListe(STATUTS_CANDIDATURE)})),
  raison_echec TEXT,
  date TEXT,
  plateforme TEXT,
  interet TEXT CHECK (interet IS NULL OR interet IN (${sqlListe(INTERETS_CANDIDATURE)})),
  notes TEXT,
  offre_id TEXT REFERENCES offres (id_offre) ON DELETE SET NULL,
  maj_locale INTEGER NOT NULL DEFAULT 0,
  mode_envoi TEXT NOT NULL DEFAULT '',
  cv TEXT NOT NULL DEFAULT '',
  lettre INTEGER NOT NULL DEFAULT 0,
  lieux TEXT NOT NULL DEFAULT '[]',
  lien TEXT NOT NULL DEFAULT '',
  enseignements TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS taches (
  id TEXT PRIMARY KEY,
  candidature_id TEXT REFERENCES candidatures (id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  echeance TEXT NOT NULL DEFAULT '',
  faite INTEGER NOT NULL DEFAULT 0,
  creee TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS taches_candidature ON taches (candidature_id);
CREATE TABLE IF NOT EXISTS echanges (
  id TEXT PRIMARY KEY,
  candidature_id TEXT NOT NULL REFERENCES candidatures (id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT '',
  heure TEXT NOT NULL DEFAULT '',
  canal TEXT NOT NULL DEFAULT '',
  sens TEXT NOT NULL DEFAULT '',
  resume TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS echanges_candidature ON echanges (candidature_id);
CREATE TABLE IF NOT EXISTS competences (
  id TEXT PRIMARY KEY,
  domaine TEXT NOT NULL DEFAULT '',
  competence TEXT NOT NULL,
  enseigner INTEGER,
  executer INTEGER,
  note TEXT NOT NULL DEFAULT '',
  valide INTEGER NOT NULL DEFAULT 0,
  ordre REAL NOT NULL DEFAULT 0,
  poids TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS formations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'titre_pro',
  titre TEXT NOT NULL,
  etablissement TEXT NOT NULL DEFAULT '',
  lieu TEXT NOT NULL DEFAULT '',
  debut TEXT NOT NULL DEFAULT '',
  fin TEXT NOT NULL DEFAULT '',
  matieres TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  ordre REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS experiences (
  id TEXT PRIMARY KEY,
  poste TEXT NOT NULL,
  employeur TEXT NOT NULL DEFAULT '',
  lieu TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'salarie',
  categorie TEXT NOT NULL DEFAULT 'autre',
  debut TEXT NOT NULL DEFAULT '',
  fin TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  ordre REAL NOT NULL DEFAULT 0,
  intitules TEXT NOT NULL DEFAULT '{}',
  poids TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS experience_competences (
  experience_id TEXT NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  competence_id TEXT NOT NULL REFERENCES competences (id) ON DELETE CASCADE,
  PRIMARY KEY (experience_id, competence_id)
);
CREATE INDEX IF NOT EXISTS experience_competences_competence ON experience_competences (competence_id);
CREATE TABLE IF NOT EXISTS projets (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'perso',
  debut TEXT NOT NULL DEFAULT '',
  ia TEXT NOT NULL DEFAULT '',
  technologies TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  ordre REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS projet_competences (
  projet_id TEXT NOT NULL REFERENCES projets (id) ON DELETE CASCADE,
  competence_id TEXT NOT NULL REFERENCES competences (id) ON DELETE CASCADE,
  PRIMARY KEY (projet_id, competence_id)
);
CREATE INDEX IF NOT EXISTS projet_competences_competence ON projet_competences (competence_id);
CREATE TABLE IF NOT EXISTS offre_competences (
  id_offre TEXT PRIMARY KEY,
  candidature_id TEXT REFERENCES candidatures (id) ON DELETE SET NULL,
  version INTEGER NOT NULL,
  hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  modele TEXT NOT NULL,
  date TEXT NOT NULL,
  duree_ms INTEGER NOT NULL,
  items TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS offre_competences_candidature ON offre_competences (candidature_id);
CREATE TABLE IF NOT EXISTS formation_competences (
  formation_id TEXT NOT NULL REFERENCES formations (id) ON DELETE CASCADE,
  competence_id TEXT NOT NULL REFERENCES competences (id) ON DELETE CASCADE,
  PRIMARY KEY (formation_id, competence_id)
);
CREATE INDEX IF NOT EXISTS formation_competences_competence ON formation_competences (competence_id);
CREATE TABLE IF NOT EXISTS cv_references (
  id TEXT PRIMARY KEY,
  fichier TEXT NOT NULL DEFAULT '',
  importe_le TEXT NOT NULL,
  pages INTEGER NOT NULL DEFAULT 0,
  texte TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cv_versions (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  cible TEXT NOT NULL DEFAULT 'general',
  categorie TEXT NOT NULL DEFAULT '',
  offre_id TEXT REFERENCES offres (id_offre) ON DELETE SET NULL,
  candidature_id TEXT REFERENCES candidatures (id) ON DELETE SET NULL,
  reference_id TEXT REFERENCES cv_references (id) ON DELETE SET NULL,
  cree_le TEXT NOT NULL,
  ecarts INTEGER NOT NULL DEFAULT 0,
  avertissements INTEGER NOT NULL DEFAULT 0,
  contenu TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lettre_brouillons (
  cle TEXT PRIMARY KEY,
  offre_id TEXT REFERENCES offres (id_offre) ON DELETE SET NULL,
  candidature_id TEXT REFERENCES candidatures (id) ON DELETE SET NULL,
  objet TEXT NOT NULL DEFAULT '',
  destinataire TEXT NOT NULL DEFAULT '',
  texte TEXT NOT NULL DEFAULT '',
  matrice TEXT NOT NULL DEFAULT '{}',
  origine TEXT NOT NULL DEFAULT 'utilisateur',
  maj_le TEXT NOT NULL,
  generation TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS lettre_versions (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  offre_id TEXT REFERENCES offres (id_offre) ON DELETE SET NULL,
  candidature_id TEXT REFERENCES candidatures (id) ON DELETE SET NULL,
  cree_le TEXT NOT NULL,
  ecarts INTEGER NOT NULL DEFAULT 0,
  avertissements INTEGER NOT NULL DEFAULT 0,
  contenu TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  prenom TEXT NOT NULL DEFAULT '',
  nom TEXT NOT NULL DEFAULT '',
  fonction TEXT NOT NULL DEFAULT '',
  entreprise TEXT NOT NULL DEFAULT '',
  adresse TEXT NOT NULL DEFAULT '',
  telephone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  cree TEXT NOT NULL DEFAULT '',
  couleur TEXT NOT NULL DEFAULT '' CHECK (couleur IN (${sqlListe(COULEURS_CONTACT)})),
  epingle INTEGER NOT NULL DEFAULT 0 CHECK (epingle IN (0, 1)),
  sans_telephone INTEGER NOT NULL DEFAULT 0 CHECK (sans_telephone IN (0, 1)),
  sans_email INTEGER NOT NULL DEFAULT 0 CHECK (sans_email IN (0, 1)),
  CHECK (prenom <> '' OR nom <> '')
);
CREATE INDEX IF NOT EXISTS contacts_entreprise ON contacts (entreprise COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS contact_offres (
  contact_id TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  offre_id TEXT NOT NULL REFERENCES offres (id_offre) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, offre_id)
);
CREATE INDEX IF NOT EXISTS contact_offres_offre ON contact_offres (offre_id);
CREATE TABLE IF NOT EXISTS contact_candidatures (
  contact_id TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  candidature_id TEXT NOT NULL REFERENCES candidatures (id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, candidature_id)
);
CREATE INDEX IF NOT EXISTS contact_candidatures_candidature ON contact_candidatures (candidature_id);
CREATE TABLE IF NOT EXISTS rendez_vous (
  id TEXT PRIMARY KEY,
  titre TEXT NOT NULL DEFAULT '',
  debut TEXT NOT NULL,
  duree INTEGER NOT NULL DEFAULT 60 CHECK (duree BETWEEN 5 AND 1440),
  type TEXT NOT NULL DEFAULT 'autre' CHECK (type IN ('telephone', 'visio', 'sur_place', 'autre')),
  lieu TEXT NOT NULL DEFAULT '',
  lien_visio TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  offre_id TEXT REFERENCES offres (id_offre) ON DELETE SET NULL,
  candidature_id TEXT REFERENCES candidatures (id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES contacts (id) ON DELETE SET NULL,
  google_id TEXT,
  synchro TEXT NOT NULL DEFAULT 'a_envoyer' CHECK (synchro IN ('ok', 'a_envoyer', 'erreur', 'annule')),
  cree TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS rendez_vous_debut ON rendez_vous (debut);
CREATE INDEX IF NOT EXISTS rendez_vous_offre ON rendez_vous (offre_id);
CREATE INDEX IF NOT EXISTS rendez_vous_candidature ON rendez_vous (candidature_id);
CREATE INDEX IF NOT EXISTS rendez_vous_contact ON rendez_vous (contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS rendez_vous_google ON rendez_vous (google_id) WHERE google_id IS NOT NULL;
`;

export function ouvrirBase(chemin) {
  const db = new DatabaseSync(chemin);
  // NOTE: clés étrangères actives sur cette connexion ; les tables de liaison et rendez_vous en déclarent (les liens plus anciens sont vérifiés par server.mjs)
  db.exec('PRAGMA foreign_keys = ON');
  // ANCHOR: rendez_vous créée par une version de travail du schéma v11 (sans clés étrangères, google_id obligatoire) : recréée si elle est vide, sinon laissée telle quelle
  const ancienne = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'rendez_vous'").get();
  if (ancienne && !/REFERENCES/.test(String(ancienne.sql)) && db.prepare('SELECT COUNT(*) n FROM rendez_vous').get()?.n === 0) db.exec('DROP TABLE rendez_vous');
  db.exec(SCHEMA_SQL);
  migrer(db, chemin);
  // NOTE: index hors version du schéma (IF NOT EXISTS) : tri et fenêtre par date, lien offre et candidature (sous-requête de lecture des offres, purge)
  db.exec(`CREATE INDEX IF NOT EXISTS offres_date ON offres (date_detection);
  CREATE INDEX IF NOT EXISTS candidatures_offre ON candidatures (offre_id);`);
  ouvrirJournal(db);
  return db;
}

// NOTE: ancien texte libre des années : dates lues, précision (organisme) dans l'établissement s'il est vide, texte illisible dans la remarque
function repartirAnnees(annees, etablissement, note) {
  const p = lireAnnees(String(annees ?? ''));
  const etab = String(etablissement ?? '');
  const n = String(note ?? '');
  const illisible = !p.debut && !p.fin;
  return {
    debut: p.debut, fin: p.fin,
    etablissement: etab || (illisible ? '' : p.reste),
    note: illisible || etab ? [n, p.reste].filter(Boolean).join(' ') : n,
  };
}

// Ajoute les colonnes manquantes d'une base créée par une version précédente, puis reprend les anciennes données
function migrer(db, chemin) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version >= VERSION_SCHEMA) return;
  const colonnes = t => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name));
  const offres = colonnes('offres');
  const candidatures = colonnes('candidatures');
  const echanges = colonnes('echanges');
  const formations = colonnes('formations');
  const contactsCol = colonnes('contacts');
  const experiencesCol = colonnes('experiences');
  const lettreCol = colonnes('lettre_brouillons');
  const competencesCol = colonnes('competences');
  const kvParcours = db.prepare("SELECT cle, valeur FROM kv WHERE cle IN ('skills', 'titres')").all();
  const aMigrer = kvParcours.length > 0 || offres.has('directe_ft') || !offres.has('vue') || !offres.has('expiree') || !offres.has('source') || !offres.has('annonce') || !offres.has('epinglee_le') || !candidatures.has('mode_envoi') || !candidatures.has('lieux') || !candidatures.has('lien') || !candidatures.has('enseignements') || !echanges.has('heure') || (version >= 7 && version < 9) || formations.has('annees') || !contactsCol.has('couleur') || !contactsCol.has('epingle') || !contactsCol.has('sans_telephone') || !contactsCol.has('sans_email') || contactsCol.has('sans_coordonnees') || !experiencesCol.has('intitules') || !experiencesCol.has('poids') || !lettreCol.has('generation') || (competencesCol.size > 0 && !competencesCol.has('poids')) || (formations.size > 0 && !formations.has('lieu'));
  // NOTE: v26 ne modifie pas la structure mais renomme des clés : copie aussi, seulement s'il y a des clés angle: à renommer
  const clesARenommer = version < 26 && lettreCol.size > 0 && Boolean(db.prepare("SELECT 1 FROM lettre_brouillons WHERE cle LIKE 'angle:%' LIMIT 1").get());
  // NOTE: v30 ramène à « utilisateur » toute origine de lettre ancienne (le prénom de l'utilisateur, avant la version publique) : copie aussi, seulement s'il y a des lignes à renommer
  const originesARenommer = version < 30 && lettreCol.size > 0 && Boolean(db.prepare("SELECT 1 FROM lettre_brouillons WHERE origine NOT IN ('qwen', 'claude', 'utilisateur') LIMIT 1").get());
  // NOTE: copie complète avant la première modification de structure (VACUUM INTO donne une copie cohérente)
  if ((aMigrer || clesARenommer || originesARenommer) && chemin !== ':memory:') {
    const dossier = join(dirname(chemin), 'data', 'backups');
    mkdirSync(dossier, { recursive: true });
    const copie = join(dossier, `suivi-avant-schema-v${VERSION_SCHEMA}-${Date.now()}.db`);
    db.prepare('VACUUM INTO ?').run(copie);
  }
  db.exec('BEGIN');
  try {
    const ajouter = (table, existantes, def) => { if (!existantes.has(def.split(' ')[0])) db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`); };
    ajouter('offres', offres, 'vue INTEGER NOT NULL DEFAULT 0');
    ajouter('offres', offres, 'expiree INTEGER NOT NULL DEFAULT 0');
    ajouter('offres', offres, "source TEXT NOT NULL DEFAULT 'France Travail'");
    ajouter('offres', offres, "postuler_via TEXT NOT NULL DEFAULT ''");
    ajouter('offres', offres, "description TEXT NOT NULL DEFAULT ''");
    ajouter('offres', offres, "annonce TEXT NOT NULL DEFAULT ''");
    ajouter('candidatures', candidatures, "mode_envoi TEXT NOT NULL DEFAULT ''");
    ajouter('candidatures', candidatures, "cv TEXT NOT NULL DEFAULT ''");
    // ANCHOR: v21, offre épinglée (date d'épinglage AAAA-MM-JJ, vide si non épinglée), protégée de la purge pendant JOURS_EPINGLE jours
    ajouter('offres', offres, "epinglee_le TEXT NOT NULL DEFAULT ''");
    ajouter('candidatures', candidatures, 'lettre INTEGER NOT NULL DEFAULT 0');
    ajouter('candidatures', candidatures, "lieux TEXT NOT NULL DEFAULT '[]'");
    // ANCHOR: v16, lien de candidature (adresse du formulaire ou de l'annonce d'envoi), vide par défaut donc ajout sans reconstruire la table
    ajouter('candidatures', candidatures, "lien TEXT NOT NULL DEFAULT ''");
    // ANCHOR: v14, couleur d'un contact (CHECK sur la liste fermée, valeur par défaut vide donc ajout possible sans reconstruire la table)
    // ANCHOR: v15, contact épinglé (0 ou 1), remonté en tête de la liste des contacts
    ajouter('contacts', contactsCol, 'epingle INTEGER NOT NULL DEFAULT 0 CHECK (epingle IN (0, 1))');
    ajouter('contacts', contactsCol, `couleur TEXT NOT NULL DEFAULT '' CHECK (couleur IN (${sqlListe(COULEURS_CONTACT)}))`);
    // ANCHOR: v18, téléphone ou email impossible à obtenir (ex. France Travail) : case cochée par champ, saisie bloquée et avertissement levé. Remplace la colonne unique sans_coordonnees de la v17, dont la valeur est reprise dans les deux
    ajouter('contacts', contactsCol, 'sans_telephone INTEGER NOT NULL DEFAULT 0 CHECK (sans_telephone IN (0, 1))');
    ajouter('contacts', contactsCol, 'sans_email INTEGER NOT NULL DEFAULT 0 CHECK (sans_email IN (0, 1))');
    if (contactsCol.has('sans_coordonnees')) {
      db.exec('UPDATE contacts SET sans_telephone = sans_coordonnees, sans_email = sans_coordonnees');
      db.exec('ALTER TABLE contacts DROP COLUMN sans_coordonnees');
    }
    ajouter('echanges', echanges, "heure TEXT NOT NULL DEFAULT ''");
    ajouter('formations', formations, "debut TEXT NOT NULL DEFAULT ''");
    ajouter('formations', formations, "fin TEXT NOT NULL DEFAULT ''");
    // ANCHOR: v22, intitulé du poste par métier visé (JSON { métier: intitulé }), lu par le CV
    ajouter('experiences', experiencesCol, "intitules TEXT NOT NULL DEFAULT '{}'");
    // ANCHOR: v24, poids des puces par métier (JSON { puce normalisée: { métier: 0 à 3 } }), lu par le tri des puces du CV
    ajouter('experiences', experiencesCol, "poids TEXT NOT NULL DEFAULT '{}'");
    // ANCHOR: v25, trace de la dernière génération du texte (JSON : modele, duree_ms, declencheur, le), vide pour un texte jamais généré
    ajouter('lettre_brouillons', lettreCol, "generation TEXT NOT NULL DEFAULT '{}'");
    // ANCHOR: v27, poids des compétences par métier (JSON { métier: 0 à 3 }), vide = comportement par niveau seul
    if (competencesCol.size > 0) ajouter('competences', competencesCol, "poids TEXT NOT NULL DEFAULT '{}'");
    // ANCHOR: v28, ville et département d'un établissement de formation (texte libre, ex. « Marseille (13) »), repris par le CV et la lettre
    if (formations.size > 0) ajouter('formations', formations, "lieu TEXT NOT NULL DEFAULT ''");
    // ANCHOR: v29, enseignements tirés d'une réponse (refus, silence, entretien) : texte libre rattaché à la candidature, donc à la version de CV envoyée
    ajouter('candidatures', candidatures, "enseignements TEXT NOT NULL DEFAULT ''");
    // ANCHOR: directe_ft (1 directe, 0 redirigée) devient postuler_via, puis disparaît
    if (offres.has('directe_ft')) {
      db.exec(`UPDATE offres SET postuler_via = CASE directe_ft WHEN 1 THEN 'France Travail' WHEN 0 THEN 'Autre site' ELSE postuler_via END`);
      db.exec('ALTER TABLE offres DROP COLUMN directe_ft');
    }
    // ANCHOR: v7, compétences et titres quittent le kv (JSON) pour leurs tables, ids et ordre conservés, puis les clés kv disparaissent (pas de double source)
    const lireJson = cle => { try { const l = kvParcours.find(x => x.cle === cle); const v = l ? JSON.parse(String(l.valeur)) : []; return Array.isArray(v) ? v : []; } catch { return []; } };
    const niveau = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const insComp = db.prepare('INSERT OR IGNORE INTO competences (id, domaine, competence, enseigner, executer, note, valide, ordre) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    lireJson('skills').forEach((c, i) => { if (c?.id && c.competence) insComp.run(String(c.id), String(c.domaine ?? ''), String(c.competence), niveau(c.enseigner), niveau(c.executer), String(c.note ?? ''), c.valide === true ? 1 : 0, i); });
    const insForm = db.prepare("INSERT OR IGNORE INTO formations (id, type, titre, etablissement, debut, fin, matieres, note, ordre) VALUES (?, 'titre_pro', ?, ?, ?, ?, ?, ?, ?)");
    lireJson('titres').forEach((t, i) => {
      if (!t?.id) return;
      const r = repartirAnnees(t.annees, t.etablissement, t.note);
      insForm.run(String(t.id), String(t.titre ?? ''), r.etablissement, r.debut, r.fin, String(t.matieres ?? ''), r.note, i);
    });
    db.exec("DELETE FROM kv WHERE cle IN ('skills', 'titres')");
    // NOTE: v8 n'ajoute que les tables cv_references et cv_versions (créées par ouvrirBase), rien à reprendre
    // NOTE: v11 n'ajoute que les tables contacts, contact_offres et rendez_vous (créées par ouvrirBase), rien à reprendre
    // ANCHOR: v9, les matières enseignées (texte libre) deviennent des liens vers les compétences ; ce qui ne correspond pas sans ambiguïté reste dans matieres, à reclasser
    if (version < 9) {
      const comps = db.prepare('SELECT id, competence FROM competences').all().map(c => ({ id: String(c.id), competence: String(c.competence) }));
      const insLien = db.prepare('INSERT OR IGNORE INTO formation_competences (formation_id, competence_id) VALUES (?, ?)');
      const majReste = db.prepare('UPDATE formations SET matieres = ? WHERE id = ?');
      for (const f of db.prepare("SELECT id, matieres FROM formations WHERE matieres <> ''").all()) {
        const { ids, reste } = lierMatieres(String(f.matieres), comps);
        for (const c of ids) insLien.run(String(f.id), c);
        majReste.run(reste.join(', '), String(f.id));
      }
    }
    // ANCHOR: v10, le texte libre annees devient debut et fin (AAAA ou AAAA-MM) ; ce qui n'est pas lisible passe dans l'organisme s'il est vide, sinon dans la remarque, rien n'est perdu
    if (formations.has('annees')) {
      const maj = db.prepare('UPDATE formations SET debut = ?, fin = ?, etablissement = ?, note = ? WHERE id = ?');
      for (const f of db.prepare("SELECT id, annees, etablissement, note FROM formations WHERE annees <> '' AND debut = '' AND fin = ''").all()) {
        const r = repartirAnnees(f.annees, f.etablissement, f.note);
        maj.run(r.debut, r.fin, r.etablissement, r.note, String(f.id));
      }
      db.exec('ALTER TABLE formations DROP COLUMN annees');
    }
    if (version < 11) db.exec('PRAGMA user_version = 11');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  migrerV12(db, chemin);
  // ANCHOR: v13, contact_candidatures (contact relié directement à une candidature, sans passer par une offre) : table créée par ouvrirBase, rien à reprendre
  if (db.prepare('PRAGMA user_version').get().user_version < 13) db.exec('PRAGMA user_version = 13');
  if (db.prepare('PRAGMA user_version').get().user_version < 15) db.exec('PRAGMA user_version = 15');
  if (db.prepare('PRAGMA user_version').get().user_version < 16) db.exec('PRAGMA user_version = 16');
  if (db.prepare('PRAGMA user_version').get().user_version < 17) db.exec('PRAGMA user_version = 17');
  if (db.prepare('PRAGMA user_version').get().user_version < 18) db.exec('PRAGMA user_version = 18');
  // ANCHOR: v19, projets et projet_competences (portfolio relié aux compétences) : tables créées par ouvrirBase, rien à reprendre
  if (db.prepare('PRAGMA user_version').get().user_version < 19) db.exec('PRAGMA user_version = 19');
  // ANCHOR: v20, offre_competences (compétences repérées par le modèle dans l'annonce, gardées avec la candidature) : table créée par ouvrirBase, rien à reprendre
  if (db.prepare('PRAGMA user_version').get().user_version < 20) db.exec('PRAGMA user_version = 20');
  // ANCHOR: v21, colonne offres.epinglee_le ajoutée plus haut avec les autres colonnes
  if (db.prepare('PRAGMA user_version').get().user_version < 21) db.exec('PRAGMA user_version = 21');
  // ANCHOR: v22, colonne experiences.intitules ajoutée plus haut (ANCHOR v22 de la liste des colonnes)
  if (db.prepare('PRAGMA user_version').get().user_version < 22) db.exec('PRAGMA user_version = 22');
  // ANCHOR: v23, tables lettre_brouillons et lettre_versions (créées par ouvrirBase), rien à reprendre
  if (db.prepare('PRAGMA user_version').get().user_version < 23) db.exec('PRAGMA user_version = 23');
  // ANCHOR: v24, colonne experiences.poids ajoutée plus haut (ANCHOR v24 de la liste des colonnes)
  if (db.prepare('PRAGMA user_version').get().user_version < 24) db.exec('PRAGMA user_version = 24');
  // ANCHOR: v25, colonne lettre_brouillons.generation ajoutée plus haut (ANCHOR v25 de la liste des colonnes)
  if (db.prepare('PRAGMA user_version').get().user_version < 25) db.exec('PRAGMA user_version = 25');
  // ANCHOR: v26, vocabulaire : les clés des lettres génériques passent de angle:<métier> à metier:<métier> (le mot angle n'est plus employé)
  if (version < 26) {
    // NOTE: une clé metier: déjà présente l'emporte (OR IGNORE), l'ancienne clé angle: restante est retirée
    db.exec("UPDATE OR IGNORE lettre_brouillons SET cle = 'metier:' || substr(cle, 7) WHERE cle LIKE 'angle:%'");
    db.exec("DELETE FROM lettre_brouillons WHERE cle LIKE 'angle:%'");
    db.exec('PRAGMA user_version = 26');
  }
  // ANCHOR: v27, colonne competences.poids ajoutée plus haut (ANCHOR v27 de la liste des colonnes)
  if (db.prepare('PRAGMA user_version').get().user_version < 27) db.exec('PRAGMA user_version = 27');
  // ANCHOR: v28, colonne formations.lieu ajoutée plus haut (ANCHOR v28 de la liste des colonnes)
  if (db.prepare('PRAGMA user_version').get().user_version < 28) db.exec('PRAGMA user_version = 28');
  // ANCHOR: v29, colonne candidatures.enseignements ajoutée plus haut (ANCHOR v29 de la liste des colonnes)
  if (db.prepare('PRAGMA user_version').get().user_version < 29) db.exec('PRAGMA user_version = 29');
  // ANCHOR: v30, origine des lettres : l'ancienne valeur (le prénom) devient « utilisateur » (aucune ligne supprimée, seule l'étiquette change)
  if (db.prepare('PRAGMA user_version').get().user_version < 30) {
    db.exec("UPDATE lettre_brouillons SET origine = 'utilisateur' WHERE origine NOT IN ('qwen', 'claude', 'utilisateur')");
    db.exec('PRAGMA user_version = 30');
  }
}

// ANCHOR: v12, liens et valeurs contrôlés par la base : clés étrangères sur candidatures.offre_id, taches, echanges, cv_versions et analyses, CHECK sur les statuts, intérêts et catégories, liens vides remplacés par NULL.
// NOTE: SQLite ne sait pas ajouter une contrainte à une table existante : chaque table est reconstruite (copie, suppression, renommage) sur le modèle du schéma neuf, clés étrangères suspendues pendant l'opération puis vérifiées (foreign_key_check) avant de valider. Copie de la base avant.
export const DDL_ANALYSES = `CREATE TABLE IF NOT EXISTS analyses (
  id_offre TEXT PRIMARY KEY REFERENCES offres (id_offre) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  modele TEXT NOT NULL,
  date TEXT NOT NULL,
  duree_ms INTEGER NOT NULL,
  reponses TEXT NOT NULL
)`;

function migrerV12(db, chemin) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version >= 12) return;
  const sqlDe = t => String(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)?.sql ?? '');
  const modele = new DatabaseSync(':memory:');
  modele.exec(SCHEMA_SQL);
  modele.exec(DDL_ANALYSES);
  try {
    // table -> motif absent dans l'ancienne définition, expression de copie par colonne (sinon la colonne telle quelle)
    const existe = id => `${id} IN (SELECT id FROM candidatures)`;
    /** @type {[string, RegExp, Record<string, string>, string][]} */
    const complet = [
      ['offres', /CHECK/, { categorie: `CASE WHEN categorie IN (${sqlListe(CATEGORIES_OFFRE)}) THEN categorie ELSE 'autre' END` }, ''],
      ['candidatures', /CHECK/, {
        statut: `CASE WHEN statut IN (${sqlListe(STATUTS_CANDIDATURE)}) THEN statut END`,
        interet: `CASE WHEN interet IN (${sqlListe(INTERETS_CANDIDATURE)}) THEN interet ELSE '' END`,
        offre_id: 'CASE WHEN offre_id IN (SELECT id_offre FROM offres) THEN offre_id END',
      }, ''],
      ['taches', /REFERENCES/, { candidature_id: `CASE WHEN ${existe('candidature_id')} THEN candidature_id END` }, ''],
      ['echanges', /REFERENCES/, {}, `WHERE ${existe('candidature_id')}`],
      ['cv_versions', /REFERENCES/, {
        offre_id: "CASE WHEN offre_id IN (SELECT id_offre FROM offres) THEN offre_id END",
        candidature_id: `CASE WHEN ${existe('candidature_id')} THEN candidature_id END`,
        reference_id: 'CASE WHEN reference_id IN (SELECT id FROM cv_references) THEN reference_id END',
      }, ''],
      ['analyses', /REFERENCES/, {}, 'WHERE id_offre IN (SELECT id_offre FROM offres)'],
    ];
    const plan = complet.filter(([t, motif]) => { const sql = sqlDe(t); return sql && !motif.test(sql); });
    if (plan.length === 0) { db.exec('PRAGMA user_version = 12'); return; }
    if (chemin !== ':memory:') {
      const dossier = join(dirname(chemin), 'data', 'backups');
      mkdirSync(dossier, { recursive: true });
      db.prepare('VACUUM INTO ?').run(join(dossier, `suivi-avant-schema-v12-${Date.now()}.db`));
    }
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      for (const [table, , expressions, filtre] of plan) {
        const modeleSql = modele.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)?.sql;
        const colonnes = modele.prepare(`PRAGMA table_info(${table})`).all().map(c => String(c.name));
        db.exec(String(modeleSql).replace(/^CREATE TABLE (IF NOT EXISTS )?"?\w+"?/, `CREATE TABLE ${table}_neuf`));
        db.exec(`INSERT INTO ${table}_neuf (${colonnes.join(', ')}) SELECT ${colonnes.map(c => expressions[c] ?? c).join(', ')} FROM ${table} ${filtre}`);
        db.exec(`DROP TABLE ${table}`);
        db.exec(`ALTER TABLE ${table}_neuf RENAME TO ${table}`);
        for (const i of modele.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").all(table)) db.exec(String(i.sql));
      }
      const fautes = db.prepare('PRAGMA foreign_key_check').all();
      if (fautes.length) throw new Error(`Migration v12 annulée : ${fautes.length} lien(s) invalide(s) (${fautes[0].table}).`);
      db.exec('PRAGMA user_version = 12');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  } finally {
    modele.close();
  }
}

// ANCHOR: rattache chaque matière (liste séparée par des virgules) à une compétence : nom qui commence par la matière, sinon qui la contient comme mot ;
// une seule candidate exigée, sinon la matière reste dans reste (jamais de lien deviné)
/** @param {string} matieres @param {{ id: string, competence: string }[]} competences @returns {{ ids: string[], reste: string[] }} */
export function lierMatieres(matieres, competences) {
  const ids = [];
  const reste = [];
  const noms = competences.map(c => ({ id: c.id, nom: norm(c.competence) }));
  for (const brute of matieres.split(',').map(m => m.trim()).filter(Boolean)) {
    const m = norm(brute.replace(/\s*\(.*$/, '')).trim();
    const echappee = m.replace(/[.*+?^$()|[\]{}\\/]/g, '\\$&');
    const mot = new RegExp('(^|[^a-z0-9])' + echappee + '([^a-z0-9]|$)');
    let trouvees = m ? noms.filter(c => c.nom.startsWith(m)) : [];
    if (trouvees.length !== 1 && m) trouvees = noms.filter(c => mot.test(c.nom));
    if (trouvees.length === 1) { if (!ids.includes(trouvees[0].id)) ids.push(trouvees[0].id); } else reste.push(brute);
  }
  return { ids, reste };
}


// NOTE: intitulés écartés par l'app même s'ils ne sont pas dans la table exclusions de n8n
export const EXCLUS_TOUJOURS = ['gerant', 'directeur', 'directrice', 'expert-comptable', 'expert comptable'];

// Lignes de la table exclusions (actives) vers la liste de mots à écarter, plus les intitulés toujours écartés
export function motsExclus(lignes) {
  return lignes
    .filter(e => e.actif === 'checked' && e.type === 'mot_intitule')
    .map(e => norm(e.valeur))
    .concat(EXCLUS_TOUJOURS);
}

// ANCHOR: zone « proche » configurable dans le .env (SUIVI_DEPARTEMENT_PROCHE : code du département, SUIVI_VILLES_PROCHES : villes séparées par des virgules), lue à chaque appel car le .env se charge après les imports. Sans réglage, aucune offre n'est « proche ».
const villesProches = () => (process.env.SUIVI_VILLES_PROCHES ?? '').split(',').map(x => norm(x).trim()).filter(Boolean);

// 1 si la ville fait partie des villes proches du département proche configuré
export const estProche = (dep, ville) => {
  const departement = (process.env.SUIVI_DEPARTEMENT_PROCHE ?? '').trim();
  return departement && dep === departement && villesProches().some(x => norm(ville).includes(x)) ? 1 : 0;
};

// ANCHOR: sécurité, un lien d'offre ne peut être qu'une adresse http(s) (jamais javascript: ni data:), sinon chaîne vide
export const lienHttp = lien => (typeof lien === 'string' && /^https?:\/\/\S+$/i.test(lien.trim()) ? lien.trim() : '');

// brutes : lignes au format de la table offres_emploi (id_offre, titre, entreprise, lieu, type_de_contrat, salaire, lien, date_de_detection, description)
// NOTE: plateforme (nom de la source de l'offre) n'est enregistrée qu'à la création, la synchro ne la réécrit pas ensuite
// zones : codes départements actifs, exclusions : mots déjà normalisés (motsExclus)
export function fusionnerOffres(db, brutes, { zones, exclusions, joursMax = JOURS_MAX }) {
  const limite = new Date(Date.now() - joursMax * 864e5).toISOString().slice(0, 10);
  const ins = db.prepare(`
INSERT INTO offres (id_offre, titre, entreprise, lieu, departement, ville, proche, contrat, salaire, lien, date_detection, categorie, annonce, source)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id_offre) DO UPDATE SET titre=excluded.titre, entreprise=excluded.entreprise, lieu=excluded.lieu,
  departement=excluded.departement, ville=excluded.ville, proche=excluded.proche, contrat=excluded.contrat,
  salaire=excluded.salaire, lien=excluded.lien, date_detection=excluded.date_detection, categorie=excluded.categorie,
  annonce=CASE WHEN excluded.annonce != '' THEN excluded.annonce ELSE offres.annonce END`);
  const existantes = new Set(db.prepare('SELECT id_offre FROM offres').all().map(r => r.id_offre));
  const stats = { total: brutes.length, vides: 0, hors_zone: 0, anciennes: 0, exclues: 0, retenues: 0, nouvelles: 0 };
  const parCat = {};
  db.exec('BEGIN');
  try {
    for (const o of brutes) {
      if (!o.titre || !o.id_offre) { stats.vides++; continue; }
      const date = o.date_de_detection ?? '';
      if (date < limite) { stats.anciennes++; continue; }
      const lieu = o.lieu ?? '';
      const [dep, ...v] = lieu.split(' - ');
      if (!zones.includes(dep.trim())) { stats.hors_zone++; continue; }
      const tn = norm(o.titre);
      if (exclusions.some(x => tn.includes(x))) { stats.exclues++; continue; }
      const ville = v.join(' - ').trim();
      const proche = estProche(dep.trim(), ville);
      const cat = classer(o.titre);
      ins.run(String(o.id_offre), o.titre, o.entreprise ?? '', lieu, dep.trim(), ville, proche, o.type_de_contrat ?? '', o.salaire == null ? '' : String(o.salaire), lienHttp(o.lien), date, cat, o.description ?? '', o.plateforme || 'France Travail');
      stats.retenues++;
      if (!existantes.has(String(o.id_offre))) stats.nouvelles++;
      parCat[cat] = (parCat[cat] ?? 0) + 1;
    }
    // Les offres synchronisées devenues trop vieilles sont retirées, sauf si une candidature les référence. Les offres saisies à la main (id man-...) restent.
    db.prepare(`DELETE FROM offres WHERE id_offre NOT LIKE 'man-%' AND date_detection < ? AND ${PROTEGEES}`).run(limite);
    // NOTE: une exclusion ajoutée après coup retire aussi les offres déjà en base, sauf si une candidature les référence
    const libres = db.prepare(`SELECT id_offre, titre FROM offres WHERE id_offre NOT LIKE 'man-%' AND ${PROTEGEES}`).all();
    const suppr = db.prepare('DELETE FROM offres WHERE id_offre = ?');
    stats.retirees = 0;
    for (const o of libres) if (exclusions.some(x => norm(o.titre).includes(x))) { suppr.run(o.id_offre); stats.retirees++; }
    // NOTE: une zone retirée des réglages retire aussi les offres déjà en base de ce département (hors candidatures)
    for (const o of db.prepare(`SELECT id_offre, departement FROM offres WHERE id_offre NOT LIKE 'man-%' AND ${PROTEGEES}`).all()) {
      if (!zones.includes(o.departement)) { suppr.run(o.id_offre); stats.retirees++; }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { stats, parCat };
}

// Offres déjà en base que de nouveaux réglages retireraient (hors candidatures liées et offres manuelles)
function retirables(db, { zones, mots_exclus }) {
  const exclusions = motsExclus(mots_exclus.map(valeur => ({ type: 'mot_intitule', valeur, actif: 'checked' })));
  const libres = db.prepare(`SELECT id_offre, titre, departement FROM offres WHERE id_offre NOT LIKE 'man-%' AND ${PROTEGEES}`).all();
  const horsZone = libres.filter(o => !zones.includes(o.departement));
  const exclues = libres.filter(o => zones.includes(o.departement) && exclusions.some(x => norm(o.titre).includes(x)));
  return { horsZone, exclues };
}

// Aperçu avant enregistrement : combien d'offres seraient retirées
export function offresRetirables(db, reglages) {
  const { horsZone, exclues } = retirables(db, reglages);
  return { hors_zone: horsZone.length, exclues: exclues.length, total: horsZone.length + exclues.length };
}

export function retirerOffres(db, reglages) {
  const { horsZone, exclues } = retirables(db, reglages);
  const suppr = db.prepare('DELETE FROM offres WHERE id_offre = ?');
  db.exec('BEGIN');
  try {
    for (const o of [...horsZone, ...exclues]) suppr.run(o.id_offre);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return horsZone.length + exclues.length;
}

/**
 * Épingles arrivées à échéance : remises à vide, l'offre retombe dans la purge normale. Renvoie les offres concernées (pour le journal).
 * @param {any} db
 * @returns {{ id_offre: string, titre: string, epinglee_le: string }[]}
 */
export function expirerEpingles(db) {
  const echues = db.prepare(`SELECT id_offre, titre, epinglee_le FROM offres WHERE epinglee_le != '' AND epinglee_le <= date('now', 'localtime', '-${JOURS_EPINGLE} days')`).all();
  if (echues.length) db.prepare(`UPDATE offres SET epinglee_le = '' WHERE epinglee_le != '' AND epinglee_le <= date('now', 'localtime', '-${JOURS_EPINGLE} days')`).run();
  return /** @type {any} */ (echues);
}

/**
 * Offres France Travail disparues de la recherche : clôturées, donc marquées expirées (comme à la main, décochables).
 * Épargne les offres liées à une candidature, un contact, un rendez-vous ou épinglées (PROTEGEES), les offres manuelles, les autres sources et les plus anciennes que la fenêtre de recherche.
 * Rien n'est marqué si la liste reçue est vide ou si la part d'absentes dépasse la moitié (au moins 20) : signe d'une recherche anormale, pas de clôtures.
 * @param {any} db
 * @param {string[]} ids numéros reçus de l'API à cette synchro, avant tout filtre local
 * @param {Set<string>} [confirmees] si fourni, seules les absentes confirmées clôturées par le contrôle unitaire sont marquées
 * @returns {{ marquees: number, ignoree: string | null }}
 */
export function expirerDisparues(db, ids, confirmees) {
  const { absentes, ignoree } = disparues(db, ids);
  if (ignoree) return { marquees: 0, ignoree };
  return marquerExpirees(db, confirmees ? absentes.filter(o => confirmees.has(o.id_offre)) : absentes);
}

/**
 * Offres France Travail candidates absentes de la recherche (avant confirmation unitaire), ou le motif d'abandon (vide, volume).
 * @param {any} db
 * @param {string[]} ids
 * @returns {{ absentes: any[], ignoree: string | null }}
 */
export function disparues(db, ids) {
  if (!ids.length) return { absentes: [], ignoree: 'vide' };
  const enLigne = new Set(ids);
  const candidates = db.prepare(`SELECT id_offre, titre FROM offres WHERE source = 'France Travail' AND id_offre NOT LIKE 'man-%' AND expiree = 0 AND date_detection >= date('now', 'localtime', '-${JOURS_RECHERCHE_FT} days') AND ${PROTEGEES}`).all();
  const absentes = /** @type {any[]} */ (candidates).filter(o => !enLigne.has(o.id_offre));
  if (absentes.length >= 20 && absentes.length > candidates.length / 2) return { absentes: [], ignoree: 'volume' };
  return { absentes, ignoree: null };
}

function marquerExpirees(db, absentes) {
  const maj = db.prepare('UPDATE offres SET expiree = 1 WHERE id_offre = ? AND expiree = 0');
  db.exec('BEGIN');
  try {
    for (const o of absentes) {
      maj.run(o.id_offre);
      journaliser(db, { entite: 'offre', id: o.id_offre, libelle: `${o.titre} (clôturée : absente de la recherche France Travail)`, action: 'modification', changements: [{ champ: 'expiree', avant: '0', apres: '1' }] });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { marquees: absentes.length, ignoree: null };
}

/** Offre liée à une candidature, un contact, un rendez-vous ou épinglée : jamais marquée automatiquement */
export function offreProtegee(db, id) {
  return !db.prepare(`SELECT 1 FROM offres WHERE id_offre = ? AND ${PROTEGEES}`).get(id);
}

/**
 * Applique le résultat d'un contrôle unitaire (en_ligne, cloturee, inconnu) : une offre clôturée non protégée est marquée expirée et journalisée,
 * une offre protégée reçoit seulement l'alerte (renvoyée au client). Renvoie null si l'offre est introuvable.
 * @param {any} db
 * @param {string} id
 * @param {string} statut
 * @returns {{ statut: string, protegee: boolean, marquee: boolean } | null}
 */
export function appliquerVerification(db, id, statut) {
  const o = /** @type {any} */ (db.prepare('SELECT id_offre, titre, expiree FROM offres WHERE id_offre = ?').get(id));
  if (!o) return null;
  const protegee = offreProtegee(db, id);
  if (statut !== 'cloturee' || protegee || o.expiree) return { statut, protegee, marquee: false };
  db.prepare('UPDATE offres SET expiree = 1 WHERE id_offre = ?').run(id);
  journaliser(db, { entite: 'offre', id, libelle: `${o.titre} (clôturée : n'est plus en ligne sur France Travail)`, action: 'modification', changements: [{ champ: 'expiree', avant: '0', apres: '1' }] });
  return { statut, protegee, marquee: true };
}

