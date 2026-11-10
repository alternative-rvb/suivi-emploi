// Analyse des annonces par un modèle de langage, en arrière-plan après la synchro. Le modèle vient d'un fournisseur interchangeable.
//
// ANCHOR: contrat d'un fournisseur (module de ce dossier, export par défaut : creer(env) qui renvoie)
//   id, nom, url, modele
//   preparer()                       async, vérifie (ou démarre) le service, lève une ErreurSync (reseau, config) s'il est inutilisable
//   repondre({consigne,message,schema})  async, renvoie l'objet JSON répondant au schéma, lève une ErreurSync (reseau, config, auth, http, format)
// Ajouter un fournisseur : créer lib/analyse/<id>.mjs, l'importer ici, l'ajouter à FOURNISSEURS, puis ANALYSE_PROVIDER=<id> dans le .env.
//
// Configuration (.env) : ANALYSE_PROVIDER (ollama, openai-compatible ; vide ou « aucun » = analyse désactivée), ANALYSE_URL, ANALYSE_MODELE,
// et les variables propres à chaque fournisseur. NOTE: sans ANALYSE_DISTANT=1, une adresse hors de cette machine est refusée, car le
// profil et les annonces partent dans chaque requête.
import { createHash } from 'node:crypto';
import { ErreurSync } from '../erreurs.mjs';
import { DDL_ANALYSES } from '../offres.mjs';
import ollama from './ollama.mjs';
import openai from './openai-compatible.mjs';
import { construireConsigne, construireMessage, construireProfil, noter, POIDS, SCHEMA, terminerResume, validerReponses, VERSION_CONSIGNE } from './questions.mjs';

export { noter, POIDS, SCHEMA, VERSION_CONSIGNE };

const FOURNISSEURS = { ollama, 'openai-compatible': openai };
// NOTE: une annonce plus courte n'apporte rien à analyser
const LONGUEUR_MIN = 300;
const ECHECS_DE_SUITE_MAX = 5;

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

// null si l'analyse est désactivée
export function fournisseurActif(env = process.env) {
  const id = (env.ANALYSE_PROVIDER ?? '').trim();
  if (!id || id === 'aucun') return null;
  const creer = FOURNISSEURS[id];
  if (!creer) throw new ErreurSync('config', `Fournisseur d'analyse inconnu : ${id}. Disponibles : ${Object.keys(FOURNISSEURS).join(', ')}.`);
  const f = creer(env);
  let hote;
  try {
    hote = new URL(f.url).hostname;
  } catch {
    throw new ErreurSync('config', `ANALYSE_URL invalide : ${f.url}`);
  }
  if (!LOCAL.test(hote) && env.ANALYSE_DISTANT !== '1') {
    throw new ErreurSync('config', `${f.url} est hors de cette machine : le profil et les annonces y seraient envoyés. Ajouter ANALYSE_DISTANT=1 pour l'accepter.`);
  }
  return f;
}

export function ouvrirAnalyses(db) {
  db.exec(DDL_ANALYSES);
}

const empreinte = o => createHash('sha1').update(`${o.titre}\n${o.annonce}`).digest('hex');

// Réponses enregistrées d'une offre (objet) et note calculée, ou null. contexte : { anneesProfil } (voir noter)
export function lireAnalyse(ligneJson, contexte = {}) {
  if (!ligneJson) return null;
  try {
    const reponses = JSON.parse(ligneJson);
    if (reponses.resume) reponses.resume = terminerResume(reponses.resume);
    return { ...reponses, ...noter(reponses, contexte) };
  } catch {
    return null;
  }
}

// NOTE: tables du parcours (schéma v7), vides sur une base qui ne les a pas encore
function lireTable(db, sql) {
  try {
    return db.prepare(sql).all();
  } catch {
    return [];
  }
}

// Consigne envoyée au modèle : règles fixes plus le profil tiré des compétences et formations enregistrées (affichée dans l'Admin)
export const consigneActuelle = db => construireConsigne(construireProfil(
  lireTable(db, 'SELECT domaine, competence, enseigner, executer, note FROM competences ORDER BY ordre, id'),
  lireTable(db, 'SELECT titre, type FROM formations ORDER BY ordre, id'),
));

// Offres à (re)analyser : annonce assez longue, ni ignorée ni expirée, sans analyse à jour. Les plus récentes d'abord.
export function offresAAnalyser(db, { refaire = false } = {}) {
  const lignes = db.prepare(`SELECT o.id_offre, o.titre, o.entreprise, o.lieu, o.contrat, o.annonce, a.version, a.hash
    FROM offres o LEFT JOIN analyses a ON a.id_offre = o.id_offre
    WHERE o.ignoree = 0 AND o.expiree = 0 AND length(o.annonce) >= ?
    ORDER BY o.date_detection DESC, o.id_offre DESC`).all(LONGUEUR_MIN);
  return lignes.filter(o => refaire || o.version !== VERSION_CONSIGNE || o.hash !== empreinte(o));
}

// ANCHOR: état partagé et verrou, comme la synchro : un seul passage d'analyse à la fois
// NOTE: suivi détaillé du passage en cours pour l'interface (ligne 255) : étape (preparation, lecture), déclencheur, offre lue et depuis quand,
// résultat de la précédente, durée moyenne par offre pour estimer le temps restant. Remis à zéro à chaque passage.
/** @type {{ enCours: boolean, total: number, faits: number, echecs: number, dernier: any, etape: string, declencheur: string, debut: string | null,
 *   offre: { rang: number, titre: string, entreprise: string, depuis: string } | null, precedente: { titre: string, ok: boolean, duree_ms: number, erreur?: string } | null, duree_moyenne_ms: number }} */
export const etatAnalyse = { enCours: false, total: 0, faits: 0, echecs: 0, dernier: null, etape: '', declencheur: '', debut: null, offre: null, precedente: null, duree_moyenne_ms: 0 };
/** @type {Promise<any> | null} */
let enVol = null;

async function analyser(db, fournisseur, /** @type {{ limite?: number, refaire?: boolean }} */ { limite = 0, refaire = false }) {
  db.prepare('DELETE FROM analyses WHERE id_offre NOT IN (SELECT id_offre FROM offres)').run();
  let offres = offresAAnalyser(db, { refaire });
  if (limite > 0) offres = offres.slice(0, limite);
  etatAnalyse.total = offres.length;
  const debut = Date.now();
  if (!offres.length) return { faits: 0, echecs: 0, total: 0, duree_ms: 0 };

  await fournisseur.preparer();
  etatAnalyse.etape = 'lecture';
  let cumul = 0;
  const consigne = consigneActuelle(db);
  const inserer = db.prepare(`INSERT INTO analyses (id_offre, version, hash, provider, modele, date, duree_ms, reponses) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id_offre) DO UPDATE SET version = excluded.version, hash = excluded.hash, provider = excluded.provider, modele = excluded.modele,
      date = excluded.date, duree_ms = excluded.duree_ms, reponses = excluded.reponses`);
  let deSuite = 0;
  /** @type {Error | null} */
  let derniereErreur = null;

  for (const [i, o] of offres.entries()) {
    const t0 = Date.now();
    const titre = o.titre ?? '';
    etatAnalyse.offre = { rang: i + 1, titre, entreprise: o.entreprise ?? '', depuis: new Date(t0).toISOString() };
    try {
      const brut = await fournisseur.repondre({ consigne, message: construireMessage(o), schema: SCHEMA });
      const reponses = validerReponses(brut, o.annonce);
      inserer.run(o.id_offre, VERSION_CONSIGNE, empreinte(o), fournisseur.id, fournisseur.modele, new Date().toISOString(), Date.now() - t0, JSON.stringify(reponses));
      etatAnalyse.faits++;
      deSuite = 0;
      etatAnalyse.precedente = { titre, ok: true, duree_ms: Date.now() - t0 };
    } catch (e) {
      etatAnalyse.precedente = { titre, ok: false, duree_ms: Date.now() - t0, erreur: e.message };
      // NOTE: service absent, modèle manquant ou clé refusée : inutile d'insister sur les autres offres
      if (e instanceof ErreurSync && ['reseau', 'config', 'auth'].includes(e.code)) throw e;
      etatAnalyse.echecs++;
      derniereErreur = e;
      if (++deSuite >= ECHECS_DE_SUITE_MAX) throw new ErreurSync('format', `${ECHECS_DE_SUITE_MAX} réponses illisibles de suite (${e.message})`);
    } finally {
      cumul += Date.now() - t0;
      etatAnalyse.duree_moyenne_ms = Math.round(cumul / (i + 1));
    }
  }
  return { faits: etatAnalyse.faits, echecs: etatAnalyse.echecs, total: offres.length, duree_ms: Date.now() - debut, ...(derniereErreur ? { derniere_erreur: derniereErreur.message } : {}) };
}

// Lance l'analyse en arrière-plan. Les appels concurrents reçoivent la même promesse. Résout toujours (l'échec est dans etatAnalyse.dernier).
export function lancerAnalyse(db, declencheur, /** @type {{ fournisseur?: any, limite?: number, refaire?: boolean }} */ { fournisseur, limite = 0, refaire = false } = {}) {
  if (enVol) return enVol;
  let f;
  try {
    f = fournisseur ?? fournisseurActif();
  } catch (e) {
    etatAnalyse.dernier = { ok: false, date: new Date().toISOString(), declencheur, code: e.code, erreur: e.message };
    return Promise.resolve(etatAnalyse.dernier);
  }
  if (!f) return Promise.resolve(null);
  // NOTE: seul point de remise à zéro du suivi ; analyser() ne pose ensuite que le total, l'étape et l'avancement
  Object.assign(etatAnalyse, { enCours: true, declencheur, debut: new Date().toISOString(), etape: 'preparation', total: 0, faits: 0, echecs: 0, offre: null, precedente: null, duree_moyenne_ms: 0 });
  enVol = analyser(db, f, { limite, refaire })
    .then(r => (etatAnalyse.dernier = { ok: true, date: new Date().toISOString(), declencheur, provider: f.id, modele: f.modele, ...r }))
    .catch(e => {
      const code = e instanceof ErreurSync ? e.code : 'interne';
      return (etatAnalyse.dernier = { ok: false, date: new Date().toISOString(), declencheur, provider: f.id, modele: f.modele, code, erreur: e.message, faits: etatAnalyse.faits, echecs: etatAnalyse.echecs });
    })
    .finally(() => {
      Object.assign(etatAnalyse, { enCours: false, etape: '', offre: null });
      enVol = null;
    });
  return enVol;
}

// Résumé pour l'API : configuration (sans clé), couverture et dernier passage
export function resumeAnalyse(db, env = process.env) {
  let config;
  try {
    const f = fournisseurActif(env);
    config = f ? { actif: true, provider: f.id, nom: f.nom, modele: f.modele, url: f.url } : { actif: false };
  } catch (e) {
    config = { actif: false, erreur: e.message };
  }
  const analysees = db.prepare('SELECT COUNT(*) n FROM analyses a JOIN offres o ON o.id_offre = a.id_offre WHERE a.version = ?').get(VERSION_CONSIGNE).n;
  return { ...config, version_consigne: VERSION_CONSIGNE, analysees, restantes: offresAAnalyser(db).length, ...etatAnalyse };
}
