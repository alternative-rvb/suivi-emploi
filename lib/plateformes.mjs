// Plateformes qui obligent à recréer un compte pour postuler (kv plateformes_compte), signalées par une icône sur les offres concernées
import { ecrireReglageProfil, lireReglageProfil } from './profils.mjs';

import { norm } from './texte.mjs';

export class ErreurPlateformes extends Error {}

const MAX_PLATEFORMES = 100;
const MAX_NOM = 80;

/**
 * Liste de noms de plateformes nettoyée : espaces réduits, vides retirés, doublons ignorés (sans tenir compte de la casse ni des accents)
 * @param {unknown} d
 * @returns {string[]}
 */
export function validerPlateformes(d) {
  const brut = Array.isArray(d) ? d : /** @type {any} */ (d)?.plateformes;
  if (!Array.isArray(brut)) throw new ErreurPlateformes('Liste de plateformes attendue.');
  const vus = new Set();
  const liste = [];
  for (const x of brut) {
    if (typeof x !== 'string') throw new ErreurPlateformes('Chaque plateforme doit être un texte.');
    const nom = x.replace(/\s+/g, ' ').trim();
    if (!nom) continue;
    if (nom.length > MAX_NOM) throw new ErreurPlateformes(`Nom trop long (${MAX_NOM} caractères au plus) : ${nom.slice(0, 20)}...`);
    const cle = norm(nom);
    if (vus.has(cle)) continue;
    vus.add(cle);
    liste.push(nom);
  }
  if (liste.length > MAX_PLATEFORMES) throw new ErreurPlateformes(`${MAX_PLATEFORMES} plateformes au plus.`);
  return liste;
}

/** @param {import('node:sqlite').DatabaseSync} db */
export function lirePlateformes(db) {
  const brut = lireReglageProfil(db, 'plateformes_compte');
  if (!brut) return [];
  try {
    return validerPlateformes(brut);
  } catch {
    // NOTE: enregistrement abîmé : liste vide plutôt qu'une erreur sur toute l'interface
    return [];
  }
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string[]} plateformes
 */
export function ecrirePlateformes(db, plateformes) {
  ecrireReglageProfil(db, 'plateformes_compte', plateformes);
}
