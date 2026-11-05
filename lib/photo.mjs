// ANCHOR: photo de profil, gardée dans data/ (jamais versionnée) : PNG ou JPEG reconnu par ses premiers octets, 1 Mo au plus
// Reprise dans le bouton Profil de la barre et, au choix, dans l'entête du CV.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { infosImage } from './signature.mjs';

export const TAILLE_MAX_PHOTO = 1_000_000;
const FICHIERS = { PNG: 'photo.png', JPEG: 'photo.jpg' };

/** @param {string} dossier @returns {{ octets: Buffer, type: 'PNG' | 'JPEG', largeur: number, hauteur: number } | null} */
export function lirePhoto(dossier) {
  for (const nom of Object.values(FICHIERS)) {
    const chemin = join(dossier, nom);
    if (!existsSync(chemin)) continue;
    const octets = readFileSync(chemin);
    const infos = infosImage(octets);
    if (infos) return { octets, ...infos };
  }
  return null;
}

/** Remplace la photo ; lève une Error au message clair si le contenu n'est pas une image acceptée @param {string} dossier @param {Buffer} octets */
export function enregistrerPhoto(dossier, octets) {
  if (octets.length > TAILLE_MAX_PHOTO) throw new Error('Photo trop lourde : 1 Mo au plus.');
  const infos = infosImage(octets);
  if (!infos || !infos.largeur || !infos.hauteur) throw new Error('Photo : image PNG ou JPEG attendue.');
  mkdirSync(dossier, { recursive: true });
  supprimerPhoto(dossier);
  writeFileSync(join(dossier, FICHIERS[infos.type]), octets);
  return { type: infos.type, largeur: infos.largeur, hauteur: infos.hauteur, taille: octets.length };
}

/** @param {string} dossier */
export function supprimerPhoto(dossier) {
  for (const nom of Object.values(FICHIERS)) rmSync(join(dossier, nom), { force: true });
}
