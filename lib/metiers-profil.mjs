// ANCHOR: métiers recherchés par le profil actif (ligne 260), réglage « metiers » : liste ordonnée de clés du catalogue (lib/metiers.mjs) ou de métiers créés par le profil (réglage « metiers_perso », ligne 266), le premier pèse le plus dans le score
import { lireReglageProfil, ecrireReglageProfil, profilActif } from './profils.mjs';
import { CLES_METIERS, classerProfil, validerMetiers, validerMetiersPerso } from './metiers.mjs';

// NOTE: liste donnée par la migration v33 au profil par défaut d'une base existante : les quatre métiers d'avant, dans l'ordre de leurs anciens poids du score
export const METIERS_HISTORIQUES = ['formateur_digital', 'web_design', 'dev_web', 'comptabilite'];

/**
 * Métiers créés par le profil actif ; une définition abîmée est ignorée
 * @returns {import('./metiers.mjs').MetierPerso[]}
 */
export function lireMetiersPerso(db) {
  const v = lireReglageProfil(db, 'metiers_perso');
  if (!Array.isArray(v)) return [];
  try {
    return validerMetiersPerso(v);
  } catch {
    return [];
  }
}

/**
 * Liste des métiers du profil actif (vide si rien n'est réglé) ; une clé sortie du catalogue et des métiers créés est ignorée
 * @returns {string[]}
 */
export function lireMetiers(db, perso = lireMetiersPerso(db)) {
  const v = lireReglageProfil(db, 'metiers');
  return Array.isArray(v) ? v.filter(c => typeof c === 'string' && (CLES_METIERS.includes(c) || perso.some(p => p.cle === c))) : [];
}

// NOTE: cache par connexion et par profil des métiers lus pour la fonction SQL categorie_vue (une lecture par requête au lieu d'une par ligne), vidé à chaque écriture
const caches = new WeakMap();
const cacheDe = db => { let c = caches.get(db); if (!c) { c = new Map(); caches.set(db, c); } return c; };

/** Liste et métiers créés du profil actif, mis en cache */
export function metiersDuProfil(db) {
  const c = cacheDe(db);
  const id = profilActif(db);
  let v = c.get(id);
  if (!v) { const perso = lireMetiersPerso(db); v = { liste: lireMetiers(db, perso), perso }; c.set(id, v); }
  return v;
}

/**
 * Enregistre la liste et, si fournis, les métiers créés du profil actif après contrôle ; renvoie ce qui est retenu
 * @param {any} db @param {unknown} metiers @param {unknown} [perso] absent = métiers créés inchangés
 */
export function ecrireMetiers(db, metiers, perso) {
  const defs = perso === undefined ? lireMetiersPerso(db) : validerMetiersPerso(perso);
  const liste = validerMetiers(metiers, defs);
  if (perso !== undefined) ecrireReglageProfil(db, 'metiers_perso', defs);
  ecrireReglageProfil(db, 'metiers', liste);
  cacheDe(db).delete(profilActif(db));
  return { metiers: liste, perso: defs };
}

/** Fonction qui donne la catégorie d'une offre vue par le profil actif, d'après son titre et sa catégorie commune */
export function vueProfil(db) {
  const { liste, perso } = metiersDuProfil(db);
  return (/** @type {string} */ titre, /** @type {string} */ categorie) => classerProfil(titre, categorie, liste, perso);
}

// ANCHOR: fonction SQL categorie_vue(titre, categorie) : catégorie vue par le profil actif, pour filtrer et paginer les offres en SQL
export function brancherMetiers(db) {
  db.function('categorie_vue', { deterministic: false }, (titre, categorie) => {
    const { liste, perso } = metiersDuProfil(db);
    return classerProfil(String(titre ?? ''), String(categorie ?? 'autre'), liste, perso);
  });
}
