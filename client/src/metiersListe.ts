import { CLE_PERSO, CLES_METIERS, classerProfil, type MetierPerso } from '../../lib/metiers.mjs';
import { CATEGORIES } from './constants.ts';
import { cleMemoire } from './profil.ts';

// ANCHOR: liste des métiers du profil ouvert (ligne 260) et métiers qu'il a créés (ligne 266), sans appel au serveur : lue par le score, les squelettes et les exports ; le chargement est dans metiers.ts
// NOTE: dernière liste connue gardée par le navigateur pour le premier rendu : les listes de métiers ne changent pas de taille à l'arrivée de la réponse
const CLE = cleMemoire('metiers.liste');
const CLE_PERSO_MEMOIRE = cleMemoire('metiers.perso');
function lireMemoire<T>(cle: string, garder: (x: any) => boolean): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(cle) ?? 'null');
    return Array.isArray(v) ? v.filter(garder) : [];
  } catch { return []; }
}

let perso: MetierPerso[] = lireMemoire<MetierPerso>(CLE_PERSO_MEMOIRE, x => x && CLE_PERSO.test(x.cle) && Array.isArray(x.mots));
const connu = (c: string) => CLES_METIERS.includes(c) || perso.some(p => p.cle === c);
let liste: string[] = lireMemoire<string>(CLE, c => typeof c === 'string' && connu(c));
export const abonnes = new Set<() => void>();
export const prevenir = () => abonnes.forEach(f => f());

// NOTE: les métiers créés rejoignent CATEGORIES (libellé et couleur) : tous les écrans qui lisent CATEGORIES[clé] les affichent sans autre changement
function appliquerCategories() {
  for (const k of Object.keys(CATEGORIES)) if (CLE_PERSO.test(k)) delete CATEGORIES[k];
  for (const p of perso) CATEGORIES[p.cle] = { label: p.libelle, color: `var(--c-${p.couleur})` };
}
appliquerCategories();

/** Liste ordonnée du profil, vide s'il n'a rien choisi */
export const metiersProfil = () => liste;
/** Métiers créés par le profil */
export const metiersPerso = () => perso;
/** Métiers proposés par les écrans : ceux du profil, sinon tout le catalogue */
export const metiersAffiches = () => (liste.length ? liste : CLES_METIERS);
/** Catégorie d'une offre vue par le profil, d'après son titre et sa catégorie commune (même règle que le serveur) */
export const categorieVue = (titre: string, categorie: string) => classerProfil(titre, categorie, liste, perso);

/** Remplace la liste (et les métiers créés s'ils sont fournis) après un chargement ou un enregistrement, et prévient les écrans */
export function definirMetiers(l: string[], p?: MetierPerso[]) {
  if (p) perso = p;
  liste = l.filter(connu);
  appliquerCategories();
  try {
    localStorage.setItem(CLE, JSON.stringify(liste));
    localStorage.setItem(CLE_PERSO_MEMOIRE, JSON.stringify(perso));
  } catch { /* stockage indisponible */ }
  prevenir();
}
