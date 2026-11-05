// ANCHOR: dates d'une formation (schéma v10), partagées par le serveur, le CV, l'import LinkedIn et l'interface
// Deux champs debut et fin, AAAA ou AAAA-MM (une formation ancienne n'a souvent que l'année), comme les expériences : fin vide avec un début = en cours.
// Un diplôme n'a le plus souvent que fin (l'année d'obtention).
import { norm } from './texte.mjs';

export const DATE_FORMATION = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
export const MOIS_NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const majuscule = t => t.charAt(0).toUpperCase() + t.slice(1);
const nomMois = d => MOIS_NOMS[Number(d.slice(5, 7)) - 1];

/** Libellé d'une date seule : « 2002 » ou « octobre 2025 ». */
export const dateLisible = d => (!d || !DATE_FORMATION.test(d) ? '' : d.length === 4 ? d : `${nomMois(d)} ${d.slice(0, 4)}`);

/**
 * Période affichée d'une formation : « 2002 à 2004 », « Octobre 2025 à juin 2026 », « Mars à avril 2026 », « 2016 » (obtention), « En cours (depuis 2026) ».
 * @param {{ debut?: string, fin?: string }} f
 */
export function periodeFormation({ debut = '', fin = '' } = {}) {
  if ((debut && !DATE_FORMATION.test(debut)) || (fin && !DATE_FORMATION.test(fin))) return '';
  if (!debut && !fin) return '';
  if (!fin) return `En cours (depuis ${dateLisible(debut)})`;
  if (!debut || debut === fin) return majuscule(dateLisible(fin));
  const memeAnnee = debut.slice(0, 4) === fin.slice(0, 4);
  // NOTE: même année avec deux mois, l'année n'est écrite qu'une fois
  if (memeAnnee && debut.length === 7 && fin.length === 7) return `${majuscule(nomMois(debut))} à ${nomMois(fin)} ${fin.slice(0, 4)}`;
  return `${majuscule(dateLisible(debut))} à ${dateLisible(fin)}`;
}

/** Année de référence pour trier : fin sinon début, une formation en cours passe avant les autres de la même année. */
export function anneeTri({ debut = '', fin = '' } = {}) {
  const a = Number((fin || debut).slice(0, 4)) || 0;
  return a + (debut && !fin ? 0.5 : 0);
}

/** Erreur de cohérence d'une période (chaîne vide si tout va bien). */
export const erreurPeriode = ({ debut = '', fin = '' } = {}) => (debut && fin && fin < debut ? 'La fin précède le début.' : '');

const RE_JETON = new RegExp(`(${MOIS_NOMS.map(m => m.replace('é', '[eé]').replace('û', '[uû]').replace('è', '[eè]')).join('|')})|\\b((?:19|20)\\d{2})\\b`, 'gi');

/**
 * Lit l'ancien texte libre des années (« 2002 à 2004 », « En cours (2026) », « Octobre 2025 à juin 2026 (AFPA) », « Mars à avril 2026 »).
 * Ce qui n'est pas lisible reste dans `reste` pour ne rien perdre ; debut et fin sont vides dans ce cas.
 * @param {string} texte
 * @returns {{ debut: string, fin: string, reste: string }}
 */
export function lireAnnees(texte) {
  const brut = String(texte ?? '').trim();
  if (!brut) return { debut: '', fin: '', reste: '' };
  const enCours = /en cours/i.test(brut);
  // NOTE: une parenthèse avec autre chose que des chiffres est une précision (organisme...), gardée à part
  const precisions = [...brut.matchAll(/\(([^)]*)\)/g)].map(m => m[1].trim()).filter(p => p && !/^\d{4}$/.test(p));
  const corps = brut.replace(/\((?!\s*\d{4}\s*\))[^)]*\)/g, ' ').replace(/en cours/gi, ' ');
  /** @type {string[]} */
  const dates = [];
  /** @type {number[]} */
  let enAttente = [];
  for (const m of corps.matchAll(RE_JETON)) {
    if (m[1]) enAttente.push(MOIS_NOMS.findIndex(n => norm(n) === norm(m[1])) + 1);
    else {
      if (enAttente.length) { for (const mois of enAttente) dates.push(`${m[2]}-${String(mois).padStart(2, '0')}`); enAttente = []; }
      else dates.push(m[2]);
    }
  }
  const lisible = enAttente.length === 0 && dates.length > 0 && dates.length <= 2 && dates.every(d => DATE_FORMATION.test(d));
  const restant = corps.replace(RE_JETON, ' ').replace(/[\s,;:()\-–à]+/gi, ' ').trim();
  if (!lisible || restant) return { debut: '', fin: '', reste: brut };
  const reste = precisions.join(', ');
  if (enCours) return { debut: dates[0], fin: '', reste };
  if (dates.length === 1) return { debut: '', fin: dates[0], reste };
  return dates[0] <= dates[1] ? { debut: dates[0], fin: dates[1], reste } : { debut: '', fin: '', reste: brut };
}
