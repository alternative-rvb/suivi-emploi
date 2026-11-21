// Synchronisation des offres depuis les providers (lib/providers/), partagée par bin/sync.mjs (ligne de commande) et server.mjs (démarrage et bouton Actualiser).
// Configuration dans .env : SUIVI_PROVIDERS (défaut france-travail, n8n en secours) et les variables propres à chaque provider (voir .env.example).
import { avecProfil, ecrireReglageProfil, lireReglageProfil, listerProfils, profilDefaut } from './profils.mjs';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { jourLocal } from './journal.mjs';
import { ErreurSync } from './erreurs.mjs';
import { disparues, expirerDisparues, fusionnerOffres, motsExclus } from './offres.mjs';
import { providersActifs } from './providers/index.mjs';
import { lireReglages } from './reglages.mjs';

export { ErreurSync };

export function chargerEnv(ici) {
  try {
    process.loadEnvFile(join(ici, '.env'));
    return true;
  } catch {
    return false;
  }
}

// Copie de suivi.db une fois par jour, avant toute écriture
// NOTE: base ouverte (db fourni) : VACUUM INTO donne une copie cohérente, copyFileSync pourrait copier une écriture à moitié faite
/** @param {string} ici @param {import('node:sqlite').DatabaseSync | null} [db] */
export function sauvegardeDuJour(ici, db = null) {
  mkdirSync(join(ici, 'data', 'backups'), { recursive: true });
  const copie = join(ici, 'data', 'backups', `suivi-${jourLocal(new Date())}.db`);
  if (existsSync(copie) || !existsSync(join(ici, 'suivi.db'))) return;
  if (db) db.prepare('VACUUM INTO ?').run(copie);
  else copyFileSync(join(ici, 'suivi.db'), copie);
}

function lireConfigVeille(db) {
  const ligne = db.prepare("SELECT valeur FROM kv WHERE cle = 'veille'").get();
  try {
    return ligne ? JSON.parse(ligne.valeur) : null;
  } catch {
    return null;
  }
}

const cumuler = (total, un) => {
  for (const [k, v] of Object.entries(un)) total[k] = (total[k] ?? 0) + v;
  return total;
};

// ANCHOR: offres clôturées. Seule une recherche complète (aucun échec, aucun plafond atteint) peut dire qu'une offre a disparu ; si les réglages de recherche ont changé depuis la dernière recherche complète, une offre peut manquer sans être clôturée : rien n'est marqué ce coup-ci
// NOTE: au plus MAX_CONTROLES contrôles unitaires par synchro (le reste suit à la suivante), pause entre deux appels (FT_PAUSE_MS=0 dans les tests)
const MAX_CONTROLES = 400;
const PAUSE_CONTROLE_MS = Math.min(250, Number(process.env.FT_PAUSE_MS ?? 250));
async function marquerCloturees(db, couverture, config) {
  if (!couverture.complete) return { marquees: 0, ignoree: 'incomplete' };
  const parties = ['mots_cles', 'zones', 'contrats_exclus', 'entreprises'].map(k => [...(config?.[k] ?? [])].map(String).sort());
  // NOTE: le mode change la recherche (filtre alternance) ; absent pour le mode emploi, l'empreinte des installations existantes ne bouge pas
  if (config?.mode && config.mode !== 'emploi') parties.push([String(config.mode)]);
  const empreinte = JSON.stringify(parties);
  const avant = JSON.stringify(lireReglageProfil(db, 'synchro_couverture'));
  ecrireReglageProfil(db, 'synchro_couverture', JSON.parse(empreinte));
  if (avant !== empreinte) return { marquees: 0, ignoree: 'reglages' };
  // ANCHOR: l'absence ne suffit pas (offre arrivée par un autre mot-clé ou l'ancienne veille, encore en ligne) : chaque absente est confirmée par le contrôle unitaire
  const { absentes, ignoree } = disparues(db, couverture.ids);
  if (ignoree) return { marquees: 0, ignoree };
  if (!couverture.verifier) return { marquees: 0, ignoree: 'sans_controle' };
  const confirmees = new Set();
  let verifiees = 0;
  for (const o of absentes.slice(0, MAX_CONTROLES)) {
    if (await couverture.verifier(o.id_offre) === 'cloturee') confirmees.add(o.id_offre);
    if (++verifiees < absentes.length) await new Promise(r => setTimeout(r, PAUSE_CONTROLE_MS));
  }
  return { ...expirerDisparues(db, couverture.ids, confirmees), verifiees, ecartees: verifiees - confirmees.size };
}

// ANCHOR: une synchro parcourt les profils : le profil par défaut (réglages de l'app, sinon copie de la veille), puis chaque autre profil qui a ses propres réglages.
// Chaque profil reçoit les offres de ses recherches dans offre_suivis ; un profil en échec n'empêche pas les autres. Le résultat principal reste celui du profil par défaut.
// TODO: un même couple mot-clé et zone pourrait n'être interrogé qu'une fois par passage quand plusieurs profils le partagent
async function synchroniser(db, ici, providers = providersActifs()) {
  const defaut = profilDefaut(db);
  const sauvegarde = { faite: false };
  /** @type {any} */
  let principal = null;
  /** @type {any} */
  let erreur = null;
  const profils = [];
  for (const p of listerProfils(db)) {
    const estDefaut = p.id === defaut;
    // NOTE: un profil ajouté sans réglages propres n'a rien à chercher
    if (!estDefaut && avecProfil(p.id, () => lireReglages(db).origine) !== 'app') continue;
    try {
      const r = await avecProfil(p.id, () => synchroniserProfil(db, ici, providers, estDefaut, sauvegarde));
      if (estDefaut) principal = r;
      profils.push({ id: p.id, nom: p.nom, ok: true, stats: r.stats, expiration: r.expiration });
    } catch (e) {
      if (estDefaut) erreur = e;
      profils.push({ id: p.id, nom: p.nom, ok: false, code: e.code ?? 'interne', erreur: e.message });
    }
  }
  if (erreur) throw erreur;
  return { ...principal, profils };
}

// ANCHOR: un provider en échec n'empêche pas les autres. Les providers de secours ne tournent que si aucun principal n'a réussi.
async function synchroniserProfil(db, ici, providers, estDefaut, sauvegarde) {
  const veilleLocale = estDefaut ? lireConfigVeille(db) : null;
  // ANCHOR: les réglages enregistrés dans l'app (page Admin) l'emportent sur la copie de la veille et sur ce que renvoie un provider
  const { reglages, origine } = lireReglages(db);
  const propres = origine === 'app';
  const ctx = { config: propres ? { ...veilleLocale, ...reglages } : veilleLocale };
  const reussis = [];
  const echecs = [];

  const executer = async p => {
    try {
      const r = await p.recuperer(ctx);
      // NOTE: sans zones ni exclusions propres, le provider reprend la dernière configuration mémorisée (copie locale de la veille)
      const zones = propres ? reglages.zones : (r.zones ?? ctx.config?.zones);
      if (!Array.isArray(zones)) throw new ErreurSync('config', `Zones inconnues pour ${p.nom} : une première synchro réussie ou des zones propres au provider sont nécessaires.`);
      const lignes = propres || !r.exclusions ? (ctx.config?.mots_exclus ?? []).map(valeur => ({ type: 'mot_intitule', valeur })) : r.exclusions;
      if (!sauvegarde.faite) {
        sauvegardeDuJour(ici, db);
        sauvegarde.faite = true;
      }
      const exclusions = motsExclus(lignes.map(e => ({ ...e, actif: 'checked' })));
      const { stats, parCat } = fusionnerOffres(db, r.offres, { zones, exclusions });
      // NOTE: un provider de secours n'a pas la même couverture : seul un principal peut marquer des offres clôturées
      const expiration = !p.secours && r.couverture ? await marquerCloturees(db, r.couverture, ctx.config) : null;
      reussis.push({ provider: p, date: r.date, zones, config: r.config, stats, parCat, expiration });
    } catch (e) {
      const erreur = e instanceof ErreurSync ? e : new ErreurSync('interne', `erreur inattendue (${e.message})`);
      echecs.push({ id: p.id, nom: p.nom, code: erreur.code, erreur: erreur.message });
    }
  };

  for (const p of providers.filter(x => !x.secours)) await executer(p);
  if (!reussis.length) for (const p of providers.filter(x => x.secours)) await executer(p);
  if (!reussis.length) {
    const [premier] = echecs;
    throw new ErreurSync(premier.code, echecs.length === 1 ? premier.erreur : echecs.map(e => `${e.nom} : ${e.erreur}`).join(' '));
  }

  const stats = reussis.reduce((t, r) => cumuler(t, r.stats), {});
  const parCat = reussis.reduce((t, r) => cumuler(t, r.parCat), {});
  const enBase = db.prepare('SELECT COUNT(*) n FROM offre_suivis WHERE profil_id = profil_actif()').get().n;
  const source = reussis[0].date;
  // ANCHOR: configuration de la veille mémorisée pour l'onglet Profil et comme copie locale des providers de secours (lecture seule, la source reste le provider)
  const fournie = reussis.find(r => r.config);
  const config = {
    ...(veilleLocale ?? {}),
    ...(fournie ? { ...fournie.config, zones: fournie.zones } : {}),
    provider: reussis[0].provider.id,
    date: fournie?.date ?? source ?? new Date().toISOString(),
    stats,
  };
  // NOTE: copie de la veille (kv d'installation) tenue par le profil par défaut seulement
  if (estDefaut) db.prepare('INSERT INTO kv (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run('veille', JSON.stringify(config));
  const detail = reussis.map(r => ({ id: r.provider.id, nom: r.provider.nom, ok: true, stats: r.stats }));
  const expiration = reussis.find(r => r.expiration)?.expiration ?? null;
  return { source, stats, parCat, enBase, providers: detail, echecs, expiration };
}

// ANCHOR: état partagé et verrou. Un seul appel réseau à la fois : les appels concurrents reçoivent la même promesse, sans doublon.
/** @type {{ enCours: boolean, dernier: any }} */
export const etatSync = { enCours: false, dernier: null };
/** @type {Promise<any> | null} */
let enVol = null;

// ANCHOR: durées des dernières synchros réussies (10 au plus), gardées dans le JSON de synchro_derniere pour estimer le temps d'une synchro
const NB_DUREES = 10;
const moyenneDurees = (/** @type {number[]} */ d) => (d.length ? Math.round(d.reduce((t, x) => t + x, 0) / d.length) : 0);
function dureesPrecedentes(db) {
  try {
    const ligne = db.prepare("SELECT valeur FROM kv WHERE cle = 'synchro_derniere'").get();
    const d = ligne ? JSON.parse(ligne.valeur).durees : null;
    return Array.isArray(d) ? d.filter(x => Number.isFinite(x)).slice(-NB_DUREES) : [];
  } catch { return []; }
}

export function lancerSync(db, ici, declencheur, providers) {
  if (enVol) return enVol;
  etatSync.enCours = true;
  const t0 = Date.now();
  enVol = synchroniser(db, ici, providers)
    .then(resultat => {
      const duree_ms = Date.now() - t0;
      const durees = [...dureesPrecedentes(db), duree_ms].slice(-NB_DUREES);
      etatSync.dernier = { ok: true, date: new Date().toISOString(), declencheur, ...resultat, duree_ms, moyenne_ms: moyenneDurees(durees), durees };
      // NOTE: résumé gardé en base pour que le démarrage suivant sache quand la dernière synchro a réussi
      db.prepare('INSERT INTO kv (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run('synchro_derniere', JSON.stringify(etatSync.dernier));
      return etatSync.dernier;
    })
    .catch(e => {
      const erreur = e instanceof ErreurSync ? e : new ErreurSync('interne', `Erreur inattendue : ${e.message}`);
      // NOTE: un échec n'entre pas dans la moyenne, mais la moyenne des réussites reste affichée
      const durees = dureesPrecedentes(db);
      etatSync.dernier = { ok: false, date: new Date().toISOString(), declencheur, code: erreur.code, erreur: erreur.message, duree_ms: Date.now() - t0, moyenne_ms: moyenneDurees(durees), durees };
      throw erreur;
    })
    .finally(() => {
      etatSync.enCours = false;
      enVol = null;
    });
  return enVol;
}

// ANCHOR: synchro au démarrage du serveur. En développement, le serveur redémarre à chaque modification de server.mjs ou de lib/ : refaire
// l'appel réseau à chaque fois est inutile. Si la dernière synchro réussie date de moins de SUIVI_SYNC_MIN_MINUTES (défaut 30, 0 = toujours
// synchroniser), on la reprend telle quelle. Le bouton Actualiser et POST /api/sync ne sont jamais concernés.
export function lancerSyncDemarrage(db, ici, env = process.env) {
  const minutes = env.SUIVI_SYNC_MIN_MINUTES === undefined || env.SUIVI_SYNC_MIN_MINUTES === '' ? 30 : Number(env.SUIVI_SYNC_MIN_MINUTES);
  const ligne = minutes > 0 ? db.prepare("SELECT valeur FROM kv WHERE cle = 'synchro_derniere'").get() : null;
  /** @type {any} */
  let derniere = null;
  try {
    derniere = ligne ? JSON.parse(ligne.valeur) : null;
  } catch { /* copie illisible : synchro normale */ }
  const age = derniere?.date ? (Date.now() - new Date(derniere.date).getTime()) / 60000 : Infinity;
  if (age >= 0 && age < minutes) {
    etatSync.dernier = derniere;
    return Promise.resolve({ ...derniere, ignoree: true, age_minutes: Math.round(age) });
  }
  return lancerSync(db, ici, 'démarrage');
}
