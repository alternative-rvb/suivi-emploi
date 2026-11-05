// ANCHOR: CV sur mesure (cible Offre) tenu en 2 pages : composition essayée avec un seuil de poids des puces de plus en plus haut (0, 1, 2),
// puis un plafond de compétences de plus en plus bas, jusqu'à ce que le PDF tienne. Les puces de poids 3 et celles qui citent l'offre ne sortent jamais.
import { composerCv, validerDocument } from './cv.mjs';
import { nombrePages } from './cv-pdf.mjs';

export const PAGES_MAX_OFFRE = 2;
const PLAFONDS = [20, 16, 12, 8, 6]; // NOTE: 6 ajouté pour les offres à nombreuses compétences prioritaires (4 lignes de domaines débordaient sur 3 pages)

/**
 * Renvoie le document, son nombre de pages (cible Offre seulement) et `tient` (faux si même le dernier essai dépasse pagesMax : l'appelant doit le signaler).
 * @param {any} etat
 * @param {Parameters<typeof composerCv>[1]} options
 * @param {{ pagesMax?: number, mesurer?: (doc: any) => Promise<number> }} [reglages]  mesurer : nombre de pages d'un document (tests)
 */
export async function composerCvPages(etat, options = {}, { pagesMax = PAGES_MAX_OFFRE, mesurer = doc => nombrePages(validerDocument(doc)) } = {}) {
  if (options.cible !== 'offre') return { document: composerCv(etat, options), pages: null, tient: true };
  // NOTE: sans métier visé (offre hors des quatre métiers), le seuil et le plafond n'ont aucun effet : un seul essai, pour connaître le nombre de pages
  const essais = options.categorie ? [[0, undefined], [1, undefined], [2, undefined], ...PLAFONDS.map(p => [2, p])] : [[0, undefined]];
  let document;
  let pages = 0;
  for (const [seuilPuces, plafondCompetences] of essais) {
    document = composerCv(etat, { ...options, seuilPuces, ...(plafondCompetences ? { plafondCompetences } : {}) });
    pages = await mesurer(document);
    if (pages <= pagesMax) break;
  }
  return { document, pages, tient: pages <= pagesMax };
}
