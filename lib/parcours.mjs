// ANCHOR: calculs sur le parcours du Profil (expériences), partagés par le serveur et l'analyse des offres

const MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;
// NOTE: mois en nombre continu (année x 12 + mois - 1), pour additionner et comparer les périodes
const versIndice = m => {
  const r = MOIS.exec(m ?? '');
  return r ? Number(r[1]) * 12 + Number(r[2]) - 1 : null;
};
const moisCourant = (quand = new Date()) => quand.getFullYear() * 12 + quand.getMonth();

/**
 * Années d'expérience par catégorie d'offre. Les périodes d'une même catégorie qui se chevauchent ne comptent qu'une fois,
 * une fin vide vaut le mois en cours, le mois de fin est compté. Une expérience sans début est ignorée.
 * @param {{ categorie?: string, debut?: string, fin?: string }[]} experiences
 * @returns {Record<string, number>} années arrondies au dixième
 */
export function anneesParCategorie(experiences = [], quand = new Date()) {
  /** @type {Map<string, [number, number][]>} */
  const periodes = new Map();
  const maintenant = moisCourant(quand);
  for (const x of experiences) {
    const debut = versIndice(x.debut);
    if (debut === null) continue;
    const fin = Math.min(versIndice(x.fin) ?? maintenant, maintenant);
    if (fin < debut) continue;
    const cat = x.categorie || 'autre';
    periodes.set(cat, [...(periodes.get(cat) ?? []), [debut, fin]]);
  }
  /** @type {Record<string, number>} */
  const annees = {};
  for (const [cat, liste] of periodes) {
    liste.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let [d, f] = liste[0];
    for (const [d2, f2] of liste.slice(1)) {
      if (d2 <= f + 1) f = Math.max(f, f2);
      else { total += f - d + 1; [d, f] = [d2, f2]; }
    }
    total += f - d + 1;
    annees[cat] = Math.round((total / 12) * 10) / 10;
  }
  return annees;
}

