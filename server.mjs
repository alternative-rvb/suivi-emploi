// Usage : node --no-warnings server.mjs   puis http://localhost:3000
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consigneActuelle, lancerAnalyse, lireAnalyse, ouvrirAnalyses, POIDS, resumeAnalyse, SCHEMA } from './lib/analyse/index.mjs';
import { assemblerCv, NIVEAU_MIN as NIVEAU_MIN_ASSEMBLAGE } from './lib/analyse/assemblage.mjs';
import { dernierEchec, extractionEnCours, lancerExtraction, lireCompetencesOffre, purgerCompetencesOrphelines, rapprocher, rattacherCandidature } from './lib/analyse/competences.mjs';
import { CLES_SYNTHESE, lancerSynthese, ouvrirSyntheses, resumeSyntheses } from './lib/analyse/synthese.mjs';
import { differences, evenements, jourLocal, journaliser, rapport, rapportCsv } from './lib/journal.mjs';
import { appliquerVerification, CATEGORIES_OFFRE, classer, estProche, EXCLUS_TOUJOURS, expirerEpingles, JOURS_EPINGLE, JOURS_MAX, offresRetirables, ouvrirBase, retirerOffres, TYPES_EXPERIENCE, TYPES_FORMATION } from './lib/offres.mjs';
import { ErreurLieux, lireLieux, validerLieux } from './lib/lieux.mjs';
import { COULEURS_CONTACT, INTERETS_CANDIDATURE, STATUTS_CANDIDATURE, TYPES_PROJET, USAGES_IA } from './lib/listes.mjs';
import { EMAIL, norm, TELEPHONE } from './lib/texte.mjs';
import { ErreurLinkedin, lireExportLinkedin, proposerImport } from './lib/linkedin.mjs';
import { CHAMPS_CONTACT, composerCv, controlerCv, ErreurCv, LIBELLES_METIER, METIERS_CV, nomCv, normaliserPoids, normaliserPoidsCompetence, POIDS_MAX, prioritairesOffre, texteProfil, validerDocument } from './lib/cv.mjs';
import { cvPdf } from './lib/cv-pdf.mjs';
import { composerCvPages } from './lib/cv-pages.mjs';
import { compterMots, controlerLettre, ErreurLettre, nomLettre, ORIGINES_LETTRE, validerLettre, validerMatrice, validerStyle } from './lib/lettre.mjs';
import { lettrePdf } from './lib/lettre-pdf.mjs';
import { lettreDocx } from './lib/docx.mjs';
import { enregistrerSignature, lireSignature, supprimerSignature } from './lib/signature.mjs';
import { enregistrerPhoto, lirePhoto, supprimerPhoto } from './lib/photo.mjs';
import { redigerLettre } from './lib/analyse/lettre.mjs';
import { anneesParCategorie } from './lib/parcours.mjs';
import { DATE_FORMATION, erreurPeriode } from './lib/periode.mjs';
import { ecrirePlateformes, ErreurPlateformes, lirePlateformes, validerPlateformes } from './lib/plateformes.mjs';
import { ecrireTrajets, ErreurTrajets, lireTrajets, validerTrajets } from './lib/trajets.mjs';
import { ecrireReglages, ErreurReglages, lireReglages, validerReglages } from './lib/reglages.mjs';
import { exporterBase } from './lib/export-base.mjs';
import { lancerSauvegarde } from './lib/sauvegarde.mjs';
import { ecrireStatutEntreprise, ErreurEntreprises, lireSuiviEntreprises } from './lib/entreprises-suivi.mjs';
import { chercherEntreprises, DISTANCE_DEFAUT, scopeBonneBoite } from './lib/bonneboite.mjs';
import { chargerMarche } from './lib/marche.mjs';
import { verifierEnLigne } from './lib/providers/france-travail.mjs';
import { chargerEnv, ErreurSync, etatSync, lancerSync, lancerSyncDemarrage, sauvegardeDuJour } from './lib/sync.mjs';
import { lireZone } from './lib/zone.mjs';
import { corpsEvenement, creerAgenda, heureParis } from './lib/agenda/google.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
// NOTE: dist/ est produit par vite build (npm run build)
const publicDir = join(ici, 'dist');

chargerEnv(ici);
sauvegardeDuJour(ici);
const db = ouvrirBase(join(ici, 'suivi.db'));
// ANCHOR: copie quotidienne vers SUIVI_EXPORT_DIR si le dossier existe le résultat est seulement affiché dans la console
{
  const r = exporterBase(db, process.env.SUIVI_EXPORT_DIR);
  if (r.ok) console.log(`Copie de la base : ${r.fichier}`);
  else if (r.raison === 'dossier introuvable') console.warn('Copie de la base ignorée : SUIVI_EXPORT_DIR introuvable.');
}
// ANCHOR: sauvegarde complète facultative (SUIVI_SAUVEGARDE_SCRIPT), en arrière-plan, résultat affiché dans la console
lancerSauvegarde(process.env.SUIVI_SAUVEGARDE_SCRIPT, ici).then(r => {
  if (r.ok) { if (r.sortie) console.log(r.sortie); }
  else if (r.raison !== 'désactivé') console.warn(`Sauvegarde ignorée : ${r.raison}`);
});
ouvrirAnalyses(db);
ouvrirSyntheses(db);
// NOTE: jeton Google hors de suivi.db, pour qu'il ne soit pas recopié dans chaque sauvegarde du jour
const agenda = creerAgenda({ fichier: join(ici, 'data', 'google-agenda.json') });

// --- Validation commune ---
class ErreurHttp extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const STATUTS = STATUTS_CANDIDATURE;
const INTERETS = INTERETS_CANDIDATURE;
const MODES_ENVOI = ['', 'formulaire', 'email', 'telephone', 'autre'];
const CANAUX = ['', 'telephone', 'email', 'whatsapp', 'sms', 'linkedin', 'entretien', 'plateforme', 'autre'];
const SENS = ['', 'envoye', 'recu'];
const DATE = /^(\d{4}-\d{2}-\d{2})?$/;
const HEURE = /^(([01]\d|2[0-3]):[0-5]\d)?$/;
const DEBUT_RDV = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const MOIS = /^(\d{4}-(0[1-9]|1[0-2]))?$/;
// NOTE: jour local (fuseau du journal), la date UTC vaut encore la veille entre minuit et 1 h ou 2 h
const aujourdhui = () => jourLocal(new Date());
const nouvelId = prefixe => prefixe + randomUUID().slice(0, 8);

// ANCHOR: description des champs acceptés. type : texte, booleen, email, telephone, date (AAAA-MM-JJ ou vide), mois (AAAA-MM ou vide), niveau (0 à 5 ou null), nombre, ids (tableau d'identifiants) ; valeurs : liste fermée ; requis : non vide à la création
// Valide un objet reçu ; complet = création
function valider(d, champs, complet) {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new ErreurHttp(400, 'Objet JSON attendu.');
  const inconnus = Object.keys(d).filter(k => k !== 'id' && !(k in champs));
  if (inconnus.length) throw new ErreurHttp(400, `Champs inconnus : ${inconnus.join(', ')}.`);
  if ('id' in d && (typeof d.id !== 'string' || !d.id.trim())) throw new ErreurHttp(400, 'Le champ id doit être une chaîne non vide.');
  for (const [k, spec] of Object.entries(champs)) {
    const v = d[k];
    if (v === undefined) {
      if (complet && spec.requis) throw new ErreurHttp(400, `Le champ ${k} est obligatoire.`);
      continue;
    }
    if (spec.type === 'booleen') {
      if (typeof v !== 'boolean' && v !== 0 && v !== 1) throw new ErreurHttp(400, `Le champ ${k} doit valoir true ou false.`);
      continue;
    }
    if (spec.type === 'niveau') {
      if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 5)) throw new ErreurHttp(400, `Le champ ${k} doit être un entier de 0 à 5 ou null.`);
      continue;
    }
    if (spec.type === 'nombre') {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new ErreurHttp(400, `Le champ ${k} doit être un nombre.`);
      continue;
    }
    if (spec.type === 'ids') {
      if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !x)) throw new ErreurHttp(400, `Le champ ${k} doit être un tableau d'identifiants.`);
      continue;
    }
    if (spec.type === 'intitules') {
      if (typeof v !== 'object' || v === null || Array.isArray(v) || Object.entries(v).some(([m, t]) => !METIERS_CV.includes(m) || typeof t !== 'string' || t.length > 120)) {
        throw new ErreurHttp(400, `Le champ ${k} doit associer un métier (${METIERS_CV.join(', ')}) à un intitulé de 120 caractères au plus.`);
      }
      continue;
    }
    if (spec.type === 'poids') {
      const entrees = typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.entries(v) : null;
      if (!entrees || entrees.length > 200 || entrees.some(([puce, pm]) => !puce.trim() || puce.length > 1000 || typeof pm !== 'object' || pm === null || Array.isArray(pm)
        || Object.entries(pm).some(([m, n]) => !METIERS_CV.includes(m) || !Number.isInteger(n) || n < 0 || n > POIDS_MAX))) {
        throw new ErreurHttp(400, `Le champ ${k} doit associer chaque puce (200 au plus) à des poids entiers de 0 à ${POIDS_MAX} par métier (${METIERS_CV.join(', ')}).`);
      }
      continue;
    }
    if (spec.type === 'poidsCompetence') {
      if (typeof v !== 'object' || v === null || Array.isArray(v) || Object.entries(v).some(([m, n]) => !METIERS_CV.includes(m) || !Number.isInteger(n) || n < 0 || n > POIDS_MAX)) {
        throw new ErreurHttp(400, `Le champ ${k} doit associer un métier (${METIERS_CV.join(', ')}) à un poids entier de 0 à ${POIDS_MAX}.`);
      }
      continue;
    }
    if (spec.type === 'lieux') {
      try { validerLieux(v); } catch (e) { if (e instanceof ErreurLieux) throw new ErreurHttp(400, `Le champ ${k} est invalide : ${e.message}`); throw e; }
      continue;
    }
    if (v !== null && typeof v !== 'string') throw new ErreurHttp(400, `Le champ ${k} doit être une chaîne.`);
    if (spec.type === 'url' && v && !/^https?:\/\/\S+$/i.test(v.trim())) throw new ErreurHttp(400, `Le champ ${k} doit être une adresse http ou https.`);
    if (spec.requis && !v?.trim()) throw new ErreurHttp(400, `Le champ ${k} ne peut pas être vide.`);
    if (spec.type === 'date' && !DATE.test(v ?? '')) throw new ErreurHttp(400, `Le champ ${k} doit être une date AAAA-MM-JJ ou vide.`);
    if (spec.type === 'mois' && !MOIS.test(v ?? '')) throw new ErreurHttp(400, `Le champ ${k} doit être un mois AAAA-MM ou vide.`);
    if (spec.type === 'periode' && v && !DATE_FORMATION.test(v)) throw new ErreurHttp(400, `Le champ ${k} doit être une année AAAA, un mois AAAA-MM ou vide.`);
    if (spec.type === 'debut' && (!DEBUT_RDV.test(v ?? '') || Number.isNaN(Date.parse(v + ':00Z')) || new Date(v + ':00Z').toISOString().slice(0, 16) !== v)) throw new ErreurHttp(400, `Le champ ${k} doit être une date et une heure AAAA-MM-JJTHH:MM existantes.`);
    if (spec.type === 'heure' && !HEURE.test(v ?? '')) throw new ErreurHttp(400, `Le champ ${k} doit être une heure HH:MM ou vide.`);
    if (spec.type === 'email' && v && !EMAIL.test(v.trim())) throw new ErreurHttp(400, `Le champ ${k} doit être une adresse email.`);
    if (spec.type === 'telephone' && v && !TELEPHONE.test(v.trim())) throw new ErreurHttp(400, `Le champ ${k} ne doit contenir que des chiffres, espaces, points, tirets et un + initial.`);
    if (spec.valeurs && !spec.valeurs.includes(v ?? '')) throw new ErreurHttp(400, `${k} invalide, valeurs : ${spec.valeurs.filter(Boolean).join(', ')}${spec.valeurs.includes('') ? ' ou vide' : ''}.`);
  }
}

// NOTE: réentrante, une transaction déjà ouverte englobe l'appel (suppression d'une compétence et de ses liens, par exemple)
const transaction = f => {
  if (db.isTransaction) return f();
  db.exec('BEGIN');
  try {
    const r = f();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};

// --- Candidatures : correspondance entre le format du front (raison, lettre booléen) et celui de la base (raison_echec, lettre 0 ou 1) ---
const CHAMPS_CANDIDATURE = {
  entreprise: { requis: true },
  poste: { requis: true },
  description: {},
  statut: { valeurs: STATUTS },
  raison: {},
  date: {},
  plateforme: {},
  interet: { valeurs: INTERETS },
  notes: {},
  offre_id: {},
  mode_envoi: { valeurs: MODES_ENVOI },
  cv: {},
  lettre: { type: 'booleen' },
  lieux: { type: 'lieux' },
  lien: { type: 'url' },
  enseignements: {},
};
const COLS = ['entreprise', 'poste', 'description', 'statut', 'raison_echec', 'date', 'plateforme', 'interet', 'notes', 'offre_id', 'mode_envoi', 'cv', 'lettre', 'lieux', 'lien', 'enseignements'];

/** @type {(r: Record<string, any>) => import('./types.d.ts').Candidature} */
const versFront = r => ({
  id: r.id, entreprise: r.entreprise, poste: r.poste, description: r.description, statut: r.statut, raison: r.raison_echec, date: r.date,
  plateforme: r.plateforme, interet: r.interet, notes: r.notes, offre_id: r.offre_id, mode_envoi: r.mode_envoi, cv: r.cv, lettre: Boolean(r.lettre), lieux: lireLieux(r.lieux), lien: r.lien, enseignements: r.enseignements ?? '',
});
const versBase = d => ({
  id: String(d.id), entreprise: d.entreprise ?? '', poste: d.poste ?? '', description: d.description ?? '', statut: d.statut ?? '', raison_echec: d.raison ?? '',
  date: d.date ?? '', plateforme: d.plateforme ?? '', interet: d.interet ?? '', notes: d.notes ?? '', offre_id: d.offre_id || null,
  mode_envoi: d.mode_envoi ?? '', cv: d.cv ?? '', lettre: d.lettre ? 1 : 0, lieux: JSON.stringify(validerLieux(d.lieux ?? [])), lien: (d.lien ?? '').trim(), enseignements: d.enseignements ?? '',
});

// ANCHOR: une offre liée doit exister et n'être suivie que par une seule candidature.
// NOTE: 400 et non 409, l'interface réserve le 409 à la création concurrente d'un même identifiant
function verifierOffre(d, id) {
  if (!d.offre_id) return;
  if (!db.prepare('SELECT 1 FROM offres WHERE id_offre = ?').get(d.offre_id)) throw new ErreurHttp(400, `Offre ${d.offre_id} introuvable.`);
  const autre = db.prepare('SELECT id, entreprise FROM candidatures WHERE offre_id = ? AND id != ?').get(d.offre_id, String(id ?? ''));
  if (autre) throw new ErreurHttp(400, `L'offre ${d.offre_id} est déjà liée à la candidature ${autre.entreprise} (${autre.id}).`);
}

const lireCandidature = id => {
  const r = db.prepare('SELECT * FROM candidatures WHERE id = ?').get(id);
  return r ? versFront(r) : null;
};

function listerCandidatures(q) {
  const where = [];
  const params = [];
  if (q.get('statut')) { where.push('statut = ?'); params.push(q.get('statut')); }
  if (q.get('interet')) { where.push('interet = ?'); params.push(q.get('interet')); }
  if (q.get('offre_id')) { where.push('offre_id = ?'); params.push(q.get('offre_id')); }
  if (q.get('q')) {
    where.push("(entreprise || ' ' || poste || ' ' || description || ' ' || notes || ' ' || raison_echec) LIKE ? ESCAPE '\\'");
    params.push('%' + q.get('q').replace(/[\\%_]/g, c => '\\' + c) + '%');
  }
  const sql = 'SELECT * FROM candidatures' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY date DESC, id';
  return db.prepare(sql).all(...params).map(versFront);
}

// ANCHOR: toute écriture passe par le journal (lib/journal.mjs) : création, champs modifiés avec leur valeur avant et après, suppression
const libelleCandidature = c => [c.entreprise, c.poste].filter(Boolean).join(' · ');
// NOTE: un CV sur mesure déjà composé pour l'offre (sans candidature) est lié à la candidature créée ; ceux déjà liés à une autre ne bougent pas
function rattacherCvs(idOffre, idCandidature, nomCv = '') {
  const libres = db.prepare('SELECT id, nom FROM cv_versions WHERE offre_id = ? AND candidature_id IS NULL ORDER BY cree_le DESC').all(idOffre);
  // NOTE: un seul CV est lié : celui dont le nom est saisi dans la candidature, sinon le plus récent (les essais précédents restent libres)
  const v = libres.find(x => nomCv && x.nom === nomCv) ?? libres[0];
  if (!v) return;
  transaction(() => {
    db.prepare('UPDATE cv_versions SET candidature_id = ? WHERE id = ?').run(idCandidature, v.id);
    journaliser(db, { entite: 'cv', id: String(v.id), libelle: String(v.nom), action: 'modification', changements: [{ champ: 'candidature_id', avant: '', apres: idCandidature }] });
  });
}
function insererCandidature(n) {
  db.prepare(`INSERT INTO candidatures (id, ${COLS.join(', ')}, maj_locale) VALUES (?, ${COLS.map(() => '?').join(', ')}, 1)`).run(n.id, ...COLS.map(c => n[c]));
  // NOTE: le statut initial accompagne la création, pour distinguer une candidature envoyée d'emblée d'une candidature à faire
  journaliser(db, { entite: 'candidature', id: n.id, libelle: libelleCandidature(n), action: 'creation', changements: [{ champ: 'statut', avant: '', apres: n.statut ?? '' }] });
  // NOTE: les compétences déjà relevées dans l'annonce suivent la candidature, l'offre étant purgée au bout de 31 jours
  if (n.offre_id) { rattacherCandidature(db, n.offre_id, n.id); rattacherCvs(n.offre_id, n.id, n.cv); rattacherLettres(n.offre_id, n.id); desepingler(n.offre_id); }
}
function remplacerCandidature(n, avant) {
  db.prepare(`UPDATE candidatures SET ${COLS.map(c => c + ' = ?').join(', ')}, maj_locale = 1 WHERE id = ?`).run(...COLS.map(c => n[c]), n.id);
  const changements = differences(avant, n, COLS);
  if (changements.length) journaliser(db, { entite: 'candidature', id: n.id, libelle: libelleCandidature(n), action: 'modification', changements });
  if (n.offre_id && n.offre_id !== avant.offre_id) { rattacherCandidature(db, n.offre_id, n.id); rattacherCvs(n.offre_id, n.id, n.cv); rattacherLettres(n.offre_id, n.id); desepingler(n.offre_id); }
}

// ANCHOR: compétences relevées dans une annonce, rapprochées du Profil du moment (jamais stockées avec leur statut)
function ignoreesCompetences() {
  const r = db.prepare("SELECT valeur FROM kv WHERE cle = 'competences_ignorees'").get();
  try { return r ? JSON.parse(String(r.valeur)) : []; } catch { return []; }
}
// NOTE: une candidature liée à l'offre est l'action attendue : l'épingle n'a plus d'objet (l'offre est alors protégée par la candidature)
function desepingler(idOffre) {
  db.prepare("UPDATE offres SET epinglee_le = '' WHERE id_offre = ? AND epinglee_le != ''").run(idOffre);
}

function etatCompetencesOffre(idOffre) {
  const lu = lireCompetencesOffre(db, idOffre);
  const echec = dernierEchec.get(idOffre);
  return {
    extrait: !!lu,
    enCours: extractionEnCours(idOffre),
    erreur: !lu && echec ? echec.erreur : null,
    code: !lu && echec ? echec.code : null,
    date: lu?.date ?? null,
    items: lu ? rapprocher(lu.items, competences.tout(), ignoreesCompetences()) : [],
  };
}

function creerCandidature(d) {
  valider(d, CHAMPS_CANDIDATURE, true);
  const n = versBase({ statut: 'a_faire', date: aujourdhui(), ...d, id: d.id ?? randomUUID().slice(0, 8) });
  if (db.prepare('SELECT 1 FROM candidatures WHERE id = ?').get(n.id)) throw new ErreurHttp(409, `La candidature ${n.id} existe déjà.`);
  verifierOffre(n, n.id);
  transaction(() => insererCandidature(n));
  return lireCandidature(n.id);
}

function modifierCandidature(id, d) {
  const avant = db.prepare('SELECT * FROM candidatures WHERE id = ?').get(id);
  if (!avant) throw new ErreurHttp(404, `Candidature ${id} introuvable.`);
  valider(d, CHAMPS_CANDIDATURE, false);
  if ('id' in d && String(d.id) !== id) throw new ErreurHttp(400, "L'identifiant ne peut pas être modifié.");
  // Seuls les champs reçus sont modifiés : une interface restée ouverte ne peut pas écraser les autres champs
  const n = versBase({ ...versFront(avant), ...d, id });
  if ('offre_id' in d) verifierOffre(n, id);
  transaction(() => remplacerCandidature(n, avant));
  return lireCandidature(id);
}

// NOTE: les tâches et échanges d'une candidature disparaissent avec elle
const supprimerCandidature = id => transaction(() => {
  const avant = db.prepare('SELECT * FROM candidatures WHERE id = ?').get(id);
  if (avant) journaliser(db, { entite: 'candidature', id, libelle: libelleCandidature(avant), action: 'suppression' });
  db.prepare('DELETE FROM taches WHERE candidature_id = ?').run(id);
  db.prepare('DELETE FROM echanges WHERE candidature_id = ?').run(id);
  return db.prepare('DELETE FROM candidatures WHERE id = ?').run(id).changes;
});

// --- Tâches (liées à une candidature ou globales) et échanges (toujours liés) : même mécanique CRUD ---
const verifierCandidature = cid => {
  if (cid && !db.prepare('SELECT 1 FROM candidatures WHERE id = ?').get(cid)) throw new ErreurHttp(400, `Candidature ${cid} introuvable.`);
};

// ANCHOR: liens (optionnel) : un ou plusieurs champs tableau d'ids rangés dans des tables de liaison { champ, table, cle, cible, verifier }, lus et écrits avec la ligne, journalisés comme un champ
// NOTE: cibleCle, colonne clé de la table cible ('id' par défaut, 'id_offre' pour les offres)
/** @typedef {{ champ: string, table: string, cle: string, cible: string, cibleTable: string, cibleCle?: string, verifier: (ids: string[]) => void }} Liens */
// NOTE: masques, champs dont le journal note la modification sans les valeurs avant et après (coordonnées d'un tiers)
/** @param {{ table: string, nom: string, entite: string, libelle: (x: any) => string, prefixe: string, champs: Record<string, any>, defauts: () => Record<string, any>, versFront: (r: any) => any, versBase: (d: any) => any, ordre: string, liens?: Liens | Liens[] | null, masques?: string[] }} def */
function collection({ table, nom, entite, libelle, prefixe, champs, defauts, versFront: front, versBase: base, ordre, liens = null, masques = [] }) {
  /** @type {Liens[]} */
  const tousLiens = liens ? [].concat(/** @type {any} */ (liens)) : [];
  const champsLiens = tousLiens.map(l => l.champ);
  const cols = Object.keys(champs).filter(k => !champsLiens.includes(k));
  const cleCible = l => l.cibleCle ?? 'id';
  // NOTE: jointure sur la table cible, un lien orphelin (base modifiée hors de l'app) n'est jamais renvoyé à l'interface
  /** @type {(l: Liens, id: string) => string[]} */
  const lireLiens = (l, id) => db.prepare(`SELECT x.${l.cible} AS c FROM ${l.table} x JOIN ${l.cibleTable} t ON t.${cleCible(l)} = x.${l.cible} WHERE x.${l.cle} = ? ORDER BY x.rowid`).all(id).map(x => String(x.c));
  const avecLiens = r => (tousLiens.length ? { ...front(r), ...Object.fromEntries(tousLiens.map(l => [l.champ, lireLiens(l, r.id)])) } : front(r));
  const ecrireLiens = (l, id, ids) => {
    const uniques = [...new Set(ids)];
    l.verifier(uniques);
    db.prepare(`DELETE FROM ${l.table} WHERE ${l.cle} = ?`).run(id);
    const ins = db.prepare(`INSERT INTO ${l.table} (${l.cle}, ${l.cible}) VALUES (?, ?)`);
    for (const c of uniques) ins.run(id, c);
  };
  const lire = id => {
    const r = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    return r ? avecLiens(r) : null;
  };
  return {
    lire,
    tout() {
      const lignes = db.prepare(`SELECT * FROM ${table} ORDER BY ${ordre}`).all();
      if (!tousLiens.length) return lignes.map(front);
      // NOTE: tous les liens en une requête par table plutôt qu'une par ligne
      /** @type {[string, Map<string, string[]>][]} */
      const parChamp = tousLiens.map(l => {
        /** @type {Map<string, string[]>} */
        const parId = new Map();
        for (const x of db.prepare(`SELECT x.${l.cle} AS k, x.${l.cible} AS c FROM ${l.table} x JOIN ${l.cibleTable} t ON t.${cleCible(l)} = x.${l.cible} ORDER BY x.rowid`).all()) {
          const k = String(x.k);
          parId.set(k, [...(parId.get(k) ?? []), String(x.c)]);
        }
        return [l.champ, parId];
      });
      return lignes.map(r => ({ ...front(r), ...Object.fromEntries(parChamp.map(([champ, parId]) => [champ, parId.get(String(r.id)) ?? []])) }));
    },
    lister(q) {
      const where = [];
      const params = [];
      // NOTE: filtre réservé aux collections rattachées à une candidature (tâches, échanges), ignoré ailleurs
      if ('candidature_id' in champs && q.has('candidature_id')) {
        where.push(q.get('candidature_id') ? 'candidature_id = ?' : 'candidature_id IS NULL');
        if (q.get('candidature_id')) params.push(q.get('candidature_id'));
      }
      if ('faite' in champs && (q.get('faite') === '0' || q.get('faite') === '1')) { where.push('faite = ?'); params.push(Number(q.get('faite'))); }
      // NOTE: filtres par lien (rendez-vous : offre_id, contact_id) et par jour (du, au sur debut, bornes incluses), ignorés sur les collections sans ces colonnes
      for (const k of ['offre_id', 'contact_id']) if (k in champs && q.get(k)) { where.push(`${k} = ?`); params.push(q.get(k)); }
      if ('debut' in champs) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('du') ?? '')) { where.push('substr(debut, 1, 10) >= ?'); params.push(q.get('du')); }
        if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('au') ?? '')) { where.push('substr(debut, 1, 10) <= ?'); params.push(q.get('au')); }
      }
      let lignes = db.prepare(`SELECT * FROM ${table}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY ${ordre}`).all(...params).map(avecLiens);
      // NOTE: collections à liens (contacts) : ?offre_id= ou ?candidature_id= garde les lignes reliées à cette valeur
      for (const l of tousLiens) {
        const v = q.get(l.cible);
        if (v) lignes = lignes.filter(r => r[l.champ].includes(v));
      }
      return lignes;
    },
    creer(d) {
      valider(d, champs, true);
      const n = base({ ...defauts(), ...d, id: d.id ?? nouvelId(prefixe) });
      if (lire(n.id)) throw new ErreurHttp(409, `${nom} ${n.id} existe déjà.`);
      verifierCandidature(n.candidature_id);
      transaction(() => {
        db.prepare(`INSERT INTO ${table} (id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`).run(n.id, ...cols.map(c => n[c]));
        for (const l of tousLiens) ecrireLiens(l, n.id, d[l.champ] ?? []);
        journaliser(db, { entite, id: n.id, libelle: libelle(n), action: 'creation' });
      });
      return lire(n.id);
    },
    modifier(id, d) {
      const avant = lire(id);
      if (!avant) throw new ErreurHttp(404, `${nom} ${id} introuvable.`);
      valider(d, champs, false);
      if ('id' in d && String(d.id) !== id) throw new ErreurHttp(400, "L'identifiant ne peut pas être modifié.");
      const n = base({ ...avant, ...d, id });
      if ('candidature_id' in d) verifierCandidature(n.candidature_id);
      transaction(() => {
        db.prepare(`UPDATE ${table} SET ${cols.map(c => c + ' = ?').join(', ')} WHERE id = ?`).run(...cols.map(c => n[c]), id);
        // NOTE: une colonne JSON (intitulés d'une expérience) est lue en objet et stockée en texte : comparée sous sa forme stockée
        const avantStocke = Object.fromEntries(cols.map(c => [c, avant[c] !== null && typeof avant[c] === 'object' && !Array.isArray(avant[c]) ? JSON.stringify(avant[c]) : avant[c]]));
        const changements = differences(avantStocke, n, cols).map(c => (masques.includes(c.champ) ? { ...c, avant: '', apres: '' } : c));
        for (const l of tousLiens) {
          if (!(l.champ in d)) continue;
          ecrireLiens(l, id, d[l.champ]);
          changements.push(...differences({ [l.champ]: avant[l.champ].join(', ') }, { [l.champ]: lireLiens(l, id).join(', ') }, [l.champ]));
        }
        if (changements.length) journaliser(db, { entite, id, libelle: libelle(n), action: 'modification', changements });
      });
      return lire(id);
    },
    supprimer(id) {
      const avant = lire(id);
      const n = transaction(() => {
        for (const l of tousLiens) db.prepare(`DELETE FROM ${l.table} WHERE ${l.cle} = ?`).run(id);
        const k = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes;
        if (k && avant) journaliser(db, { entite, id, libelle: libelle(avant), action: 'suppression' });
        return k;
      });
      return n;
    },
  };
}

const taches = collection({
  table: 'taches',
  nom: 'Tâche',
  entite: 'tache',
  libelle: t => t.titre,
  prefixe: 't-',
  champs: { candidature_id: {}, titre: { requis: true }, echeance: { type: 'date' }, faite: { type: 'booleen' }, creee: { type: 'date' } },
  defauts: () => ({ creee: aujourdhui() }),
  versFront: r => ({ id: r.id, candidature_id: r.candidature_id, titre: r.titre, echeance: r.echeance, faite: Boolean(r.faite), creee: r.creee }),
  versBase: d => ({ id: String(d.id), candidature_id: d.candidature_id || null, titre: d.titre ?? '', echeance: d.echeance ?? '', faite: d.faite ? 1 : 0, creee: d.creee ?? '' }),
  ordre: "faite, echeance = '', echeance, creee, id",
});

const echanges = collection({
  table: 'echanges',
  nom: 'Échange',
  entite: 'echange',
  libelle: e => [e.canal, e.sens].filter(Boolean).join(' '),
  prefixe: 'e-',
  champs: { candidature_id: { requis: true }, date: { type: 'date' }, heure: { type: 'heure' }, canal: { valeurs: CANAUX }, sens: { valeurs: SENS }, resume: {} },
  defauts: () => ({ date: aujourdhui() }),
  versFront: r => ({ id: r.id, candidature_id: r.candidature_id, date: r.date, heure: r.heure, canal: r.canal, sens: r.sens, resume: r.resume }),
  versBase: d => ({ id: String(d.id), candidature_id: d.candidature_id ?? '', date: d.date ?? '', heure: d.heure ?? '', canal: d.canal ?? '', sens: d.sens ?? '', resume: d.resume ?? '' }),
  ordre: 'date DESC, heure DESC, id DESC',
});

// --- Parcours du Profil (schéma v7) : compétences, formations et expériences, liées par experience_competences ---
const competences = collection({
  table: 'competences',
  nom: 'Compétence',
  entite: 'competence',
  libelle: c => c.competence,
  prefixe: 'c-',
  champs: { domaine: {}, competence: { requis: true }, enseigner: { type: 'niveau' }, executer: { type: 'niveau' }, note: {}, valide: { type: 'booleen' }, ordre: { type: 'nombre' }, poids: { type: 'poidsCompetence' } },
  defauts: () => ({ poids: {}, ordre: Number(db.prepare('SELECT COALESCE(MAX(ordre), -1) + 1 AS n FROM competences').get()?.n) }),
  versFront: r => ({ id: r.id, domaine: r.domaine, competence: r.competence, enseigner: r.enseigner ?? null, executer: r.executer ?? null, note: r.note, valide: Boolean(r.valide), ordre: r.ordre, poids: lirePoidsCompetence(r.poids) }),
  versBase: d => ({ id: String(d.id), domaine: d.domaine ?? '', competence: d.competence ?? '', enseigner: d.enseigner ?? null, executer: d.executer ?? null, note: d.note ?? '', valide: d.valide ? 1 : 0, ordre: d.ordre ?? 0, poids: JSON.stringify(normaliserPoidsCompetence(d.poids)) }),
  ordre: 'ordre, id',
});

const formations = collection({
  table: 'formations',
  nom: 'Formation',
  entite: 'formation',
  libelle: f => f.titre,
  prefixe: 'f-',
  champs: { type: { valeurs: TYPES_FORMATION }, titre: { requis: true }, etablissement: {}, lieu: {}, debut: { type: 'periode' }, fin: { type: 'periode' }, matieres: {}, note: {}, ordre: { type: 'nombre' }, competences: { type: 'ids' } },
  defauts: () => ({ type: 'titre_pro', ordre: Number(db.prepare('SELECT COALESCE(MAX(ordre), -1) + 1 AS n FROM formations').get()?.n) }),
  versFront: r => ({ id: r.id, type: r.type, titre: r.titre, etablissement: r.etablissement, lieu: r.lieu, debut: r.debut, fin: r.fin, matieres: r.matieres, note: r.note, ordre: r.ordre }),
  versBase: d => {
    if (erreurPeriode(d)) throw new ErreurHttp(400, erreurPeriode(d));
    return { id: String(d.id), type: d.type ?? 'titre_pro', titre: d.titre ?? '', etablissement: d.etablissement ?? '', lieu: d.lieu ?? '', debut: d.debut ?? '', fin: d.fin ?? '', matieres: d.matieres ?? '', note: d.note ?? '', ordre: d.ordre ?? 0 };
  },
  ordre: 'ordre, id',
  // NOTE: compétences enseignées dans un titre (schéma v9) ; matieres ne garde que les matières à reclasser
  liens: { champ: 'competences', table: 'formation_competences', cle: 'formation_id', cible: 'competence_id', cibleTable: 'competences', verifier: ids => verifierCompetences(ids) },
});

const verifierCompetences = ids => {
  const inconnus = ids.filter(c => !db.prepare('SELECT 1 FROM competences WHERE id = ?').get(c));
  if (inconnus.length) throw new ErreurHttp(400, `Compétences introuvables : ${inconnus.join(', ')}.`);
};

// NOTE: intitulés d'une expérience par métier visé, dans l'ordre de METIERS_CV, vides retirés (même JSON pour une même saisie, comparé tel quel par le journal)
const normaliserIntitules = v => Object.fromEntries(METIERS_CV.map(m => [m, String(v?.[m] ?? '').trim()]).filter(([, t]) => t));
const lirePoidsCompetence = s => { try { return normaliserPoidsCompetence(typeof s === 'string' ? JSON.parse(s) : s); } catch { return {}; } };
const lirePoids = s => { try { return normaliserPoids(typeof s === 'string' ? JSON.parse(s) : s); } catch { return {}; } };
const lireIntitules = s => { try { return normaliserIntitules(typeof s === 'string' ? JSON.parse(s) : s); } catch { return {}; } };
const experiences = collection({
  table: 'experiences',
  nom: 'Expérience',
  entite: 'experience',
  libelle: x => [x.poste, x.employeur].filter(Boolean).join(', '),
  prefixe: 'x-',
  champs: {
    poste: { requis: true }, employeur: {}, lieu: {}, type: { valeurs: TYPES_EXPERIENCE }, categorie: { valeurs: CATEGORIES_OFFRE },
    debut: { type: 'mois' }, fin: { type: 'mois' }, description: {}, ordre: { type: 'nombre' }, competences: { type: 'ids' }, intitules: { type: 'intitules' }, poids: { type: 'poids' },
  },
  defauts: () => ({ type: 'salarie', categorie: 'autre', ordre: 0, intitules: {}, poids: {} }),
  versFront: r => ({ id: r.id, poste: r.poste, employeur: r.employeur, lieu: r.lieu, type: r.type, categorie: r.categorie, debut: r.debut, fin: r.fin, description: r.description, ordre: r.ordre, intitules: lireIntitules(r.intitules), poids: lirePoids(r.poids) }),
  versBase: d => {
    if (erreurPeriode(d)) throw new ErreurHttp(400, erreurPeriode(d));
    return {
      id: String(d.id), poste: d.poste ?? '', employeur: d.employeur ?? '', lieu: d.lieu ?? '', type: d.type ?? 'salarie', categorie: d.categorie ?? 'autre',
      debut: d.debut ?? '', fin: d.fin ?? '', description: d.description ?? '', ordre: d.ordre ?? 0, intitules: JSON.stringify(normaliserIntitules(d.intitules)), poids: JSON.stringify(normaliserPoids(d.poids)),
    };
  },
  // NOTE: frise du plus récent au plus ancien, une expérience en cours (fin vide) en tête
  ordre: "fin = '' DESC, fin DESC, debut DESC, ordre, id",
  liens: {
    champ: 'competences', table: 'experience_competences', cle: 'experience_id', cible: 'competence_id', cibleTable: 'competences',
    verifier: verifierCompetences,
  },
});

// --- Projets (schéma v19) : portfolio relié aux compétences par projet_competences, le nombre de projets d'une compétence se calcule côté interface ---
const projets = collection({
  table: 'projets',
  nom: 'Projet',
  entite: 'projet',
  libelle: p => p.nom,
  prefixe: 'p-',
  champs: {
    nom: { requis: true }, url: { type: 'url' }, type: { valeurs: TYPES_PROJET }, debut: { type: 'mois' }, ia: { valeurs: USAGES_IA },
    technologies: {}, description: {}, ordre: { type: 'nombre' }, competences: { type: 'ids' },
  },
  defauts: () => ({ type: 'perso', ordre: 0 }),
  versFront: r => ({ id: r.id, nom: r.nom, url: r.url, type: r.type, debut: r.debut, ia: r.ia, technologies: r.technologies, description: r.description, ordre: r.ordre }),
  versBase: d => ({
    id: String(d.id), nom: d.nom ?? '', url: (d.url ?? '').trim(), type: d.type ?? 'perso', debut: d.debut ?? '', ia: d.ia ?? '',
    technologies: d.technologies ?? '', description: d.description ?? '', ordre: d.ordre ?? 0,
  }),
  // NOTE: du plus récent au plus ancien
  ordre: 'debut DESC, ordre, id',
  liens: { champ: 'competences', table: 'projet_competences', cle: 'projet_id', cible: 'competence_id', cibleTable: 'competences', verifier: verifierCompetences },
});

// NOTE: supprimer une compétence la retire des expériences et des titres enseignés qui la citent (pas de lien orphelin)
const supprimerCompetence = id => transaction(() => {
  db.prepare('DELETE FROM experience_competences WHERE competence_id = ?').run(id);
  db.prepare('DELETE FROM projet_competences WHERE competence_id = ?').run(id);
  db.prepare('DELETE FROM formation_competences WHERE competence_id = ?').run(id);
  return competences.supprimer(id);
});

// --- Contacts (schéma v11) : interlocuteurs liés aux offres par contact_offres ---
const verifierOffres = ids => {
  const inconnues = ids.filter(o => !db.prepare('SELECT 1 FROM offres WHERE id_offre = ?').get(o));
  if (inconnues.length) throw new ErreurHttp(400, `Offres introuvables : ${inconnues.join(', ')}.`);
};

// NOTE: prénom et initiale du nom seulement dans le journal (affiché et exporté), jamais le nom de famille complet ni les coordonnées (masques)
const libelleContact = c => [c.prenom, c.nom ? c.nom.trim().charAt(0).toUpperCase() + '.' : ''].filter(Boolean).join(' ') || 'Contact';

const contacts = collection({
  table: 'contacts',
  nom: 'Contact',
  entite: 'contact',
  libelle: libelleContact,
  prefixe: 'k-',
  champs: {
    prenom: {}, nom: {}, fonction: {}, entreprise: {}, adresse: {}, telephone: { type: 'telephone' }, email: { type: 'email' }, note: {}, cree: { type: 'date' }, couleur: { valeurs: COULEURS_CONTACT }, epingle: { type: 'booleen' }, sans_telephone: { type: 'booleen' }, sans_email: { type: 'booleen' },
    offres: { type: 'ids' }, candidatures: { type: 'ids' },
  },
  defauts: () => ({ cree: aujourdhui(), couleur: '', epingle: false, sans_telephone: false, sans_email: false }),
  versFront: r => ({ id: r.id, prenom: r.prenom, nom: r.nom, fonction: r.fonction, entreprise: r.entreprise, adresse: r.adresse, telephone: r.telephone, email: r.email, note: r.note, cree: r.cree, couleur: r.couleur, epingle: Boolean(r.epingle), sans_telephone: Boolean(r.sans_telephone), sans_email: Boolean(r.sans_email) }),
  versBase: d => {
    const t = k => String(d[k] ?? '').trim();
    if (!t('prenom') && !t('nom')) throw new ErreurHttp(400, 'Un contact doit avoir au moins un prénom ou un nom.');
    return { id: String(d.id), prenom: t('prenom'), nom: t('nom'), fonction: t('fonction'), entreprise: t('entreprise'), adresse: t('adresse'), telephone: t('telephone'), email: t('email').toLowerCase(), note: d.note ?? '', cree: d.cree ?? '', couleur: d.couleur ?? '', epingle: d.epingle ? 1 : 0, sans_telephone: d.sans_telephone ? 1 : 0, sans_email: d.sans_email ? 1 : 0 };
  },
  ordre: 'epingle DESC, entreprise COLLATE NOCASE, nom COLLATE NOCASE, prenom COLLATE NOCASE, id',
  masques: ['nom', 'telephone', 'email', 'adresse', 'note'],
  liens: [
    { champ: 'offres', table: 'contact_offres', cle: 'contact_id', cible: 'offre_id', cibleTable: 'offres', cibleCle: 'id_offre', verifier: verifierOffres },
    { champ: 'candidatures', table: 'contact_candidatures', cle: 'contact_id', cible: 'candidature_id', cibleTable: 'candidatures', verifier: ids => ids.forEach(verifierCandidature) },
  ],
});

// --- Rendez-vous (ligne 121) : table rendez_vous, envoyés vers le calendrier Google choisi (voir plus bas) ---
const TYPES_RDV = ['telephone', 'visio', 'sur_place', 'autre'];
const SYNCHROS_RDV = ['ok', 'a_envoyer', 'erreur', 'annule'];
const rendezVous = collection({
  table: 'rendez_vous',
  nom: 'Rendez-vous',
  entite: 'rendez_vous',
  libelle: r => r.titre || 'Rendez-vous',
  prefixe: 'r-',
  champs: {
    titre: {}, debut: { type: 'debut', requis: true }, duree: { type: 'nombre' }, type: { valeurs: TYPES_RDV }, lieu: {}, lien_visio: { type: 'url' }, note: {},
    offre_id: {}, candidature_id: {}, contact_id: {}, google_id: {}, synchro: { valeurs: SYNCHROS_RDV }, cree: { type: 'date' },
  },
  defauts: () => ({ cree: aujourdhui(), type: 'autre', duree: 60, synchro: 'a_envoyer' }),
  versFront: r => ({ id: r.id, titre: r.titre, debut: r.debut, duree: r.duree, type: r.type, lieu: r.lieu, lien_visio: r.lien_visio, note: r.note, offre_id: r.offre_id, candidature_id: r.candidature_id, contact_id: r.contact_id, google_id: r.google_id, synchro: r.synchro, cree: r.cree }),
  versBase: d => {
    const duree = Number(d.duree);
    if (!Number.isInteger(duree) || duree < 5 || duree > 1440) throw new ErreurHttp(400, 'duree : nombre entier de minutes entre 5 et 1440.');
    return {
      id: String(d.id), titre: String(d.titre ?? '').trim(), debut: d.debut, duree, type: d.type ?? 'autre', lieu: String(d.lieu ?? '').trim(), lien_visio: String(d.lien_visio ?? '').trim(), note: d.note ?? '',
      offre_id: d.offre_id || null, candidature_id: d.candidature_id || null, contact_id: d.contact_id || null, google_id: d.google_id || null, synchro: d.synchro ?? 'a_envoyer', cree: d.cree ?? '',
    };
  },
  ordre: 'debut, id',
});

const COLLECTIONS = { taches, echanges, competences, formations, experiences, projets, contacts };

// ANCHOR: profil (kv profil) : accroche et résumé, accroches et titres sous le nom par cible pour le CV, coordonnées du CV (TJM et salaire restent dans kv trajets)
const CLES_ACCROCHES = ['general', ...METIERS_CV];
// NOTE: fusion avec le profil enregistré (actuel), un envoi partiel ne vide pas les champs absents
function validerProfil(p, actuel = lireProfil()) {
  if (typeof p !== 'object' || p === null || Array.isArray(p)) throw new ErreurHttp(400, 'profil : objet { accroche, resume, accroches, titres, resumes, contact } attendu.');
  const inconnus = Object.keys(p).filter(k => !['accroche', 'resume', 'accroches', 'titres', 'resumes', 'variantes', 'contact'].includes(k));
  if (inconnus.length) throw new ErreurHttp(400, `profil : champs inconnus : ${inconnus.join(', ')}.`);
  for (const k of ['accroche', 'resume']) if (p[k] !== undefined && typeof p[k] !== 'string') throw new ErreurHttp(400, `profil.${k} doit être une chaîne.`);
  const sousObjet = (nom, cles, max = 400) => {
    const o = p[nom] ?? {};
    if (typeof o !== 'object' || o === null || Array.isArray(o)) throw new ErreurHttp(400, `profil.${nom} doit être un objet.`);
    const autres = Object.keys(o).filter(k => !cles.includes(k));
    if (autres.length) throw new ErreurHttp(400, `profil.${nom} : champs inconnus : ${autres.join(', ')}.`);
    for (const [k, v] of Object.entries(o)) if (typeof v !== 'string' || v.length > max) throw new ErreurHttp(400, `profil.${nom}.${k} : chaîne de ${max} caractères au plus.`);
    return Object.fromEntries(cles.map(k => [k, o[k] ?? actuel[nom]?.[k] ?? '']));
  };
  // NOTE: variantes nommées par champ (titres, accroches, resumes) et par cible : liste complète remplacée à chaque envoi, absente = conservée
  const variantes = p.variantes === undefined ? actuel.variantes : validerVariantes(p.variantes);
  return { accroche: p.accroche ?? actuel.accroche ?? '', resume: p.resume ?? actuel.resume ?? '', variantes, accroches: sousObjet('accroches', CLES_ACCROCHES), titres: sousObjet('titres', CLES_ACCROCHES), resumes: sousObjet('resumes', CLES_ACCROCHES, 3000), contact: sousObjet('contact', CHAMPS_CONTACT) };
}
const CHAMPS_VARIANTES = ['titres', 'accroches', 'resumes'];
const MAX_VARIANTES = 20;
function validerVariantes(v) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ErreurHttp(400, 'profil.variantes doit être un objet { titres, accroches, resumes }.');
  const inconnus = Object.keys(v).filter(k => !CHAMPS_VARIANTES.includes(k));
  if (inconnus.length) throw new ErreurHttp(400, `profil.variantes : champs inconnus : ${inconnus.join(', ')}.`);
  return Object.fromEntries(CHAMPS_VARIANTES.map(champ => {
    const parCible = v[champ] ?? {};
    if (typeof parCible !== 'object' || parCible === null || Array.isArray(parCible)) throw new ErreurHttp(400, `profil.variantes.${champ} doit être un objet par cible.`);
    const autres = Object.keys(parCible).filter(k => !CLES_ACCROCHES.includes(k));
    if (autres.length) throw new ErreurHttp(400, `profil.variantes.${champ} : cibles inconnues : ${autres.join(', ')}.`);
    const max = champ === 'resumes' ? 3000 : 400;
    return [champ, Object.fromEntries(CLES_ACCROCHES.map(cible => {
      const liste = parCible[cible] ?? [];
      if (!Array.isArray(liste) || liste.length > MAX_VARIANTES) throw new ErreurHttp(400, `profil.variantes.${champ}.${cible} : liste de ${MAX_VARIANTES} variantes au plus.`);
      return [cible, liste.map(x => {
        if (typeof x !== 'object' || x === null || typeof x.nom !== 'string' || typeof x.texte !== 'string' || !x.nom.trim() || !x.texte.trim() || x.nom.length > 60 || x.texte.length > max) {
          throw new ErreurHttp(400, `profil.variantes.${champ}.${cible} : variantes { nom (60 caractères au plus), texte (${max} au plus) } attendues.`);
        }
        return { nom: x.nom.trim(), texte: x.texte };
      })];
    }))];
  }));
}
const lireProfil = () => {
  const r = db.prepare("SELECT valeur FROM kv WHERE cle = 'profil'").get();
  const p = r ? JSON.parse(String(r.valeur)) : {};
  return { accroche: '', resume: '', ...p, variantes: validerVariantes(p.variantes ?? {}), accroches: Object.fromEntries(CLES_ACCROCHES.map(k => [k, p.accroches?.[k] ?? ''])), titres: Object.fromEntries(CLES_ACCROCHES.map(k => [k, p.titres?.[k] ?? ''])), resumes: Object.fromEntries(CLES_ACCROCHES.map(k => [k, p.resumes?.[k] ?? ''])), contact: Object.fromEntries(CHAMPS_CONTACT.map(k => [k, p.contact?.[k] ?? ''])) };
};

// --- CV (schéma v8) : CV de référence (texte extrait du PDF) et versions exportées (instantanés figés) ---
const META_REFERENCE = 'id, fichier, importe_le, pages, length(texte) AS caracteres';
/** @type {(avecTexte?: boolean) => any} */
const referenceActuelle = (avecTexte = false) => db.prepare(`SELECT ${avecTexte ? 'id, fichier, importe_le, pages, texte' : META_REFERENCE} FROM cv_references ORDER BY importe_le DESC, rowid DESC LIMIT 1`).get() ?? null;
const versionFront = r => ({ id: r.id, nom: r.nom, cible: r.cible, categorie: r.categorie, offre_id: r.offre_id, candidature_id: r.candidature_id, reference_id: r.reference_id, cree_le: r.cree_le, ecarts: r.ecarts, avertissements: r.avertissements });
const listerVersions = () => db.prepare('SELECT * FROM cv_versions ORDER BY cree_le DESC').all().map(versionFront);
const etatCv = () => ({ profil: lireProfil(), experiences: experiences.tout(), formations: formations.tout(), competences: competences.tout(), projets: projets.tout() });

// ANCHOR: extrait le texte d'un PDF avec pdftotext (poppler-utils) ; en cas d'échec la référence précédente reste en place
function importerReference(pdf, fichier) {
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ErreurHttp(400, "Ce fichier n'est pas un PDF : la référence précédente est conservée.");
  const dossier = mkdtempSync(join(tmpdir(), 'suivi-cv-'));
  let texte;
  try {
    const chemin = join(dossier, 'reference.pdf');
    writeFileSync(chemin, pdf);
    texte = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', chemin, '-'], { encoding: 'utf8', maxBuffer: 20e6, timeout: 30000 });
  } catch (e) {
    if (e.code === 'ENOENT') throw new ErreurHttp(503, 'pdftotext est absent (paquet poppler-utils) : la référence précédente est conservée.');
    throw new ErreurHttp(400, `PDF illisible (${String(e.message ?? e).split('\n')[0]}) : la référence précédente est conservée.`);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
  if (texte.replace(/\s/g, '').length < 200) throw new ErreurHttp(400, 'PDF sans texte exploitable (scanné ou image ?) : la référence précédente est conservée.');
  const ligne = { id: nouvelId('r-'), fichier: String(fichier || 'cv.pdf').slice(0, 200), importe_le: new Date().toISOString(), pages: (texte.match(/\f/g) ?? []).length || 1, texte };
  transaction(() => {
    db.prepare('INSERT INTO cv_references (id, fichier, importe_le, pages, texte) VALUES (?, ?, ?, ?, ?)').run(ligne.id, ligne.fichier, ligne.importe_le, ligne.pages, ligne.texte);
    journaliser(db, { entite: 'cv_reference', id: ligne.id, libelle: ligne.fichier, action: 'creation' });
  });
  return referenceActuelle();
}

// Compose le CV d'une cible : general, metier (categorie) ou offre (offre_id ; catégorie et compétences trouvées dans l'annonce)
async function composer(d) {
  if (typeof d !== 'object' || d === null) throw new ErreurHttp(400, 'Objet JSON attendu : { cible, categorie?, offre_id? }.');
  // NOTE: le champ angle a été renommé metier (schéma v26) : l'ignorer en silence composerait le CV pour un mauvais métier
  if ('angle' in d) throw new ErreurHttp(400, 'Le champ angle a été renommé metier (general, comptabilite, formateur_digital, web_design ou dev_web).');
  const etat = etatCv();
  /** @type {any} */
  let offre = null;
  let categorie = d.categorie ?? '';
  let prioritaires = [];
  // NOTE: choix du modèle (metier, prioritaires) validés pour toute cible, appliqués seulement à une offre
  if (d.metier !== undefined && d.metier !== 'general' && !METIERS_CV.includes(d.metier)) throw new ErreurHttp(400, `Métier inconnu : ${String(d.metier).slice(0, 40)}.`);
  if (d.prioritaires !== undefined && (!Array.isArray(d.prioritaires) || d.prioritaires.some(id => typeof id !== 'string'))) throw new ErreurHttp(400, 'prioritaires : liste d\'identifiants de compétences attendue.');
  if (d.cible === 'offre') {
    offre = d.offre_id ? lireOffre(String(d.offre_id)) : null;
    if (!offre) throw new ErreurHttp(404, `Offre ${d.offre_id ?? ''} introuvable.`);
    // NOTE: sans analyse (Ollama en panne ou désactivé), le ciblage se fait sur le titre et l'annonce ; sans annonce, sur la seule catégorie
    const logiciels = offre.analyse?.reponses?.logiciels ?? offre.analyse?.logiciels ?? [];
    prioritaires = prioritairesOffre(etat.competences, { titre: offre.titre, annonce: [offre.annonce, ...logiciels].join(' ') });
    categorie = categorie || (METIERS_CV.includes(offre.categorie) ? offre.categorie : '');
    // NOTE: métier explicite (choisi par le modèle) : 'general' est un vrai choix, il n'est pas remplacé par la catégorie de l'offre
    if (d.metier !== undefined) categorie = d.metier === 'general' ? '' : d.metier;
    // NOTE: compétences choisies par le modèle (assemblage) : seuls les identifiants du Profil de niveau suffisant sont repris (même seuil que l'assemblage), en plus de celles trouvées dans l'annonce
    if (d.prioritaires !== undefined) {
      const admises = new Set(etat.competences.filter(c => Math.max(Number(c.enseigner) || 0, Number(c.executer) || 0) >= NIVEAU_MIN_ASSEMBLAGE).map(c => c.id));
      prioritaires = [...new Set([...d.prioritaires.filter(id => admises.has(id)), ...prioritaires])];
    }
  }
  let document, pages, tient;
  try {
    ({ document, pages, tient } = await composerCvPages(etat, { cible: d.cible, categorie, prioritaires, offre }));
  } catch (e) {
    if (e instanceof ErreurCv) throw new ErreurHttp(400, e.message);
    throw e;
  }
  const ref = referenceActuelle(true);
  return { document, controle: controlerCv(document, ref?.texte ?? '', texteProfil(etat)), reference: referenceActuelle(), nom: nomCv(document), pages, tient };
}

// ANCHOR: PDF d'un document (composé, ou personnalisé par Claude) : contrôle refait côté serveur, version enregistrée seulement si le PDF est produit
async function produirePdf(d) {
  if (typeof d !== 'object' || d === null) throw new ErreurHttp(400, 'Objet JSON attendu : { document, candidature_id? }.');
  let document;
  try {
    document = validerDocument(d.document);
  } catch (e) {
    if (e instanceof ErreurCv) throw new ErreurHttp(400, e.message);
    throw e;
  }
  const candidature = d.candidature_id ? String(d.candidature_id) : '';
  verifierCandidature(candidature);
  const ref = referenceActuelle(true);
  const controle = controlerCv(document, ref?.texte ?? '', texteProfil(etatCv()));
  let pdf;
  try {
    pdf = await cvPdf(document, { photo: lirePhoto(DOSSIER_DONNEES) });
  } catch (e) {
    throw new ErreurHttp(500, `Génération du PDF impossible (${String(e.message ?? e)}) : aucune version enregistrée.`);
  }
  const v = { id: nouvelId('v-'), nom: typeof d.nom === 'string' && d.nom.trim() ? d.nom.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120) : nomCv(document), cree_le: new Date().toISOString() };
  transaction(() => {
    db.prepare('INSERT INTO cv_versions (id, nom, cible, categorie, offre_id, candidature_id, reference_id, cree_le, ecarts, avertissements, contenu) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(v.id, v.nom, document.cible, document.categorie, document.offre_id || null, candidature || null, ref?.id ?? null, v.cree_le, controle.ecarts, controle.avertissements, JSON.stringify({ document, controle }));
    journaliser(db, { entite: 'cv', id: v.id, libelle: v.nom, action: 'creation' });
  });
  return { pdf, version: versionFront(db.prepare('SELECT * FROM cv_versions WHERE id = ?').get(v.id)), controle };
}

const TYPES_FICHIER = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
// ANCHOR: envoi d'un CV ou d'une lettre exporté (PDF ou Word), nom de fichier réduit à l'ASCII dans l'en-tête
function envoyerFichier(res, nom, format, fichier, entetes = {}) {
  res.writeHead(200, { 'Content-Type': TYPES_FICHIER[format], 'Content-Disposition': `attachment; filename="${nom.replace(/[^\x20-\x7e]/g, '_')}.${format}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...entetes });
  res.end(Buffer.from(fichier));
}
// ANCHOR: suppression d'une version de CV ou de lettre, journalisée (table et entité fixées par le code appelant)
function supprimerVersion(table, entite, v) {
  transaction(() => {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(v.id);
    journaliser(db, { entite, id: String(v.id), libelle: String(v.nom), action: 'suppression' });
  });
}

// --- Lettres de motivation (schéma v23) : un brouillon par offre ou candidature (le textarea de l'interface, que Claude réécrit par l'API), versions exportées figées ---
const DOSSIER_DONNEES = join(ici, 'data');
const lireJson = (t, defaut) => { try { return JSON.parse(String(t)); } catch { return defaut; } };
const brouillonFront = r => ({ cle: r.cle, offre_id: r.offre_id, candidature_id: r.candidature_id, objet: r.objet, destinataire: r.destinataire, texte: r.texte, matrice: validerMatrice(lireJson(r.matrice, {})), origine: r.origine, maj_le: r.maj_le, generation: lireJson(r.generation, {}) });
const lettreVersionFront = r => ({ id: r.id, nom: r.nom, offre_id: r.offre_id, candidature_id: r.candidature_id, cree_le: r.cree_le, ecarts: r.ecarts, avertissements: r.avertissements });
const listerLettres = () => db.prepare('SELECT * FROM lettre_versions ORDER BY cree_le DESC').all().map(lettreVersionFront);
const lireStyleLettre = () => validerStyle(lireJson(db.prepare("SELECT valeur FROM kv WHERE cle = 'lettre_style'").get()?.valeur, {}));
const lireMatriceLettre = () => validerMatrice(lireJson(db.prepare("SELECT valeur FROM kv WHERE cle = 'lettre_matrice'").get()?.valeur, {}));

// NOTE: la clé d'un brouillon est l'identifiant de l'offre, ou celui de la candidature quand elle n'a pas d'offre (candidature spontanée)
// NOTE: clé « metier:<métier> » = lettre générique du métier visé (comme les CV par métier), sans offre ni candidature
const metierLettre = cle => { const a = /^metier:(.+)$/.exec(String(cle))?.[1]; return a && METIERS_CV.includes(a) ? a : ''; };
function cibleLettre(cle) {
  const metier = metierLettre(cle);
  if (metier) return { offre: null, candidature: null, metier };
  /** @type {any} */
  const offre = db.prepare('SELECT id_offre, titre, entreprise, lieu, annonce FROM offres WHERE id_offre = ?').get(cle) ?? null;
  /** @type {any} */
  const candidature = (offre
    ? db.prepare('SELECT id, entreprise, poste, lettre FROM candidatures WHERE offre_id = ? ORDER BY date DESC LIMIT 1').get(cle)
    : db.prepare('SELECT id, entreprise, poste, lettre FROM candidatures WHERE id = ?').get(cle)) ?? null;
  if (!offre && !candidature) throw new ErreurHttp(404, `Offre ou candidature ${String(cle).slice(0, 100)} introuvable.`);
  return { offre, candidature, metier: '' };
}
const texteOffreLettre = o => (o ? [o.titre, o.entreprise, o.lieu, o.annonce].filter(Boolean).join('\n') : '');

// ANCHOR: écriture partielle du brouillon (seuls les champs envoyés changent) ; base_maj_le protège d'un écrasement par une interface restée ouverte
const CHAMPS_BROUILLON = { objet: 300, destinataire: 600, texte: 8000 };
function ecrireBrouillon(cle, d) {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new ErreurHttp(400, 'Objet JSON attendu : { texte?, objet?, destinataire?, matrice?, origine?, base_maj_le? }.');
  for (const [k, max] of Object.entries(CHAMPS_BROUILLON)) {
    if (k in d && typeof d[k] !== 'string') throw new ErreurHttp(400, `${k} doit être une chaîne.`);
    if (k in d && d[k].length > max) throw new ErreurHttp(400, `${k} dépasse ${max} caractères.`);
  }
  if ('origine' in d && !ORIGINES_LETTRE.includes(d.origine)) throw new ErreurHttp(400, `origine : ${ORIGINES_LETTRE.join(', ')}.`);
  const { offre, candidature, metier } = cibleLettre(cle);
  /** @type {any} */
  const avant = db.prepare('SELECT * FROM lettre_brouillons WHERE cle = ?').get(cle);
  if ('generation' in d && (typeof d.generation !== 'object' || d.generation === null || Array.isArray(d.generation))) throw new ErreurHttp(400, 'generation : objet { modele?, duree_ms?, declencheur? }.');
  if (avant && typeof d.base_maj_le === 'string' && d.base_maj_le !== avant.maj_le) throw new ErreurHttp(409, 'La lettre a été modifiée ailleurs (Claude ou un autre onglet) : rechargez-la avant d\'enregistrer.');
  const n = {
    cle, offre_id: offre?.id_offre ?? null, candidature_id: candidature?.id ?? avant?.candidature_id ?? null,
    objet: d.objet ?? avant?.objet ?? '', destinataire: d.destinataire ?? avant?.destinataire ?? '', texte: d.texte ?? avant?.texte ?? '',
    matrice: JSON.stringify(validerMatrice('matrice' in d ? d.matrice : lireJson(avant?.matrice, lireMatriceLettre()))),
    origine: d.origine ?? (('texte' in d) ? 'utilisateur' : avant?.origine ?? 'utilisateur'), maj_le: new Date().toISOString(),
    generation: '',
  };
  // ANCHOR: trace de la dernière génération du texte : fournie par l'appelant (modèle local), posée pour Claude, sinon conservée ; la date est celle de l'écriture
  const genere = d.generation ?? (d.origine === 'claude' && 'texte' in d ? { modele: 'Claude', declencheur: 'reecriture' } : null);
  n.generation = JSON.stringify(genere ? { modele: String(genere.modele ?? '').slice(0, 80), duree_ms: Number.isFinite(genere.duree_ms) ? Math.round(genere.duree_ms) : 0, declencheur: String(genere.declencheur ?? '').slice(0, 40), le: n.maj_le } : lireJson(avant?.generation, {}));
  const libelle = metier ? `Lettre générique · ${LIBELLES_METIER[metier]}` : [offre?.entreprise ?? candidature?.entreprise, offre?.titre ?? candidature?.poste].filter(Boolean).join(' · ');
  // NOTE: le journal garde le nombre de mots du texte, pas le texte entier (plusieurs Ko à chaque frappe enregistrée)
  // NOTE: l'empreinte courte distingue deux textes de même longueur (« neuf » devenu « onze ») : sans elle, la modification n'était ni vue ni enregistrée
  const resume = r => ({ ...r, texte: r ? `${compterMots(r.texte)} mots (${createHash('sha1').update(String(r.texte)).digest('hex').slice(0, 6)})` : '' });
  const changements = avant ? differences(resume(avant), resume(n), ['objet', 'destinataire', 'texte', 'origine', 'matrice']) : [];
  if (avant && !changements.length) return brouillonFront(avant);
  transaction(() => {
    db.prepare(`INSERT INTO lettre_brouillons (cle, offre_id, candidature_id, objet, destinataire, texte, matrice, origine, maj_le, generation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cle) DO UPDATE SET offre_id = excluded.offre_id, candidature_id = excluded.candidature_id, objet = excluded.objet, destinataire = excluded.destinataire, texte = excluded.texte, matrice = excluded.matrice, origine = excluded.origine, maj_le = excluded.maj_le, generation = excluded.generation`)
      .run(n.cle, n.offre_id, n.candidature_id, n.objet, n.destinataire, n.texte, n.matrice, n.origine, n.maj_le, n.generation);
    journaliser(db, { entite: 'lettre', id: cle, libelle, action: avant ? 'modification' : 'creation', changements });
  });
  return brouillonFront(db.prepare('SELECT * FROM lettre_brouillons WHERE cle = ?').get(cle));
}

// ANCHOR: brouillon préparé en arrière-plan (ligne 179) : lancé après l'assemblage du CV depuis une offre, ou à l'arrivée sur une lettre vide.
// Passe par la file du modèle local (après le CV déjà demandé) et n'écrit que si la lettre est toujours vide : jamais d'écrasement d'un texte de l'utilisateur ou de Claude.
/** @type {Map<string, { etat: 'attente' | 'ok' | 'echec', debut: string, modele?: string, duree_ms?: number, erreur?: string, code?: string }>} */
const preparations = new Map();
const texteBrouillon = cle => String(/** @type {any} */ (db.prepare('SELECT texte FROM lettre_brouillons WHERE cle = ?').get(cle))?.texte ?? '').trim();
function preparerLettre(idOffre) {
  const { offre } = cibleLettre(idOffre);
  if (!offre) throw new ErreurHttp(404, `Offre ${String(idOffre).slice(0, 100)} introuvable.`);
  if (texteBrouillon(idOffre)) return { etat: 'existe' };
  // NOTE: états terminés oubliés après une heure (la Map ne grossit pas)
  for (const [k, v] of preparations) if (v.etat !== 'attente' && Date.now() - Date.parse(v.debut) > 3_600_000) preparations.delete(k);
  const deja = preparations.get(idOffre);
  if (deja?.etat === 'attente') return deja;
  /** @type {any} */
  const p = { etat: 'attente', debut: new Date().toISOString() };
  preparations.set(idOffre, p);
  redigerLettre(db, idOffre, lireMatriceLettre()).then(r => {
    if (!texteBrouillon(idOffre)) {
      /** @type {any} */
      const avant = db.prepare('SELECT objet, destinataire FROM lettre_brouillons WHERE cle = ?').get(idOffre);
      ecrireBrouillon(idOffre, { texte: r.texte, objet: avant?.objet || r.objet, destinataire: avant?.destinataire || [offre.entreprise, offre.lieu].filter(Boolean).join('\n'), matrice: r.matrice, origine: 'qwen', generation: { modele: r.modele, duree_ms: r.duree_ms, declencheur: 'auto' } });
    }
    preparations.set(idOffre, { etat: 'ok', debut: p.debut, modele: r.modele, duree_ms: r.duree_ms });
  }, e => preparations.set(idOffre, { etat: 'echec', debut: p.debut, erreur: String(e.message ?? e), code: e.code }));
  return p;
}

// NOTE: lettres déjà rédigées pour d'autres candidatures (dernière version de chacune), source du conseil « repetition » ; la lettre en cours est exclue
function lettresPrecedentes(cle, candidatureId) {
  const vues = new Set();
  return /** @type {any[]} */ (db.prepare("SELECT nom, offre_id, candidature_id, contenu FROM lettre_versions WHERE candidature_id IS NOT NULL AND candidature_id <> '' ORDER BY cree_le DESC").all()).flatMap(v => {
    if (vues.has(v.candidature_id) || v.candidature_id === candidatureId || (cle && v.offre_id === cle)) return [];
    vues.add(v.candidature_id);
    const texte = lireJson(v.contenu, {})?.lettre?.texte;
    return typeof texte === 'string' && texte ? [{ nom: String(v.nom), texte }] : [];
  });
}

function controleLettre(texte, cle, matrice) {
  const cible = cle ? cibleLettre(cle) : null;
  return controlerLettre(String(texte ?? ''), {
    reference: referenceActuelle(true)?.texte ?? '', profil: texteProfil(etatCv()), offre: texteOffreLettre(cible?.offre ?? null), matrice: validerMatrice(matrice ?? lireMatriceLettre()),
    eviter: lireStyleLettre().eviter, precedentes: lettresPrecedentes(cle, cible?.candidature?.id ?? ''),
  });
}

// ANCHOR: export PDF ou Word d'une lettre : contrôle refait côté serveur, version enregistrée seulement si le fichier est produit, candidature marquée « lettre jointe »
async function exporterLettre(d, format) {
  if (typeof d !== 'object' || d === null) throw new ErreurHttp(400, 'Objet JSON attendu : { lettre, cle?, candidature_id?, nom?, origine? }.');
  let lettre;
  try {
    lettre = validerLettre(d.lettre);
  } catch (e) {
    if (e instanceof ErreurLettre) throw new ErreurHttp(400, e.message);
    throw e;
  }
  const cible = d.cle ? cibleLettre(String(d.cle)) : { offre: null, candidature: null, metier: '' };
  const candidature = d.candidature_id ? String(d.candidature_id) : cible.candidature?.id ?? '';
  verifierCandidature(candidature);
  const matrice = d.cle ? validerMatrice(lireJson(db.prepare('SELECT matrice FROM lettre_brouillons WHERE cle = ?').get(String(d.cle))?.matrice, lireMatriceLettre())) : lireMatriceLettre();
  const controle = controleLettre(lettre.texte, d.cle ? String(d.cle) : '', matrice);
  const signature = lireSignature(DOSSIER_DONNEES);
  let fichier;
  try {
    fichier = format === 'docx' ? lettreDocx(lettre, { signature }) : await lettrePdf(lettre, { signature });
  } catch (e) {
    throw new ErreurHttp(500, `Génération du fichier impossible (${String(e.message ?? e)}) : aucune version enregistrée.`);
  }
  const c = candidature ? /** @type {any} */ (db.prepare('SELECT entreprise, poste, lettre FROM candidatures WHERE id = ?').get(candidature)) : null;
  const nomPropose = cible.metier && !c ? nomLettre({ nom: lettre.entete.nom, poste: LIBELLES_METIER[cible.metier] }) : nomLettre({ nom: lettre.entete.nom, entreprise: cible.offre?.entreprise ?? c?.entreprise ?? '', poste: cible.offre?.titre ?? c?.poste ?? '' });
  const v = { id: nouvelId('l-'), nom: typeof d.nom === 'string' && d.nom.trim() ? d.nom.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120) : nomPropose, cree_le: new Date().toISOString() };
  const origine = ORIGINES_LETTRE.includes(d.origine) ? d.origine : 'utilisateur';
  transaction(() => {
    db.prepare('INSERT INTO lettre_versions (id, nom, offre_id, candidature_id, cree_le, ecarts, avertissements, contenu) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(v.id, v.nom, cible.offre?.id_offre ?? null, candidature || null, v.cree_le, controle.ecarts, controle.avertissements, JSON.stringify({ lettre, controle, matrice, origine, format }));
    journaliser(db, { entite: 'lettre_version', id: v.id, libelle: v.nom, action: 'creation' });
    if (c && !c.lettre) modifierCandidature(candidature, { lettre: true });
  });
  return { fichier, version: lettreVersionFront(db.prepare('SELECT * FROM lettre_versions WHERE id = ?').get(v.id)) };
}

// NOTE: une lettre déjà exportée pour l'offre (sans candidature) suit la candidature créée, comme les CV (rattacherCvs)
function rattacherLettres(idOffre, idCandidature) {
  // NOTE: comme pour le CV, une seule version est liée (la plus récente) ; les essais précédents restent libres
  const v = db.prepare('SELECT id, nom FROM lettre_versions WHERE offre_id = ? AND candidature_id IS NULL ORDER BY cree_le DESC LIMIT 1').get(idOffre);
  if (v) {
    db.prepare('UPDATE lettre_versions SET candidature_id = ? WHERE id = ?').run(idCandidature, v.id);
    journaliser(db, { entite: 'lettre_version', id: String(v.id), libelle: String(v.nom), action: 'modification', changements: [{ champ: 'candidature_id', avant: '', apres: idCandidature }] });
  }
  db.prepare('UPDATE lettre_brouillons SET candidature_id = ? WHERE cle = ? AND candidature_id IS NULL').run(idCandidature, idOffre);
}

// --- État complet : parcours, profil, conseils, to-do, candidatures, tâches et échanges ---
function lireEtat() {
  const kv = Object.fromEntries(db.prepare('SELECT cle, valeur FROM kv').all().map(r => [r.cle, JSON.parse(String(r.valeur))]));
  return {
    candidatures: db.prepare('SELECT * FROM candidatures').all().map(versFront),
    taches: taches.tout(),
    echanges: echanges.tout(),
    competences: competences.tout(),
    formations: formations.tout(),
    experiences: experiences.tout(),
    projets: projets.tout(),
    contacts: contacts.tout(),
    rendez_vous: rendezVous.tout(),
    profil: lireProfil(),
    cvReference: referenceActuelle(),
    cvVersions: listerVersions(),
    lettreVersions: listerLettres(),
    lettreMatrice: lireMatriceLettre(),
    lettreStyle: lireStyleLettre(),
    signature: Boolean(lireSignature(DOSSIER_DONNEES)),
    photo: Boolean(lirePhoto(DOSSIER_DONNEES)),
    conseils: kv.conseils ?? '',
    todo: kv.todo ?? '',
  };
}

// NOTE: PUT /api/state ne supprime jamais de candidature (DELETE /api/candidatures/:id le fait) : un état partiel ne peut rien effacer.
// Les tâches et échanges passent uniquement par leurs routes.
function ecrireEtat(etat) {
  if (typeof etat !== 'object' || etat === null) throw new ErreurHttp(400, 'Objet JSON attendu.');
  // NOTE: depuis le schéma v7, compétences et titres ont leurs routes : un onglet resté ouvert sur l'ancienne interface ne doit pas écrire dans le vide
  if ('skills' in etat || 'titres' in etat) throw new ErreurHttp(400, 'Interface périmée (compétences et titres ont changé de format) : rechargez la page.');
  const profil = 'profil' in etat ? validerProfil(etat.profil) : null;
  transaction(() => {
    if (Array.isArray(etat.candidatures)) {
      /** @type {Map<any, any>} */
      const existantes = new Map(db.prepare('SELECT * FROM candidatures').all().map(r => [r.id, r]));
      for (const d of etat.candidatures) {
        valider(d, CHAMPS_CANDIDATURE, true);
        const n = versBase(d);
        const avant = existantes.get(n.id);
        // NOTE: un état sans le champ lieux ne doit pas effacer les lieux déjà enregistrés
        if (avant && !('lieux' in d)) n.lieux = avant.lieux;
        if (avant && !('lien' in d)) n.lien = avant.lien;
        if (avant && !('enseignements' in d)) n.enseignements = avant.enseignements;
        if ((avant?.offre_id ?? null) !== n.offre_id) verifierOffre(n, n.id);
        if (!avant) insererCandidature(n);
        else if (COLS.some(c => (avant[c] ?? null) !== (n[c] ?? null))) remplacerCandidature(n, avant);
      }
    }
    const kv = db.prepare('INSERT INTO kv (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur');
    if (profil) kv.run('profil', JSON.stringify(profil));
    if (typeof etat.conseils === 'string') kv.run('conseils', JSON.stringify(etat.conseils));
    if (typeof etat.todo === 'string') kv.run('todo', JSON.stringify(etat.todo));
  });
}

// --- Offres : synchronisées (France Travail) ou saisies à la main (id man-...) ---
const SELECT_OFFRE = `SELECT o.*, (SELECT c.id FROM candidatures c WHERE c.offre_id = o.id_offre LIMIT 1) AS candidature_id, (SELECT json_insert(a.reponses, '$.provider', a.provider, '$.modele', a.modele, '$.date', a.date, '$.duree_ms', a.duree_ms) FROM analyses a WHERE a.id_offre = o.id_offre) AS analyse_json FROM offres o`;

// ANCHOR: l'analyse du modèle (réponses et note calculée) remplace la colonne brute analyse_json, null si l'offre n'est pas analysée
// NOTE: années du parcours par catégorie, lues à chaque requête (quelques lignes) pour que la note suive les modifications du Profil
const anneesProfil = () => anneesParCategorie(experiences.tout());
/** @type {(annees: Record<string, number>) => (o: Record<string, any>) => Record<string, any>} */
const finOffre = annees => ({ analyse_json, ...o }) => ({ ...o, ...etatEpingle(o.epinglee_le), analyse: lireAnalyse(analyse_json, { anneesProfil: annees[o.categorie] ?? 0 }) });
// ANCHOR: épingle d'une offre : active pendant JOURS_EPINGLE jours à partir de la date d'épinglage, jours_epingle = jours restants (0 = expire aujourd'hui)
const etatEpingle = (le = '') => {
  const restant = le ? JOURS_EPINGLE - Math.round((Date.parse(aujourdhui()) - Date.parse(le)) / 86400000) : 0;
  return restant > 0 ? { epinglee: true, jours_epingle: restant } : { epinglee: false, jours_epingle: null };
};
const estManuelle = id => id.startsWith('man-');

// ANCHOR: champs modifiables. postuler_via, description (notes), ignoree, vue et expiree sur toutes les offres ; le reste, dont annonce (texte de l'offre), seulement sur une offre manuelle (la synchro réécrit les autres)
const CHAMPS_OFFRE_LIBRES = { ignoree: { type: 'booleen' }, vue: { type: 'booleen' }, expiree: { type: 'booleen' }, epinglee: { type: 'booleen' }, postuler_via: {}, description: {} };
const CHAMPS_OFFRE_MANUELLE = {
  ...CHAMPS_OFFRE_LIBRES,
  titre: { requis: true }, entreprise: {}, ville: {}, departement: {}, contrat: {}, salaire: {}, lien: { type: 'url' }, source: {}, annonce: {},
  date_detection: { type: 'date' }, categorie: { valeurs: CATEGORIES_OFFRE },
};
const COLS_OFFRE = ['titre', 'entreprise', 'lieu', 'departement', 'ville', 'proche', 'contrat', 'salaire', 'lien', 'date_detection', 'categorie', 'ignoree', 'vue', 'expiree', 'source', 'postuler_via', 'description', 'annonce', 'epinglee_le'];

function listerOffres(q) {
  const where = [];
  const params = [];
  if (q.get('categorie')) { where.push('o.categorie = ?'); params.push(q.get('categorie')); }
  if (q.get('contrat')) { where.push('o.contrat = ?'); params.push(q.get('contrat')); }
  if (q.get('source')) { where.push('o.source = ?'); params.push(q.get('source')); }
  if (q.get('manuelles') === '1') where.push("o.id_offre LIKE 'man-%'");
  if (q.get('manuelles') === '0') where.push("o.id_offre NOT LIKE 'man-%'");
  const zone = q.get('zone');
  if (zone === 'proche') where.push('o.proche = 1');
  else if (/^(\d{2,3}|2[AB])$/.test(zone || '')) { where.push('o.departement = ?'); params.push(zone); }
  if (q.get('ignorees') === '0' || q.get('ignorees') === '1') { where.push('o.ignoree = ?'); params.push(Number(q.get('ignorees'))); }
  if (q.get('vues') === '0' || q.get('vues') === '1') { where.push('o.vue = ?'); params.push(Number(q.get('vues'))); }
  if (q.get('expirees') === '0' || q.get('expirees') === '1') { where.push('o.expiree = ?'); params.push(Number(q.get('expirees'))); }
  if (q.get('epinglees') === '1') { where.push("o.epinglee_le != '' AND o.epinglee_le > date('now', 'localtime', ?)"); params.push(`-${JOURS_EPINGLE} days`); }
  if (q.get('suivie') === '1') where.push('EXISTS (SELECT 1 FROM candidatures c WHERE c.offre_id = o.id_offre)');
  if (q.get('suivie') === '0') where.push('NOT EXISTS (SELECT 1 FROM candidatures c WHERE c.offre_id = o.id_offre)');
  if (q.get('q')) {
    where.push("(o.titre || ' ' || o.entreprise || ' ' || o.ville || ' ' || o.description || ' ' || o.annonce) LIKE ? ESCAPE '\\'");
    params.push('%' + q.get('q').replace(/[\\%_]/g, c => '\\' + c) + '%');
  }
  let sql = `${SELECT_OFFRE}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY o.date_detection DESC, o.id_offre DESC`;
  const limite = Number(q.get('limite'));
  if (limite > 0) { sql += ' LIMIT ? OFFSET ?'; params.push(Math.min(limite, 2000), Math.max(Number(q.get('decalage')) || 0, 0)); }
  return db.prepare(sql).all(...params).map(finOffre(anneesProfil()));
}

const lireOffre = id => {
  const o = db.prepare(`${SELECT_OFFRE} WHERE o.id_offre = ?`).get(id);
  return o && finOffre(anneesProfil())(o);
};

// Complète une offre manuelle : lieu, zone proche et catégorie calculés comme pour une offre synchronisée
function completerOffre(o, titreChange) {
  const departement = (o.departement ?? '').trim();
  const ville = (o.ville ?? '').trim();
  return {
    ...o,
    departement,
    ville,
    lieu: departement && ville ? `${departement} - ${ville}` : departement || ville,
    proche: estProche(departement, ville),
    categorie: titreChange ? classer(o.titre) : o.categorie,
  };
}

function creerOffre(b) {
  valider(b, CHAMPS_OFFRE_MANUELLE, true);
  const id = b.id ?? nouvelId('man-');
  if (!estManuelle(id)) throw new ErreurHttp(400, "L'identifiant d'une offre saisie à la main commence par man-.");
  if (lireOffre(id)) throw new ErreurHttp(409, `L'offre ${id} existe déjà.`);
  const vide = Object.fromEntries(COLS_OFFRE.map(c => [c, '']));
  const o = completerOffre({ ...vide, date_detection: aujourdhui(), ...b, source: b.source?.trim() || 'Saisie manuelle', ignoree: b.ignoree ? 1 : 0, vue: b.vue ? 1 : 0, expiree: b.expiree ? 1 : 0, titre: b.titre.trim() }, !b.categorie);
  transaction(() => {
    db.prepare(`INSERT INTO offres (id_offre, ${COLS_OFFRE.join(', ')}) VALUES (?, ${COLS_OFFRE.map(() => '?').join(', ')})`).run(id, ...COLS_OFFRE.map(c => o[c] ?? ''));
    journaliser(db, { entite: 'offre', id, libelle: o.titre, action: 'creation' });
  });
  return lireOffre(id);
}

function modifierOffre(id, b) {
  /** @type {any} */
  const avant = lireOffre(id);
  if (!avant) throw new ErreurHttp(404, `Offre ${id} introuvable.`);
  const champs = estManuelle(id) ? CHAMPS_OFFRE_MANUELLE : CHAMPS_OFFRE_LIBRES;
  if (typeof b === 'object' && b !== null && !Array.isArray(b)) {
    const interdits = Object.keys(b).filter(k => !(k in champs));
    if (interdits.length) throw new ErreurHttp(400, `Champs modifiables : ${Object.keys(champs).join(', ')} (reçu : ${interdits.join(', ')}).`);
  }
  valider(b, champs, false);
  if ('id' in b && b.id !== id) throw new ErreurHttp(400, "L'identifiant ne peut pas être modifié.");
  // NOTE: épingler (re)démarre le délai à aujourd'hui, désépingler vide la date ; le champ stocké est epinglee_le, jamais envoyé tel quel
  const { epinglee, ...reste } = b;
  const epinglee_le = 'epinglee' in b ? (epinglee ? aujourdhui() : '') : avant.epinglee_le;
  let o = { ...avant, ...reste, epinglee_le: ('ignoree' in b && b.ignoree) ? '' : epinglee_le, ignoree: ('ignoree' in b ? b.ignoree : avant.ignoree) ? 1 : 0, vue: ('vue' in b ? b.vue : avant.vue) ? 1 : 0, expiree: ('expiree' in b ? b.expiree : avant.expiree) ? 1 : 0 };
  if (estManuelle(id)) o = completerOffre(o, 'titre' in b && !('categorie' in b) && b.titre !== avant.titre);
  transaction(() => {
    db.prepare(`UPDATE offres SET ${COLS_OFFRE.map(c => c + ' = ?').join(', ')} WHERE id_offre = ?`).run(...COLS_OFFRE.map(c => o[c] ?? ''), id);
    const changements = differences(avant, o, COLS_OFFRE);
    if (changements.length) journaliser(db, { entite: 'offre', id, libelle: o.titre, action: 'modification', changements });
  });
  return lireOffre(id);
}

// NOTE: une vérification par offre toutes les 6 h (mémoire du serveur) ; seules les offres France Travail directes (pas les man-) sont contrôlables
const VERIFIEES = new Map();
const DELAI_VERIF_MS = 6 * 3600_000;
async function controlerAnnonce(id) {
  const o = lireOffre(id);
  if (!o) throw new ErreurHttp(404, `Offre ${id} introuvable.`);
  if (o.source !== 'France Travail' || estManuelle(id) || o.expiree) return { statut: 'inconnu', protegee: false, marquee: false };
  let statut = VERIFIEES.get(id);
  if (!statut || Date.now() - statut.ts > DELAI_VERIF_MS) {
    statut = { statut: await verifierEnLigne(id), ts: Date.now() };
    if (statut.statut !== 'inconnu') VERIFIEES.set(id, statut);
  }
  return appliquerVerification(db, id, statut.statut);
}

function supprimerOffre(id) {
  const o = lireOffre(id);
  if (!o) throw new ErreurHttp(404, `Offre ${id} introuvable.`);
  if (!estManuelle(id)) throw new ErreurHttp(400, 'Seule une offre saisie à la main peut être supprimée (les autres peuvent être écartées).');
  if (o.candidature_id) throw new ErreurHttp(400, `L'offre est liée à la candidature ${o.candidature_id} : retirer le lien d'abord.`);
  transaction(() => {
    db.prepare('DELETE FROM offres WHERE id_offre = ?').run(id);
    journaliser(db, { entite: 'offre', id, libelle: o.titre, action: 'suppression' });
  });
}

// --- Google Agenda (ligne 120) : calendrier choisi dans Admin (kv agenda), événements lus à la demande avec un cache d'une minute ---
const lireChoixAgenda = () => {
  const r = db.prepare("SELECT valeur FROM kv WHERE cle = 'agenda'").get();
  return { calendrier_id: '', calendrier_nom: '', ...(r ? JSON.parse(String(r.valeur)) : {}) };
};
const etatAgenda = () => ({ ...agenda.etat(), ...lireChoixAgenda() });
/** @type {Map<string, { quand: number, evenements: any[] }>} */
const cacheAgenda = new Map();
const ORIGINE_LOCALE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

// NOTE: erreur Google vers réponse HTTP : configuration absente 503, connexion à refaire 401, le reste 502 (Google injoignable ou en erreur)
function erreurAgenda(res, e) {
  if (!(e instanceof ErreurSync)) throw e;
  const statut = { config: 503, auth: 401, introuvable: 404 }[e.code] ?? 502;
  return json(res, statut, { erreur: e.message, code: e.code });
}

// ANCHOR: le retour de Google se fait par une navigation : on renvoie vers l'interface (Vite en développement, ce serveur sinon) avec le résultat dans l'URL
function retourInterface(res, retour, resultat) {
  const base = ORIGINE_LOCALE.test(retour ?? '') ? retour : `http://localhost:${PORT}`;
  res.writeHead(302, { Location: `${base}/?${new URLSearchParams(resultat)}#admin`, 'Cache-Control': 'no-store' });
  res.end();
}

async function routeAgenda(req, res, p, q, m) {
  if (p === '/api/agenda') {
    if (m === 'GET') return json(res, 200, etatAgenda());
    // NOTE: choix du calendrier, vérifié dans la liste de Google (calendriers possédés seulement)
    if (m === 'PUT') {
      const d = await corps(req);
      if (typeof d?.calendrier_id !== 'string') throw new ErreurHttp(400, 'calendrier_id attendu.');
      let choix = { calendrier_id: '', calendrier_nom: '' };
      if (d.calendrier_id) {
        let liste;
        try { liste = await agenda.calendriers(); } catch (e) { return erreurAgenda(res, e); }
        const c = liste.find(x => x.id === d.calendrier_id);
        if (!c) throw new ErreurHttp(400, 'Calendrier introuvable parmi ceux dont vous êtes propriétaire.');
        choix = { calendrier_id: c.id, calendrier_nom: c.nom };
      }
      db.prepare("INSERT INTO kv (cle, valeur) VALUES ('agenda', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(JSON.stringify(choix));
      cacheAgenda.clear();
      return json(res, 200, etatAgenda());
    }
  } else if (p === '/api/agenda/connexion') {
    // ANCHOR: navigation vers la page de consentement de Google ; retour = origine de l'interface, redirection = ce serveur en boucle locale
    if (m === 'GET') {
      const retour = q.get('retour') ?? '';
      try {
        res.writeHead(302, { Location: agenda.urlConnexion({ redirection: `http://127.0.0.1:${PORT}/api/agenda/retour`, retour }), 'Cache-Control': 'no-store' });
        return res.end();
      } catch (e) {
        if (!(e instanceof ErreurSync)) throw e;
        return retourInterface(res, retour, { agenda_erreur: e.message });
      }
    }
  } else if (p === '/api/agenda/retour') {
    if (m === 'GET') {
      try {
        const { retour } = await agenda.echangerCode({ state: q.get('state'), code: q.get('code'), erreur: q.get('error') });
        cacheAgenda.clear();
        return retourInterface(res, retour, { agenda: 'connecte' });
      } catch (e) {
        if (!(e instanceof ErreurSync)) throw e;
        return retourInterface(res, /** @type {any} */ (e).retour, { agenda_erreur: e.message });
      }
    }
  } else if (p === '/api/agenda/deconnexion') {
    if (m === 'POST') {
      const r = await agenda.deconnecter();
      cacheAgenda.clear();
      return json(res, 200, { ...etatAgenda(), ...r });
    }
  } else if (p === '/api/agenda/calendriers') {
    if (m === 'GET') {
      try { return json(res, 200, await agenda.calendriers()); } catch (e) { return erreurAgenda(res, e); }
    }
  } else if (p === '/api/agenda/evenements') {
    // ANCHOR: ?du&au (AAAA-MM-JJ, défaut aujourd'hui et 14 jours), ?frais=1 ignore le cache d'une minute
    if (m === 'GET') {
      const du = q.get('du') || aujourdhui();
      const au = q.get('au') || jourLocal(new Date(Date.parse(du + 'T12:00:00Z') + 14 * 86_400_000));
      if (!JOUR.test(du) || !JOUR.test(au) || au < du) throw new ErreurHttp(400, 'du et au : dates AAAA-MM-JJ, au après du.');
      if ((Date.parse(au) - Date.parse(du)) / 86_400_000 > 366) throw new ErreurHttp(400, 'Une année au plus par requête.');
      const { calendrier_id: cal } = lireChoixAgenda();
      if (!cal) return json(res, 409, { erreur: 'Aucun calendrier choisi : en choisir un dans Admin.', code: 'calendrier' });
      const cle = `${cal}|${du}|${au}`;
      const c = cacheAgenda.get(cle);
      try {
        await renvoyerEnAttente();
        if (c && q.get('frais') !== '1' && Date.now() - c.quand < 60_000) return json(res, 200, { du, au, evenements: await fusionnerEvenements(c.evenements, du, au, cal) });
        const evenements = await agenda.evenements(cal, du, au);
        cacheAgenda.set(cle, { quand: Date.now(), evenements });
        return json(res, 200, { du, au, evenements: await fusionnerEvenements(evenements, du, au, cal) });
      } catch (e) { return erreurAgenda(res, e); }
    }
  } else {
    return json(res, 404, { erreur: 'Route inconnue.' });
  }
  return json(res, 405, { erreur: `Méthode ${m} non autorisée sur ${p}.` });
}

// --- Rendez-vous : écriture locale d'abord (transaction et journal), puis envoi vers Google sans jamais perdre le RDV si Google échoue ---
const CHAMPS_SERVEUR_RDV = ['google_id', 'synchro', 'cree'];
function exigerChampsClient(d) {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new ErreurHttp(400, 'Objet JSON attendu.');
  const interdits = CHAMPS_SERVEUR_RDV.filter(k => k in d);
  if (interdits.length) throw new ErreurHttp(400, `Champs gérés par le serveur : ${interdits.join(', ')}.`);
}
// NOTE: offre et contact ne sont pas vérifiés par la collection (seule la candidature l'est) : liens contrôlés ici
function verifierLiensRdv(d) {
  if (d.offre_id) verifierOffres([String(d.offre_id)]);
  if (d.contact_id && !db.prepare('SELECT 1 FROM contacts WHERE id = ?').get(d.contact_id)) throw new ErreurHttp(400, `Contact ${d.contact_id} introuvable.`);
}
function titreParDefaut(d) {
  const c = d.candidature_id ? db.prepare('SELECT entreprise, poste FROM candidatures WHERE id = ?').get(d.candidature_id) : null;
  const o = !c && d.offre_id ? db.prepare('SELECT entreprise, titre FROM offres WHERE id_offre = ?').get(d.offre_id) : null;
  return ['Entretien', c?.entreprise ?? o?.entreprise, c?.poste ?? o?.titre].filter(Boolean).join(', ');
}
// NOTE: ce qui part chez Google : la note, puis le contact (fonction, prénom, téléphone). C'est l'agenda de l'utilisateur.
function descriptionRdv(r) {
  const k = r.contact_id ? db.prepare('SELECT prenom, nom, fonction, telephone FROM contacts WHERE id = ?').get(r.contact_id) : null;
  const contact = k ? ['Contact : ' + [k.prenom, k.nom].filter(Boolean).join(' '), k.fonction, k.telephone].filter(Boolean).join(', ') : '';
  return [r.note, contact].filter(Boolean).join('\n\n');
}
const marquerSynchro = (id, etat) => db.prepare('UPDATE rendez_vous SET synchro = ? WHERE id = ?').run(etat, id);
const agendaPret = () => Boolean(lireChoixAgenda().calendrier_id && agenda.etat().connecte);

// ANCHOR: envoi d'un RDV vers le calendrier choisi. Panne réseau ou accès à refaire : reste a_envoyer (nouvel essai à la prochaine lecture des événements), autre refus de Google : erreur
async function envoyerRdv(id) {
  const r = rendezVous.lire(id);
  if (!r || !agendaPret()) return r;
  const cal = lireChoixAgenda().calendrier_id;
  const corpsRdv = { ...r, description: descriptionRdv(r), suivi: r.id };
  try {
    if (r.google_id) {
      try {
        await agenda.modifier(cal, r.google_id, corpsEvenement(corpsRdv));
      } catch (e) {
        // NOTE: événement supprimé dans Google entre-temps : on le recrée
        if (!(e instanceof ErreurSync && e.code === 'introuvable')) throw e;
        const nouveau = await agenda.creer(cal, corpsRdv);
        db.prepare('UPDATE rendez_vous SET google_id = ? WHERE id = ?').run(nouveau.id, id);
      }
    } else {
      const nouveau = await agenda.creer(cal, corpsRdv);
      db.prepare('UPDATE rendez_vous SET google_id = ? WHERE id = ?').run(nouveau.id, id);
    }
    marquerSynchro(id, 'ok');
  } catch (e) {
    if (!(e instanceof ErreurSync)) throw e;
    marquerSynchro(id, ['reseau', 'auth', 'config'].includes(e.code) ? 'a_envoyer' : 'erreur');
  }
  cacheAgenda.clear();
  return rendezVous.lire(id);
}

async function renvoyerEnAttente() {
  if (!agendaPret()) return;
  for (const r of db.prepare("SELECT id FROM rendez_vous WHERE synchro = 'a_envoyer' ORDER BY debut LIMIT 20").all()) await envoyerRdv(String(r.id));
}

async function creerRdv(d) {
  exigerChampsClient(d);
  verifierLiensRdv(d);
  const r = rendezVous.creer({ ...d, titre: String(d.titre ?? '').trim() || titreParDefaut(d), google_id: null, synchro: 'a_envoyer' });
  return envoyerRdv(r.id);
}

async function modifierRdv(id, d) {
  exigerChampsClient(d);
  verifierLiensRdv(d);
  if (!rendezVous.lire(id)) throw new ErreurHttp(404, `Rendez-vous ${id} introuvable.`);
  rendezVous.modifier(id, d);
  marquerSynchro(id, 'a_envoyer');
  return envoyerRdv(id);
}

// NOTE: l'événement Google est supprimé d'abord : s'il échoue, le RDV local reste (sinon l'événement réapparaîtrait comme externe). ?local=1 supprime seulement ici.
async function supprimerRdv(id, localSeulement) {
  const r = rendezVous.lire(id);
  if (!r) return false;
  if (r.google_id && !localSeulement && r.synchro !== 'annule') await agenda.supprimer(lireChoixAgenda().calendrier_id, r.google_id);
  cacheAgenda.clear();
  return Boolean(rendezVous.supprimer(id));
}

// ANCHOR: rattachement d'un événement créé directement dans Google : RDV local créé à partir de l'événement, puis marqué (suivi) côté Google
async function rattacherEvenement(d) {
  if (typeof d !== 'object' || d === null || typeof d.google_id !== 'string' || !d.google_id) throw new ErreurHttp(400, 'google_id attendu.');
  const liens = { offre_id: d.offre_id ?? null, candidature_id: d.candidature_id ?? null, contact_id: d.contact_id ?? null };
  verifierLiensRdv(liens);
  verifierCandidature(liens.candidature_id);
  if (db.prepare('SELECT 1 FROM rendez_vous WHERE google_id = ?').get(d.google_id)) throw new ErreurHttp(409, 'Cet événement est déjà rattaché.');
  const cal = lireChoixAgenda().calendrier_id;
  if (!cal) throw new ErreurHttp(409, 'Aucun calendrier choisi : en choisir un dans Admin.');
  const e = await agenda.evenement(cal, d.google_id);
  const journee = e.journee;
  const debut = journee ? e.debut.slice(0, 10) + 'T00:00' : heureParis(e.debut);
  const duree = journee ? 1440 : Math.min(1440, Math.max(5, Math.round((Date.parse(e.fin) - Date.parse(e.debut)) / 60_000)));
  const r = rendezVous.creer({
    titre: e.titre, debut, duree, type: e.visio ? 'visio' : 'autre', lieu: e.lieu, lien_visio: /^https?:\/\/\S+$/i.test(e.visio) ? e.visio : '', note: '', ...liens, google_id: e.id, synchro: 'ok',
  });
  try { await agenda.modifier(cal, e.id, { extendedProperties: { private: { suivi: r.id } } }); } catch (x) { if (!(x instanceof ErreurSync)) throw x; }
  cacheAgenda.clear();
  return r;
}

// ANCHOR: fusion des événements Google et des RDV locaux. Un événement rattaché (suivi ou google_id) reprend l'heure modifiée dans Google ; un RDV absent de la liste est vérifié un à un (annulé ou déplacé hors de la période)
async function fusionnerEvenements(evenements, du, au, cal) {
  const parGoogle = new Map(db.prepare('SELECT * FROM rendez_vous WHERE google_id IS NOT NULL').all().map(r => [String(r.google_id), r]));
  const parId = new Map(db.prepare('SELECT * FROM rendez_vous').all().map(r => [String(r.id), r]));
  const vus = new Set();
  const majHeure = (r, debut, duree) => {
    if (r.debut === debut && r.duree === duree) return;
    transaction(() => {
      db.prepare('UPDATE rendez_vous SET debut = ?, duree = ?, synchro = ? WHERE id = ?').run(debut, duree, 'ok', r.id);
      journaliser(db, { entite: 'rendez_vous', id: String(r.id), libelle: String(r.titre) || 'Rendez-vous', action: 'modification', changements: differences(r, { ...r, debut, duree }, ['debut', 'duree']) });
    });
  };
  const resultat = evenements.map(e => {
    const r = parGoogle.get(e.id) ?? (e.suivi ? parId.get(e.suivi) : undefined);
    if (!r) return { ...e, rdv: null };
    vus.add(String(r.id));
    if (!r.google_id) db.prepare('UPDATE rendez_vous SET google_id = ? WHERE id = ?').run(e.id, r.id);
    if (!e.journee) majHeure(r, heureParis(e.debut), Math.max(5, Math.round((Date.parse(e.fin) - Date.parse(e.debut)) / 60_000)));
    else if (r.synchro !== 'ok') marquerSynchro(r.id, 'ok');
    return { ...e, rdv: String(r.id) };
  });
  const absents = db.prepare("SELECT * FROM rendez_vous WHERE google_id IS NOT NULL AND synchro = 'ok' AND substr(debut, 1, 10) BETWEEN ? AND ? ORDER BY debut LIMIT 10").all(du, au).filter(r => !vus.has(String(r.id)));
  for (const r of absents) {
    try {
      const e = await agenda.evenement(cal, String(r.google_id));
      if (e.statut === 'cancelled') marquerSynchro(r.id, 'annule');
      else if (!e.journee) majHeure(r, heureParis(e.debut), Math.max(5, Math.round((Date.parse(e.fin) - Date.parse(e.debut)) / 60_000)));
    } catch (x) {
      if (x instanceof ErreurSync && x.code === 'introuvable') marquerSynchro(r.id, 'annule');
      else if (!(x instanceof ErreurSync)) throw x;
    }
  }
  return resultat;
}

// --- HTTP ---
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };

// ANCHOR: en-têtes de sécurité des pages. connect-src liste les seuls services externes appelés par l'interface (adresses, itinéraires, péages), img-src les fonds de carte
const EN_TETES_SECURITE = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https://tile.openstreetmap.org",
    "connect-src 'self' https://geo.api.gouv.fr https://data.geopf.fr https://router.project-osrm.org https://valhalla1.openstreetmap.de",
    "font-src 'self' data:", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}

// NOTE: décodage UTF-8 du corps entier, un caractère accentué coupé entre deux morceaux reçus serait sinon abîmé
async function corps(req) {
  const t = (await corpsBinaire(req)).toString('utf8');
  try { return JSON.parse(t || '{}'); } catch { throw new ErreurHttp(400, 'JSON invalide.'); }
}

// NOTE: corps brut (fichier envoyé), même plafond de 20 Mo que corps()
function corpsBinaire(req) {
  return new Promise((ok, ko) => {
    /** @type {Buffer[]} */
    const morceaux = [];
    let taille = 0;
    req.on('data', c => { taille += c.length; if (taille > 20e6) { ko(new ErreurHttp(413, 'Fichier trop volumineux (20 Mo au plus).')); req.destroy(); } else morceaux.push(c); });
    req.on('end', () => ok(Buffer.concat(morceaux)));
    req.on('error', ko);
  });
}

async function api(req, res, url) {
  const { pathname: p } = url;
  const q = url.searchParams;
  const m = req.method;
  let r;

  if (p === '/api/agenda' || p.startsWith('/api/agenda/')) return routeAgenda(req, res, p, q, m);
  if (p === '/api/state') {
    if (m === 'GET') return json(res, 200, lireEtat());
    if (m === 'PUT') { ecrireEtat(await corps(req)); return json(res, 200, { ok: true }); }
  } else if (p === '/api/veille') {
    // NOTE: filtres de la veille n8n reçus à la dernière synchro, plus les règles propres à l'app
    if (m === 'GET') {
      const r = db.prepare("SELECT valeur FROM kv WHERE cle = 'veille'").get();
      return json(res, 200, { config: r ? JSON.parse(String(r.valeur)) : null, app: { jours_max: JOURS_MAX, exclus_toujours: EXCLUS_TOUJOURS } });
    }
  } else if (p === '/api/reglages') {
    // ANCHOR: réglages de recherche de la page Admin. PUT ?apercu=1 compte les offres qui seraient retirées sans rien écrire
    if (m === 'GET') return json(res, 200, lireReglages(db));
    if (m === 'PUT') {
      let reglages;
      try {
        reglages = validerReglages(await corps(req));
      } catch (e) {
        if (e instanceof ErreurReglages) throw new ErreurHttp(400, e.message);
        throw e;
      }
      if (q.get('apercu') === '1') return json(res, 200, { retirables: offresRetirables(db, reglages) });
      sauvegardeDuJour(ici, db);
      ecrireReglages(db, reglages);
      return json(res, 200, { reglages, origine: 'app', retirees: retirerOffres(db, reglages) });
    }
  } else if (p === '/api/trajets') {
    // ANCHOR: points de départ et coût du kilomètre (page Admin), pour distance et coût dans la fiche offre
    if (m === 'GET') return json(res, 200, lireTrajets(db));
    if (m === 'PUT') {
      let trajets;
      try {
        trajets = validerTrajets(await corps(req));
      } catch (e) {
        if (e instanceof ErreurTrajets) throw new ErreurHttp(400, e.message);
        throw e;
      }
      ecrireTrajets(db, trajets);
      return json(res, 200, { trajets, origine: 'app' });
    }
  } else if (p === '/api/entreprises/suivi' || p.startsWith('/api/entreprises/suivi/')) {
    // ANCHOR: décisions de l'utilisateur sur les entreprises de La Bonne Boite (gardée, écartée, contactée), par SIRET, dans le kv entreprises_suivi
    if (p === '/api/entreprises/suivi') {
      if (m === 'GET') return json(res, 200, { suivi: lireSuiviEntreprises(db) });
    } else if (m === 'PUT') {
      const siret = decodeURIComponent(p.slice('/api/entreprises/suivi/'.length));
      const d = await corps(req);
      try {
        const { avant, apres } = ecrireStatutEntreprise(db, siret, { statut: d.statut ?? null, nom: d.nom, ville: d.ville });
        if (avant !== apres) journaliser(db, { entite: 'entreprise', id: siret, libelle: String(d.nom ?? '').slice(0, 120), action: avant ? 'modification' : 'creation', changements: [{ champ: 'statut', avant: avant ?? '', apres: apres ?? '' }] });
        return json(res, 200, { siret, statut: apres });
      } catch (e) {
        if (e instanceof ErreurEntreprises) throw new ErreurHttp(400, e.message);
        throw e;
      }
    }
  } else if (p === '/api/entreprises') {
    // ANCHOR: entreprises à fort potentiel d'embauche (API La Bonne Boite), autour d'un point de départ des trajets ; lecture seule, rien n'est écrit en base
    if (m !== 'GET') throw new ErreurHttp(405, 'Méthode non autorisée.');
    if (!scopeBonneBoite()) return json(res, 200, { actif: false, total: 0, entreprises: [] });
    const departs = lireTrajets(db).trajets.departs;
    const depart = departs[Number(q.get('depart') ?? 0)];
    if (!depart) throw new ErreurHttp(400, 'Aucun point de départ : en ajouter un dans Admin, section Trajets.');
    try {
      const r = await chercherEntreprises({ rome: String(q.get('rome') ?? ''), lat: depart.lat, lon: depart.lon, distance: Number(q.get('distance') ?? DISTANCE_DEFAUT) });
      return json(res, 200, { actif: true, depart: depart.nom ?? '', ...r });
    } catch (e) {
      if (!(e instanceof ErreurSync)) throw e;
      return json(res, { config: 503, format: 400 }[e.code] ?? 502, { erreur: e.message, code: e.code });
    }
  } else if (p === '/api/marche') {
    // ANCHOR: offres et demandeurs d'emploi par métier dans le département de la zone proche (API Marché du travail), gardés dans le kv marche_cache et rafraîchis une fois par jour ; ?force=1 relance l'appel
    if (m !== 'GET') throw new ErreurHttp(405, 'Méthode non autorisée.');
    try {
      return json(res, 200, await chargerMarche(db, { force: q.get('force') === '1' }));
    } catch (e) {
      if (!(e instanceof ErreurSync)) throw e;
      return json(res, { config: 503, format: 400 }[e.code] ?? 502, { erreur: e.message, code: e.code });
    }
  } else if (p === '/api/plateformes') {
    // ANCHOR: plateformes qui obligent à recréer un compte pour postuler (page Admin), signalées par une icône sur les offres concernées
    if (m === 'GET') return json(res, 200, { plateformes: lirePlateformes(db) });
    if (m === 'PUT') {
      let plateformes;
      try {
        plateformes = validerPlateformes(await corps(req));
      } catch (e) {
        if (e instanceof ErreurPlateformes) throw new ErreurHttp(400, e.message);
        throw e;
      }
      const avant = lirePlateformes(db);
      ecrirePlateformes(db, plateformes);
      if (JSON.stringify(avant) !== JSON.stringify(plateformes)) {
        journaliser(db, { entite: 'reglage', id: 'plateformes_compte', libelle: 'Plateformes à compte', action: 'modification', changements: [{ champ: 'plateformes', avant: avant.join(', '), apres: plateformes.join(', ') }] });
      }
      return json(res, 200, { plateformes });
    }
  } else if (p === '/api/zone') {
    // NOTE: zone de distance du score (lib/zone.mjs), lecture seule depuis le .env
    if (m === 'GET') return json(res, 200, lireZone());
  } else if (p === '/api/sync') {
    if (m === 'GET') return json(res, 200, etatSync);
    if (m === 'POST') {
      try {
        const resultat = await lancerSync(db, ici, 'bouton');
        lancerAnalyse(db, 'synchro');
        return json(res, 200, resultat);
      } catch (e) {
        if (!(e instanceof ErreurSync)) throw e;
        return json(res, e.code === 'config' ? 503 : 502, { erreur: e.message, code: e.code });
      }
    }
  } else if (p === '/api/rapport') {
    // ANCHOR: rapport d'activité par jour, semaine ou mois : ?du=AAAA-MM-JJ&au=AAAA-MM-JJ&grain=jour|semaine|mois&format=csv
    if (m === 'GET') {
      for (const k of ['du', 'au']) if (q.get(k) && !/^\d{4}-\d{2}-\d{2}$/.test(q.get(k))) throw new ErreurHttp(400, `${k} : date AAAA-MM-JJ attendue.`);
      if (q.get('grain') && !['jour', 'semaine', 'mois'].includes(q.get('grain'))) throw new ErreurHttp(400, 'grain : jour, semaine ou mois.');
      const r = rapport(db, { du: q.get('du') || undefined, au: q.get('au') || undefined, grain: q.get('grain') || 'jour' });
      if (q.get('format') === 'csv') {
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="rapport-${r.grain}-${r.du}-${r.au}.csv"`, 'Cache-Control': 'no-store' });
        return res.end(rapportCsv(r));
      }
      return json(res, 200, r);
    }
  } else if (p === '/api/journal') {
    // NOTE: événements bruts, du plus récent au plus ancien : ?du&au&entite=offre|candidature|tache|echange&id&limite
    if (m === 'GET') return json(res, 200, evenements(db, { du: q.get('du') || undefined, au: q.get('au') || undefined, entite: q.get('entite') || undefined, id: q.get('id') || undefined, limite: q.get('limite') }));
  } else if (p === '/api/analyse') {
    // ANCHOR: analyse des annonces par le modèle local. POST lance un passage en arrière-plan (?refaire=1 reprend tout), la réponse n'attend pas la fin
    // NOTE: ?consigne=1 ajoute les instructions envoyées au modèle, le format de réponse et les poids de la note (page Admin, lecture seule)
    if (m === 'GET') return json(res, 200, q.get('consigne') === '1' ? { ...resumeAnalyse(db), consigne: consigneActuelle(db), schema: SCHEMA, poids: POIDS } : resumeAnalyse(db));
    if (m === 'POST') {
      const resume = resumeAnalyse(db);
      if (!resume.actif) return json(res, 503, { erreur: resume.erreur ?? 'Analyse désactivée : renseigner ANALYSE_PROVIDER dans le .env.', code: 'config' });
      lancerAnalyse(db, 'bouton', { refaire: q.get('refaire') === '1' });
      return json(res, 202, resumeAnalyse(db));
    }
  } else if (p === '/api/ia') {
    // ANCHOR: profil synthétique et sujets de veille tirés par le modèle (ligne 86), résultats en cache avec a_jour
    if (m === 'GET') return json(res, 200, resumeSyntheses(db));
  } else if ((r = p.match(/^\/api\/ia\/([^/]+)$/))) {
    // NOTE: POST lance l'analyse en arrière-plan, la réponse n'attend pas la fin (GET /api/ia pour suivre)
    const cle = decodeURIComponent(r[1]);
    if (!CLES_SYNTHESE.includes(cle)) return json(res, 404, { erreur: `Analyse ${cle} inconnue (${CLES_SYNTHESE.join(', ')}).` });
    if (m === 'POST') {
      const resume = resumeSyntheses(db);
      if (!resume.actif) return json(res, 503, { erreur: resume.erreur ?? 'Analyse désactivée : renseigner ANALYSE_PROVIDER dans le .env.', code: 'config' });
      lancerSynthese(db, cle);
      return json(res, 202, resumeSyntheses(db));
    }
  } else if (p === '/api/candidatures') {
    if (m === 'GET') return json(res, 200, listerCandidatures(q));
    if (m === 'POST') return json(res, 201, creerCandidature(await corps(req)));
  } else if ((r = p.match(/^\/api\/candidatures\/([^/]+)\/vue$/))) {
    // ANCHOR: consultation d'une candidature (ligne 101), journalisée une fois par jour au plus, sans rien modifier
    const id = decodeURIComponent(r[1]);
    if (m !== 'POST') return json(res, 405, { erreur: 'Méthode non autorisée.' });
    const c = lireCandidature(id);
    if (!c) return json(res, 404, { erreur: `Candidature ${id} introuvable.` });
    const deja = db.prepare("SELECT 1 FROM journal WHERE entite = 'candidature' AND entite_id = ? AND action = 'consultation' AND jour = ?").get(id, aujourdhui());
    if (!deja) journaliser(db, { entite: 'candidature', id, libelle: libelleCandidature(c), action: 'consultation' });
    return json(res, 200, { ok: true, deja: Boolean(deja) });
  } else if ((r = p.match(/^\/api\/candidatures\/([^/]+)$/))) {
    const id = decodeURIComponent(r[1]);
    if (m === 'GET') {
      const c = lireCandidature(id);
      return c ? json(res, 200, c) : json(res, 404, { erreur: `Candidature ${id} introuvable.` });
    }
    if (m === 'PATCH') return json(res, 200, modifierCandidature(id, await corps(req)));
    if (m === 'DELETE') return supprimerCandidature(id) ? json(res, 200, { ok: true }) : json(res, 404, { erreur: `Candidature ${id} introuvable.` });
  } else if (p === '/api/cv/reference') {
    // ANCHOR: CV de référence : GET renvoie le texte extrait (null sans référence), POST reçoit le PDF tel quel (?fichier=nom.pdf)
    if (m === 'GET') return json(res, 200, { reference: referenceActuelle(true) });
    if (m === 'POST') {
      const pdf = await corpsBinaire(req);
      if (!pdf.length) throw new ErreurHttp(400, 'Fichier PDF attendu.');
      return json(res, 201, { reference: importerReference(pdf, q.get('fichier')) });
    }
  } else if (p === '/api/cv/assembler') {
    // NOTE: le modèle local choisit le métier et les compétences à mettre en avant (identifiants seulement) ; n'écrit rien, le CV se compose ensuite par /api/cv/composer
    if (m === 'POST') {
      const d = await corps(req);
      if (!d || typeof d.offre_id !== 'string') return json(res, 400, { erreur: 'Objet JSON attendu : { offre_id }.' });
      try {
        return json(res, 200, await assemblerCv(db, d.offre_id, { force: d.force === true }));
      } catch (e) {
        if (!(e instanceof ErreurSync)) throw e;
        return json(res, { config: 503, introuvable: 404, courte: 422, delai: 504 }[e.code] ?? 502, { erreur: e.message, code: e.code });
      }
    }
  } else if (p === '/api/cv/composer') {
    // NOTE: n'écrit rien : document composé, contrôle, référence utilisée et nom de fichier proposé
    if (m === 'POST') return json(res, 200, await composer(await corps(req)));
  } else if (p === '/api/cv/pdf') {
    if (m === 'POST') {
      const { pdf, version } = await produirePdf(await corps(req));
      return envoyerFichier(res, version.nom, 'pdf', pdf, { 'X-Cv-Version': version.id, 'X-Cv-Nom': encodeURIComponent(version.nom), 'X-Cv-Ecarts': String(version.ecarts), 'X-Cv-Avertissements': String(version.avertissements) });
    }
  } else if (p === '/api/cv/versions') {
    if (m === 'GET') return json(res, 200, listerVersions());
  } else if ((r = p.match(/^\/api\/cv\/versions\/([^/]+)(\/pdf)?$/))) {
    const id = decodeURIComponent(r[1]);
    const v = db.prepare('SELECT * FROM cv_versions WHERE id = ?').get(id);
    if (!v) return json(res, 404, { erreur: `Version de CV ${id} introuvable.` });
    // NOTE: le PDF d'une version est refait depuis son instantané, identique à celui envoyé
    if (r[2] && m === 'GET') return envoyerFichier(res, String(v.nom), 'pdf', await cvPdf(JSON.parse(String(v.contenu)).document, { photo: lirePhoto(DOSSIER_DONNEES) }));
    if (!r[2] && m === 'GET') return json(res, 200, { ...versionFront(v), ...JSON.parse(String(v.contenu)) });
    if (!r[2] && m === 'DELETE') {
      supprimerVersion('cv_versions', 'cv', v);
      return json(res, 200, { ok: true });
    }
  } else if (p === '/api/lettre/rediger') {
    // NOTE: brouillon du modèle local, n'écrit rien : l'interface le place dans le textarea, qui s'enregistre par PUT /api/lettre/brouillons/:cle
    if (m === 'POST') {
      const d = await corps(req);
      if (!d || typeof d.offre_id !== 'string') return json(res, 400, { erreur: 'Objet JSON attendu : { offre_id, matrice? }.' });
      try {
        return json(res, 200, await redigerLettre(db, d.offre_id, d.matrice ?? lireMatriceLettre(), { force: d.force === true }));
      } catch (e) {
        if (!(e instanceof ErreurSync)) throw e;
        return json(res, { config: 503, introuvable: 404, courte: 422, delai: 504 }[e.code] ?? 502, { erreur: e.message, code: e.code });
      }
    }
  } else if (p === '/api/lettre/preparer') {
    // NOTE: n'écrit rien tout de suite : le brouillon arrive dans lettre_brouillons quand le modèle a fini (état suivi par GET /api/lettre/preparer/:id)
    if (m === 'POST') {
      const d = await corps(req);
      if (!d || typeof d.offre_id !== 'string') return json(res, 400, { erreur: 'Objet JSON attendu : { offre_id }.' });
      return json(res, 200, preparerLettre(d.offre_id));
    }
  } else if ((r = p.match(/^\/api\/lettre\/preparer\/([^/]+)$/))) {
    if (m === 'GET') return json(res, 200, preparations.get(decodeURIComponent(r[1])) ?? { etat: null });
  } else if (p === '/api/lettre/matrice') {
    // ANCHOR: matrice par défaut de l'utilisateur (kv lettre_matrice), reprise pour chaque nouvelle lettre
    if (m === 'GET') return json(res, 200, lireMatriceLettre());
    if (m === 'PUT') {
      const avant = lireMatriceLettre();
      const n = validerMatrice(await corps(req));
      // NOTE: comparaison du JSON entier : le journal tronque à 300 caractères, une consigne de bloc modifiée au-delà aurait passé pour « sans changement »
      const changements = JSON.stringify(avant) === JSON.stringify(n) ? [] : [{ champ: 'matrice', avant: `${avant.ton}, ${avant.mots} mots`, apres: `${n.ton}, ${n.mots} mots (consignes ou blocs modifiés)` }];
      if (changements.length) transaction(() => {
        db.prepare("INSERT INTO kv (cle, valeur) VALUES ('lettre_matrice', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(JSON.stringify(n));
        journaliser(db, { entite: 'profil', id: 'lettre_matrice', libelle: 'Matrice de lettre', action: 'modification', changements });
      });
      return json(res, 200, n);
    }
  } else if (p === '/api/lettre/style') {
    // ANCHOR: bibliothèque de style (kv lettre_style) : angles d'accroche par métier et formules à éviter, lus par Qwen, par Claude et par le contrôle
    if (m === 'GET') return json(res, 200, lireStyleLettre());
    if (m === 'PUT') {
      const avant = lireStyleLettre();
      const n = validerStyle(await corps(req));
      // NOTE: le journal tronque les longues valeurs (differences les croirait égales) : comparaison du JSON entier, puis résumé court pour le journal
      const resume = st => `${st.angles.length} angles (${st.angles.map(a => a.nom).join(', ')}), ${st.eviter.length} formules à éviter`;
      const changements = JSON.stringify(avant) === JSON.stringify(n) ? [] : [{ champ: 'style', avant: resume(avant), apres: resume(n) }];
      if (changements.length) transaction(() => {
        db.prepare("INSERT INTO kv (cle, valeur) VALUES ('lettre_style', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(JSON.stringify(n));
        journaliser(db, { entite: 'profil', id: 'lettre_style', libelle: 'Style de lettre', action: 'modification', changements });
      });
      return json(res, 200, n);
    }
  } else if ((r = p.match(/^\/api\/lettre\/brouillons\/([^/]+)$/))) {
    const cle = decodeURIComponent(r[1]);
    if (m === 'GET') {
      const b = db.prepare('SELECT * FROM lettre_brouillons WHERE cle = ?').get(cle);
      if (b) return json(res, 200, brouillonFront(b));
      cibleLettre(cle);
      return json(res, 200, null);
    }
    if (m === 'PUT') return json(res, 200, ecrireBrouillon(cle, await corps(req)));
  } else if (p === '/api/lettre/controler') {
    // NOTE: n'écrit rien : faits de la lettre et conseils de méthode
    if (m === 'POST') {
      const d = await corps(req);
      if (!d || typeof d.texte !== 'string') return json(res, 400, { erreur: 'Objet JSON attendu : { texte, cle?, matrice? }.' });
      return json(res, 200, controleLettre(d.texte, typeof d.cle === 'string' ? d.cle : '', d.matrice));
    }
  } else if ((r = p.match(/^\/api\/lettre\/(pdf|docx)$/))) {
    if (m === 'POST') {
      const { fichier, version } = await exporterLettre(await corps(req), r[1]);
      return envoyerFichier(res, version.nom, r[1], fichier, { 'X-Lettre-Version': version.id, 'X-Lettre-Nom': encodeURIComponent(version.nom), 'X-Lettre-Ecarts': String(version.ecarts), 'X-Lettre-Avertissements': String(version.avertissements) });
    }
  } else if (p === '/api/lettre/versions') {
    if (m === 'GET') return json(res, 200, listerLettres());
  } else if ((r = p.match(/^\/api\/lettre\/versions\/([^/]+?)(\/pdf|\/docx)?$/))) {
    const id = decodeURIComponent(r[1]);
    /** @type {any} */
    const v = db.prepare('SELECT * FROM lettre_versions WHERE id = ?').get(id);
    if (!v) return json(res, 404, { erreur: `Version de lettre ${id} introuvable.` });
    const contenu = lireJson(v.contenu, {});
    // NOTE: le fichier d'une version est refait depuis son instantané, avec la signature du moment
    if (r[2] && m === 'GET') {
      const format = r[2].slice(1);
      const signature = lireSignature(DOSSIER_DONNEES);
      return envoyerFichier(res, String(v.nom), format, format === 'docx' ? lettreDocx(contenu.lettre, { signature }) : await lettrePdf(contenu.lettre, { signature }));
    }
    if (!r[2] && m === 'GET') return json(res, 200, { ...lettreVersionFront(v), ...contenu });
    if (!r[2] && m === 'DELETE') {
      supprimerVersion('lettre_versions', 'lettre_version', v);
      return json(res, 200, { ok: true });
    }
  } else if (p === '/api/signature') {
    // ANCHOR: signature des lettres (data/signature.png ou .jpg, jamais versionnée) : GET renvoie l'image (404 sans signature), POST reçoit l'image telle quelle
    if (m === 'GET') {
      const s = lireSignature(DOSSIER_DONNEES);
      if (!s) return json(res, 404, { erreur: 'Aucune signature enregistrée.' });
      res.writeHead(200, { 'Content-Type': s.type === 'PNG' ? 'image/png' : 'image/jpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(s.octets);
    }
    if (m === 'POST') {
      let infos;
      try {
        infos = enregistrerSignature(DOSSIER_DONNEES, await corpsBinaire(req));
      } catch (e) {
        if (e instanceof ErreurHttp) throw e;
        throw new ErreurHttp(400, String(e.message ?? e));
      }
      journaliser(db, { entite: 'signature', id: 'signature', libelle: 'Signature', action: 'modification' });
      return json(res, 201, infos);
    }
    if (m === 'DELETE') {
      supprimerSignature(DOSSIER_DONNEES);
      journaliser(db, { entite: 'signature', id: 'signature', libelle: 'Signature', action: 'suppression' });
      return json(res, 200, { ok: true });
    }
  } else if (p === '/api/photo') {
    // ANCHOR: photo de profil (data/photo.png ou .jpg, jamais versionnée) : GET renvoie l'image (404 sans photo), POST reçoit l'image telle quelle
    if (m === 'GET') {
      const ph = lirePhoto(DOSSIER_DONNEES);
      if (!ph) return json(res, 404, { erreur: 'Aucune photo enregistrée.' });
      res.writeHead(200, { 'Content-Type': ph.type === 'PNG' ? 'image/png' : 'image/jpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(ph.octets);
    }
    if (m === 'POST') {
      let infos;
      try {
        infos = enregistrerPhoto(DOSSIER_DONNEES, await corpsBinaire(req));
      } catch (e) {
        if (e instanceof ErreurHttp) throw e;
        throw new ErreurHttp(400, String(e.message ?? e));
      }
      journaliser(db, { entite: 'photo', id: 'photo', libelle: 'Photo de profil', action: 'modification' });
      return json(res, 201, infos);
    }
    if (m === 'DELETE') {
      supprimerPhoto(DOSSIER_DONNEES);
      journaliser(db, { entite: 'photo', id: 'photo', libelle: 'Photo de profil', action: 'suppression' });
      return json(res, 200, { ok: true });
    }
  } else if (p === '/api/import/linkedin') {
    // ANCHOR: lit l'export LinkedIn (ZIP) envoyé tel quel et renvoie une proposition, sans rien écrire (l'interface ajoute la sélection par les routes)
    if (m === 'POST') {
      const zip = await corpsBinaire(req);
      if (!zip.length) throw new ErreurHttp(400, 'Fichier ZIP attendu.');
      const dossier = mkdtempSync(join(tmpdir(), 'suivi-linkedin-'));
      try {
        const fichier = join(dossier, 'export.zip');
        writeFileSync(fichier, zip);
        const lu = lireExportLinkedin(fichier);
        return json(res, 200, proposerImport(lu, { competences: competences.tout(), formations: formations.tout(), experiences: experiences.tout() }));
      } catch (e) {
        if (e instanceof ErreurLinkedin) throw new ErreurHttp(400, e.message);
        throw e;
      } finally {
        rmSync(dossier, { recursive: true, force: true });
      }
    }
  } else if (p === '/api/rendez_vous') {
    if (m === 'GET') return json(res, 200, rendezVous.lister(q));
    if (m === 'POST') return json(res, 201, await creerRdv(await corps(req)));
  } else if (p === '/api/rendez_vous/rattacher') {
    if (m === 'POST') {
      try { return json(res, 201, await rattacherEvenement(await corps(req))); } catch (e) { return erreurAgenda(res, e); }
    }
  } else if ((r = p.match(/^\/api\/rendez_vous\/([^/]+)$/))) {
    const id = decodeURIComponent(r[1]);
    const absent = () => json(res, 404, { erreur: `Rendez-vous ${id} introuvable.` });
    if (m === 'GET') { const x = rendezVous.lire(id); return x ? json(res, 200, x) : absent(); }
    if (m === 'PATCH') return json(res, 200, await modifierRdv(id, await corps(req)));
    if (m === 'DELETE') {
      try { return (await supprimerRdv(id, q.get('local') === '1')) ? json(res, 200, { ok: true }) : absent(); } catch (e) { return erreurAgenda(res, e); }
    }
  } else if ((r = p.match(/^\/api\/(taches|echanges|competences|formations|experiences|projets|contacts)$/))) {
    const col = COLLECTIONS[r[1]];
    if (m === 'GET') return json(res, 200, col.lister(q));
    if (m === 'POST') return json(res, 201, col.creer(await corps(req)));
  } else if ((r = p.match(/^\/api\/(taches|echanges|competences|formations|experiences|projets|contacts)\/([^/]+)$/))) {
    const col = COLLECTIONS[r[1]];
    const id = decodeURIComponent(r[2]);
    const nom = { taches: 'Tâche', echanges: 'Échange', competences: 'Compétence', formations: 'Formation', experiences: 'Expérience', projets: 'Projet', contacts: 'Contact' }[r[1]];
    const absent = () => json(res, 404, { erreur: `${nom} ${id} introuvable.` });
    if (m === 'GET') { const t = col.lire(id); return t ? json(res, 200, t) : absent(); }
    if (m === 'PATCH') return json(res, 200, col.modifier(id, await corps(req)));
    if (m === 'DELETE') return (r[1] === 'competences' ? supprimerCompetence(id) : col.supprimer(id)) ? json(res, 200, { ok: true }) : absent();
  } else if (p === '/api/offres') {
    if (m === 'GET') return json(res, 200, listerOffres(q));
    if (m === 'POST') return json(res, 201, creerOffre(await corps(req)));
  } else if ((r = p.match(/^\/api\/offres\/([^/]+)\/verifier$/))) {
    // ANCHOR: contrôle unitaire à l'ouverture d'une offre France Travail (API détail : 204 = n'est plus en ligne). Marque expirée une offre libre, signale seulement une offre liée ou épinglée
    if (m !== 'POST') return json(res, 405, { erreur: 'Méthode non autorisée.' });
    return json(res, 200, await controlerAnnonce(decodeURIComponent(r[1])));
  } else if ((r = p.match(/^\/api\/offres\/([^/]+)\/competences$/))) {
    // ANCHOR: compétences demandées par l'annonce, relevées par le modèle local à l'ouverture de l'offre (ligne 148). POST lance l'extraction en arrière-plan (?refaire=1), GET la lit
    const id = decodeURIComponent(r[1]);
    if (!lireOffre(id)) return json(res, 404, { erreur: `Offre ${id} introuvable.` });
    if (m === 'GET') return json(res, 200, etatCompetencesOffre(id));
    if (m === 'POST') {
      const resume = resumeAnalyse(db);
      if (!resume.actif) return json(res, 503, { erreur: resume.erreur ?? 'Analyse désactivée : renseigner ANALYSE_PROVIDER dans le .env.', code: 'config' });
      purgerCompetencesOrphelines(db);
      lancerExtraction(db, id, { refaire: q.get('refaire') === '1' });
      return json(res, 202, etatCompetencesOffre(id));
    }
  } else if ((r = p.match(/^\/api\/candidatures\/([^/]+)\/competences-offre$/))) {
    // NOTE: lecture seule, les compétences relevées dans l'annonce restent consultables après la purge de l'offre
    const id = decodeURIComponent(r[1]);
    if (!db.prepare('SELECT 1 FROM candidatures WHERE id = ?').get(id)) return json(res, 404, { erreur: `Candidature ${id} introuvable.` });
    if (m === 'GET') {
      const ligne = db.prepare('SELECT id_offre FROM offre_competences WHERE candidature_id = ?').get(id);
      return json(res, 200, ligne ? etatCompetencesOffre(ligne.id_offre) : { extrait: false, items: [] });
    }
  } else if (p === '/api/competences-ignorees') {
    // NOTE: compétences repérées dans les annonces que l'utilisateur ne veut plus se voir proposer
    if (m === 'POST') {
      const d = await corps(req);
      const valeur = norm(String(d.valeur ?? '').trim());
      if (!valeur) throw new ErreurHttp(400, 'valeur : texte attendu.');
      const liste = [...new Set([...ignoreesCompetences(), valeur])];
      db.prepare("INSERT INTO kv (cle, valeur) VALUES ('competences_ignorees', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(JSON.stringify(liste));
      journaliser(db, { entite: 'competence_ignoree', id: valeur, libelle: valeur, action: 'creation' });
      return json(res, 201, { ok: true, ignorees: liste.length });
    }
  } else if ((r = p.match(/^\/api\/offres\/([^/]+)$/))) {
    const id = decodeURIComponent(r[1]);
    if (m === 'GET') {
      const o = lireOffre(id);
      return o ? json(res, 200, o) : json(res, 404, { erreur: `Offre ${id} introuvable.` });
    }
    if (m === 'PATCH') return json(res, 200, modifierOffre(id, await corps(req)));
    if (m === 'DELETE') { supprimerOffre(id); return json(res, 200, { ok: true }); }
  } else {
    return json(res, 404, { erreur: 'Route inconnue.' });
  }
  return json(res, 405, { erreur: `Méthode ${m} non autorisée sur ${p}.` });
}

createServer(async (req, res) => {
  try {
    // ANCHOR: protection contre les requêtes venant d'un autre site (serveur local, pas d'authentification)
    const hote = req.headers.host ?? '';
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hote)) return json(res, 403, { erreur: 'hôte refusé' });
    // NOTE: un POST text/plain venant d'un autre site passe sans pré-vérification CORS, l'en-tête Origin le trahit
    const origine = req.headers.origin;
    if (origine && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origine)) return json(res, 403, { erreur: 'origine refusée' });
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname.startsWith('/api/')) return await api(req, res, url);

    // Fichiers statiques
    const chemin = normalize(join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname));
    // NOTE: un dossier (ex. /assets) est traité comme absent, readFileSync échouerait
    if ((chemin !== publicDir && !chemin.startsWith(publicDir + sep)) || !existsSync(chemin) || !statSync(chemin).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Interface non construite : lancer npm run build');
    }
    const contenu = readFileSync(chemin);
    res.writeHead(200, { 'Content-Type': TYPES[extname(chemin)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', ...EN_TETES_SECURITE });
    res.end(contenu);
  } catch (e) {
    if (e instanceof ErreurHttp) return json(res, e.code, { erreur: e.message });
    // NOTE: identifiant mal encodé dans l'URL (decodeURIComponent)
    if (e instanceof URIError) return json(res, 400, { erreur: 'URL mal encodée.' });
    console.error(e);
    // ANCHOR: en-têtes déjà partis, une seconde réponse ferait planter le processus
    if (res.headersSent) return res.destroy();
    json(res, 500, { erreur: String(e.message ?? e) });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Suivi emploi : http://localhost:${PORT}`);
  // ANCHOR: épingles échues remises à zéro au démarrage puis toutes les six heures, avec une trace au journal
  const purgerEpingles = () => {
    for (const o of expirerEpingles(db)) journaliser(db, { entite: 'offre', id: o.id_offre, libelle: o.titre, action: 'modification', changements: [{ champ: 'epinglee_le', avant: o.epinglee_le, apres: '' }] });
  };
  purgerEpingles();
  setInterval(purgerEpingles, 6 * 3600 * 1000).unref();
  // Synchronisation au démarrage, sans bloquer : en cas d'échec, l'app démarre avec les données locales
  lancerSyncDemarrage(db, ici)
    .then(r => console.log(r.ignoree
      ? `Synchro au démarrage ignorée : la dernière date de ${r.age_minutes} min (bouton Actualiser pour forcer).`
      : `Synchro au démarrage : ${r.stats.nouvelles} nouvelle(s) offre(s), ${r.enBase} en base.`))
    .catch(e => console.error('Synchro au démarrage impossible :', e.message))
    // NOTE: l'analyse tourne aussi après une synchro en échec, les offres déjà en base peuvent attendre une analyse
    .finally(() => lancerAnalyse(db, 'démarrage'));
});
