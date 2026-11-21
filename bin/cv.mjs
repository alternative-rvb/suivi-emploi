// Usage : npm run cv -- [--profil p-xxxxxxxx] [--cible general|metier|offre] [--categorie comptabilite] [--offre ID] [--document doc.json] [--json] [--sortie fichier.pdf]
// Secours quand le serveur est arrêté : lit suivi.db en lecture seule, compose (ou reprend --document, personnalisé), contrôle contre le CV de référence et écrit le PDF.
// Aucune version n'est enregistrée : la refaire depuis l'app (Profil > CV) ou par POST /api/cv/pdf une fois le serveur relancé.
// --json : affiche le document et son contrôle sans écrire de PDF (point de départ d'une personnalisation).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { composerCvPages } from '../lib/cv-pages.mjs';
import { CHAMPS_CONTACT, controlerCv, ErreurCv, nomCv, prioritairesOffre, texteProfil, validerDocument } from '../lib/cv.mjs';
import { cvPdf } from '../lib/cv-pdf.mjs';
import { lirePhoto } from '../lib/photo.mjs';
import { avecProfil, cheminDossierProfil } from '../lib/profils.mjs';
import { metiersDuProfil } from '../lib/metiers-profil.mjs';
import { classerProfil } from '../lib/metiers.mjs';

// NOTE: les commandes sont dans bin/ ; la base, le .env et data/ sont à la racine du projet
const ici = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = nom => args.includes(`--${nom}`);
const valeur = nom => (args.includes(`--${nom}`) ? args[args.indexOf(`--${nom}`) + 1] : undefined);
/** @type {(message: string) => never} */
const stop = message => { console.error(message); process.exit(1); };

const chemin = join(ici, 'suivi.db');
if (!existsSync(chemin)) stop(`Base introuvable : ${chemin}`);
// NOTE: lecture seule, la base peut être ouverte par le serveur en même temps
const db = new DatabaseSync(chemin, { readOnly: true });
const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
if (version < 31) stop(`Base en version ${version} : lancez le serveur une fois (npm start) pour la migrer en version 31.`);

// ANCHOR: profil lu : --profil, sinon le profil par défaut de l'installation ; exposé à SQLite comme dans le serveur
const defaut = String(JSON.parse(String(db.prepare("SELECT valeur FROM kv WHERE cle = 'profil_defaut'").get()?.valeur ?? '""')));
const profil = String(valeur('profil') ?? defaut);
if (!db.prepare('SELECT 1 FROM profils WHERE id = ?').get(profil)) stop(`Profil ${profil} introuvable.`);
db.function('profil_actif', () => profil);
const dossier = cheminDossierProfil(ici, profil, defaut);
// NOTE: base ouverte sans ouvrirBase (lecture seule) : les métiers sont lus dans le contexte du profil, sinon profilActif ne connaît pas de profil par défaut
const metiers = avecProfil(profil, () => metiersDuProfil(db));

const reglage = cle => { const r = db.prepare('SELECT valeur FROM profil_reglages WHERE profil_id = profil_actif() AND cle = ?').get(cle); return r ? JSON.parse(String(r.valeur)) : {}; };
const p = reglage('profil');
const liens = new Map();
for (const l of db.prepare('SELECT l.experience_id, l.competence_id FROM experience_competences l JOIN experiences x ON x.id = l.experience_id WHERE x.profil_id = profil_actif()').all()) (liens.get(l.experience_id) ?? liens.set(l.experience_id, []).get(l.experience_id)).push(l.competence_id);
const liensProjets = new Map();
for (const l of version >= 19 ? db.prepare('SELECT l.projet_id, l.competence_id FROM projet_competences l JOIN projets x ON x.id = l.projet_id WHERE x.profil_id = profil_actif()').all() : []) (liensProjets.get(l.projet_id) ?? liensProjets.set(l.projet_id, []).get(l.projet_id)).push(l.competence_id);
const etat = {
  profil: { ...p, contact: Object.fromEntries(CHAMPS_CONTACT.map(k => [k, p.contact?.[k] ?? ''])) },
  competences: db.prepare('SELECT * FROM competences WHERE profil_id = profil_actif() ORDER BY ordre, id').all(),
  formations: db.prepare('SELECT * FROM formations WHERE profil_id = profil_actif() ORDER BY ordre, id').all(),
  // NOTE: les projets servent de preuve de compétence au CV (nombre de projets), version 19 minimum
  projets: version >= 19 ? db.prepare('SELECT id, nom FROM projets WHERE profil_id = profil_actif()').all().map(x => ({ ...x, competences: liensProjets.get(x.id) ?? [] })) : [],
  metiers_perso: metiers.perso,
  experiences: db.prepare("SELECT * FROM experiences WHERE profil_id = profil_actif() ORDER BY fin = '' DESC, fin DESC, debut DESC, ordre, id").all().map(x => ({ ...x, competences: liens.get(x.id) ?? [] })),
};
const reference = String(db.prepare('SELECT texte FROM cv_references WHERE profil_id = profil_actif() ORDER BY importe_le DESC, rowid DESC LIMIT 1').get()?.texte ?? '');

let doc;
try {
  if (valeur('document')) {
    doc = validerDocument(JSON.parse(readFileSync(String(valeur('document')), 'utf8')));
  } else {
    const cible = valeur('cible') ?? (valeur('offre') ? 'offre' : valeur('categorie') ? 'metier' : 'general');
    let categorie = valeur('categorie') ?? '';
    let prioritaires = [];
    /** @type {any} */
    let offre = null;
    if (cible === 'offre') {
      offre = db.prepare('SELECT id_offre, titre, entreprise, categorie, annonce FROM offres WHERE id_offre = ?').get(String(valeur('offre') ?? ''));
      if (!offre) stop(`Offre ${valeur('offre') ?? ''} introuvable.`);
      // NOTE: logiciels relevés par l'analyse s'il y en a ; sans analyse (Ollama en panne), titre et annonce suffisent
      let logiciels = [];
      try { logiciels = JSON.parse(String(db.prepare('SELECT reponses FROM analyses WHERE profil_id = profil_actif() AND id_offre = ?').get(offre.id_offre)?.reponses ?? '{}')).logiciels ?? []; } catch { /* pas d'analyse */ }
      prioritaires = prioritairesOffre(etat.competences, { titre: offre.titre, annonce: [offre.annonce, ...logiciels].join(' ') });
      // NOTE: catégorie vue par le profil (métier créé reconnu dans le titre, sinon sa liste) : « autre » ne cible pas le CV
      const vue = classerProfil(String(offre.titre), String(offre.categorie), metiers.liste, metiers.perso);
      categorie = categorie || (vue !== 'autre' ? vue : '');
    }
    const compose = await composerCvPages(etat, { cible, categorie, prioritaires, offre });
    doc = compose.document;
    if (!compose.tient) console.error(`Attention : le CV fait ${compose.pages} pages, même allégé au maximum (2 visées pour une offre).`);
  }
} catch (e) {
  if (e instanceof ErreurCv || e instanceof SyntaxError) stop(e.message);
  throw e;
}

const controle = controlerCv(doc, reference, texteProfil(etat));
if (option('json')) {
  console.log(JSON.stringify({ document: doc, controle, nom: nomCv(doc) }, null, 2));
  process.exit(0);
}

try {
  validerDocument(doc);
} catch (e) {
  stop(e.message);
}
const sortie = valeur('sortie') ?? join(dossier, 'cv', nomCv(doc) + '.pdf');
mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, await cvPdf(doc, { photo: lirePhoto(dossier) }));
console.log(`PDF écrit : ${sortie}`);
if (!controle.disponible) console.log('Contrôle impossible : aucun CV de référence dans la base.');
else {
  console.log(`Contrôle : ${controle.faits.length} faits, ${controle.ecarts} absents du CV de référence, ${controle.avertissements} à vérifier.`);
  for (const f of controle.faits.filter(f => f.statut !== 'ok')) console.log(`  ${f.statut.padEnd(7)} ${f.valeur} (${f.rubrique} : ${f.element})`);
}
console.log('Version non enregistrée (serveur arrêté) : à refaire depuis Profil > CV une fois le serveur relancé.');
