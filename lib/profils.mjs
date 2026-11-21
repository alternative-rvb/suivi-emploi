// Profils (schéma v31) : chaque profil a ses candidatures, son parcours, ses lettres, ses CV et ses réglages ; les offres restent communes à l'installation.
// ANCHOR: le profil actif voyage avec la requête (AsyncLocalStorage, suit les await et les promesses) et SQLite le lit par la fonction profil_actif().
// Chaque requête sur une table personnelle filtre ou pose explicitement profil_id = profil_actif() ; hors requête (démarrage, commandes bin/), c'est le profil par défaut.
// NOTE: comptes (table vide) prévus pour une version future : un compte possédera un ou plusieurs profils (profils.compte_id), aucune route ne les gère encore.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export class ErreurProfil extends Error {}

const contexte = new AsyncLocalStorage();
/** @type {WeakMap<any, string>} profil par défaut de chaque connexion, lu en base à l'ouverture */
const defauts = new WeakMap();

// ANCHOR: clés du kv propres à l'installation ; toutes les autres clés personnelles vivent dans profil_reglages
export const CLES_INSTANCE = ['synchro_derniere', 'marche_cache', 'veille', 'profil_defaut'];
// NOTE: clés personnelles reprises du kv par la migration v31 (liste fermée : une clé inconnue reste dans le kv, rien n'est perdu)
export const CLES_PROFIL = ['profil', 'conseils', 'todo', 'reglages', 'trajets', 'agenda', 'lettre_matrice', 'lettre_style', 'competences_ignorees', 'plateformes_compte', 'entreprises_suivi', 'synchro_couverture'];

export const NOM_DEFAUT = 'Mon profil';
export const COULEURS_PROFIL = ['', 'bleu', 'vert', 'orange', 'violet', 'rouge', 'gris'];
export const nouvelIdProfil = () => 'p-' + randomUUID().slice(0, 8);
export const ID_PROFIL = /^p-[0-9a-f]{8}$/;

/** Exécute f avec le profil donné comme profil actif (requête HTTP, tâche de fond d'un profil) */
export const avecProfil = (/** @type {string} */ id, /** @type {() => any} */ f) => contexte.run(id, f);

/** Profil par défaut de la connexion (celui des routes sans préfixe, du démarrage et des commandes) */
export const profilDefaut = db => {
  const id = defauts.get(db);
  if (!id) throw new Error('Profils non initialisés sur cette connexion (ouvrirBase).');
  return id;
};

/** Profil actif : celui de la requête en cours, sinon le profil par défaut */
export const profilActif = db => contexte.getStore() ?? profilDefaut(db);

// ANCHOR: fichiers d'un profil (signature, photo, agenda Google, CV) : data/ pour le profil par défaut (rien ne bouge pour une installation existante), data/profils/<id>/ pour les autres
export const cheminDossierProfil = (/** @type {string} */ racine, /** @type {string} */ id, /** @type {string} */ defaut) => (id === defaut ? join(racine, 'data') : join(racine, 'data', 'profils', id));
// ANCHOR: éléments personnels qui suivent le profil par défaut entre data/ et data/profils/<id>/ (photo, signature, jeton Google, PDF de CV)
const ELEMENTS_PROFIL = ['photo.png', 'photo.jpg', 'signature.png', 'signature.jpg', 'google-agenda.json', 'cv'];

/**
 * Échange les fichiers personnels de l'ancien et du nouveau profil par défaut : l'ancien passe dans data/profils/<id>/, le nouveau dans data/.
 * Le reste de data/ (sauvegardes, journal, exports) n'est pas touché.
 */
export function permuterDossiersProfil(/** @type {string} */ racine, /** @type {string} */ ancien, /** @type {string} */ nouveau) {
  const commun = join(racine, 'data');
  const dossierAncien = join(racine, 'data', 'profils', ancien);
  const dossierNouveau = join(racine, 'data', 'profils', nouveau);
  mkdirSync(dossierAncien, { recursive: true });
  for (const nom of ELEMENTS_PROFIL) if (existsSync(join(commun, nom))) renameSync(join(commun, nom), join(dossierAncien, nom));
  for (const nom of ELEMENTS_PROFIL) if (existsSync(join(dossierNouveau, nom))) renameSync(join(dossierNouveau, nom), join(commun, nom));
}

/** Dossier de fichiers du profil actif */
export const dossierProfil = (racine, db) => cheminDossierProfil(racine, profilActif(db), profilDefaut(db));

// ANCHOR: profil par défaut (kv profil_defaut) : créé s'il n'existe pas (base neuve, migration v31), ou remplacé par le premier profil si le kv désigne un profil disparu
export function assurerProfilDefaut(db) {
  let id = '';
  try { id = String(JSON.parse(String(db.prepare("SELECT valeur FROM kv WHERE cle = 'profil_defaut'").get()?.valeur ?? '""'))); } catch { /* valeur abîmée : profil cherché ci-dessous */ }
  if (id && db.prepare('SELECT 1 FROM profils WHERE id = ?').get(id)) return id;
  id = String(db.prepare('SELECT id FROM profils ORDER BY ordre, cree_le LIMIT 1').get()?.id ?? '');
  if (!id) {
    id = nouvelIdProfil();
    db.prepare('INSERT INTO profils (id, nom, cree_le) VALUES (?, ?, ?)').run(id, NOM_DEFAUT, new Date().toISOString());
  }
  db.prepare("INSERT INTO kv (cle, valeur) VALUES ('profil_defaut', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(JSON.stringify(id));
  return id;
}

// ANCHOR: branche profil_actif() sur la connexion, après la migration
export function brancherProfils(db) {
  const id = assurerProfilDefaut(db);
  defauts.set(db, id);
  db.function('profil_actif', { deterministic: false }, () => profilActif(db));
  return id;
}

/** Change le profil par défaut (profil existant) */
export function choisirProfilDefaut(db, id) {
  if (!db.prepare('SELECT 1 FROM profils WHERE id = ?').get(id)) throw new ErreurProfil(`Profil ${id} introuvable.`);
  db.prepare("INSERT INTO kv (cle, valeur) VALUES ('profil_defaut', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(JSON.stringify(id));
  defauts.set(db, id);
}

// --- Réglages du profil actif (remplacent le kv pour les clés personnelles) ---
/** Valeur JSON d'un réglage du profil actif, null si absent ou illisible */
export function lireReglageProfil(db, cle) {
  const ligne = db.prepare('SELECT valeur FROM profil_reglages WHERE profil_id = profil_actif() AND cle = ?').get(cle);
  try {
    return ligne ? JSON.parse(String(ligne.valeur)) : null;
  } catch {
    return null;
  }
}

/** Enregistre un réglage du profil actif (valeur sérialisée en JSON) */
export function ecrireReglageProfil(db, cle, valeur) {
  db.prepare('INSERT INTO profil_reglages (profil_id, cle, valeur) VALUES (profil_actif(), ?, ?) ON CONFLICT(profil_id, cle) DO UPDATE SET valeur = excluded.valeur').run(cle, JSON.stringify(valeur));
}

// --- Liste et gestion des profils ---
/** @returns {{ id: string, nom: string, couleur: string, cree_le: string, ordre: number, defaut: boolean }[]} */
export function listerProfils(db) {
  const defaut = profilDefaut(db);
  return db.prepare('SELECT id, nom, couleur, cree_le, ordre FROM profils ORDER BY ordre, cree_le').all()
    .map(p => ({ id: String(p.id), nom: String(p.nom), couleur: String(p.couleur), cree_le: String(p.cree_le), ordre: Number(p.ordre), defaut: p.id === defaut }));
}

export const lireProfilLigne = (db, id) => listerProfils(db).find(p => p.id === id) ?? null;

function validerChamps(d, complet) {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new ErreurProfil('Objet JSON attendu : { nom, couleur? }.');
  const inconnus = Object.keys(d).filter(k => !['nom', 'couleur', 'ordre', 'defaut'].includes(k));
  if (inconnus.length) throw new ErreurProfil(`Champs inconnus : ${inconnus.join(', ')}.`);
  if (complet || 'nom' in d) {
    if (typeof d.nom !== 'string' || !d.nom.trim() || d.nom.trim().length > 40) throw new ErreurProfil('nom : texte de 1 à 40 caractères.');
  }
  if ('couleur' in d && !COULEURS_PROFIL.includes(d.couleur)) throw new ErreurProfil(`couleur : ${COULEURS_PROFIL.filter(Boolean).join(', ')} ou vide.`);
  if ('ordre' in d && (typeof d.ordre !== 'number' || !Number.isFinite(d.ordre))) throw new ErreurProfil('ordre : nombre attendu.');
  if ('defaut' in d && d.defaut !== true) throw new ErreurProfil('defaut : seulement true (choisir un autre profil par défaut le retire de celui-ci).');
}

export function creerProfil(db, d) {
  validerChamps(d, true);
  const id = nouvelIdProfil();
  const ordre = Number(db.prepare('SELECT COALESCE(MAX(ordre), -1) + 1 AS n FROM profils').get()?.n ?? 0);
  db.prepare('INSERT INTO profils (id, nom, couleur, cree_le, ordre) VALUES (?, ?, ?, ?, ?)').run(id, d.nom.trim(), d.couleur ?? '', new Date().toISOString(), ordre);
  return lireProfilLigne(db, id);
}

/** @param {string} [racine] racine du projet : si elle est donnée, les fichiers du profil suivent un changement de profil par défaut */
export function modifierProfil(db, id, d, racine) {
  const avant = lireProfilLigne(db, id);
  if (!avant) throw new ErreurProfil(`Profil ${id} introuvable.`);
  validerChamps(d, false);
  db.prepare('UPDATE profils SET nom = ?, couleur = ?, ordre = ? WHERE id = ?').run('nom' in d ? d.nom.trim() : avant.nom, d.couleur ?? avant.couleur, d.ordre ?? avant.ordre, id);
  if (d.defaut && !avant.defaut) {
    const ancienDefaut = profilDefaut(db);
    choisirProfilDefaut(db, id);
    if (racine) permuterDossiersProfil(racine, ancienDefaut, id);
  }
  return { avant, apres: lireProfilLigne(db, id) };
}

// ANCHOR: suppression d'un profil : toutes ses données partent avec lui (ON DELETE CASCADE), ses lignes du journal aussi ; jamais le dernier, jamais le profil par défaut
export function supprimerProfil(db, id) {
  const p = lireProfilLigne(db, id);
  if (!p) throw new ErreurProfil(`Profil ${id} introuvable.`);
  if (p.defaut) throw new ErreurProfil('Le profil par défaut ne peut pas être supprimé : en choisir un autre par défaut d\'abord.');
  if (listerProfils(db).length <= 1) throw new ErreurProfil('Le dernier profil ne peut pas être supprimé.');
  db.prepare('DELETE FROM journal WHERE profil_id = ?').run(id);
  db.prepare('DELETE FROM profils WHERE id = ?').run(id);
  return p;
}
