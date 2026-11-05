// ANCHOR: image de signature des lettres, gardée dans data/ (jamais versionnée) : PNG ou JPEG reconnu par ses premiers octets, 500 Ko au plus
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const TAILLE_MAX_SIGNATURE = 500_000;
const FICHIERS = { PNG: 'signature.png', JPEG: 'signature.jpg' };

/** Type et dimensions en pixels d'une image PNG ou JPEG, null pour tout autre contenu @param {Buffer} b */
export function infosImage(b) {
  if (b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { type: /** @type {'PNG'} */ ('PNG'), largeur: b.readUInt32BE(16), hauteur: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    // NOTE: parcours des segments JPEG jusqu'au premier SOF (baseline ou progressif), qui porte la hauteur puis la largeur
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marqueur = b[i + 1];
      if (marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur)) return { type: /** @type {'JPEG'} */ ('JPEG'), hauteur: b.readUInt16BE(i + 5), largeur: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** @param {string} dossier @returns {{ octets: Buffer, type: 'PNG' | 'JPEG', largeur: number, hauteur: number } | null} */
export function lireSignature(dossier) {
  for (const nom of Object.values(FICHIERS)) {
    const chemin = join(dossier, nom);
    if (!existsSync(chemin)) continue;
    const octets = readFileSync(chemin);
    const infos = infosImage(octets);
    if (infos) return { octets, ...infos };
  }
  return null;
}

/** Remplace la signature ; lève une Error au message clair si le contenu n'est pas une image acceptée @param {string} dossier @param {Buffer} octets */
export function enregistrerSignature(dossier, octets) {
  if (octets.length > TAILLE_MAX_SIGNATURE) throw new Error('Signature trop lourde : 500 Ko au plus.');
  const infos = infosImage(octets);
  if (!infos || !infos.largeur || !infos.hauteur) throw new Error('Signature : image PNG ou JPEG attendue.');
  mkdirSync(dossier, { recursive: true });
  supprimerSignature(dossier);
  writeFileSync(join(dossier, FICHIERS[infos.type]), octets);
  return { type: infos.type, largeur: infos.largeur, hauteur: infos.hauteur, taille: octets.length };
}

/** @param {string} dossier */
export function supprimerSignature(dossier) {
  for (const nom of Object.values(FICHIERS)) rmSync(join(dossier, nom), { force: true });
}
