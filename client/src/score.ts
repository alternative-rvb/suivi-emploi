import { malusContrat } from '../../lib/contrat.mjs';
import { competencesTrouvees, recenceCompetences, termesCompetences } from '../../lib/correspondance.mjs';
import { joursEntre, norm } from './utils.ts';

// ANCHOR: score d'une offre sur 100 : adéquation au profil (60), proximité (25, dégressive avec les km), fraîcheur (15), puis exigences de l'annonce relevées par l'analyse IA (de -25 à +10)
// NOTE: ordre de priorité des métiers (à adapter à votre recherche) : formateur, web design, dev web, comptabilité ; indicatif, les compétences trouvées (46 points) restent le critère principal
const POIDS_CATEGORIE = { formateur_digital: 14, web_design: 13, dev_web: 12, comptabilite: 11, autre: 0 };
const MAX_COMPETENCES = 46;
// NOTE: points de compétences qui suffisent pour atteindre le maximum (environ huit compétences solides trouvées)
const PLAFOND = 30;
const NIVEAU_MIN = 3;
const JOURS_MAX = 21;
// NOTE: au-delà de ce trajet (km estimés par la route), seuls le CDI et le CDD de 12 mois et plus restent sans malus 
const KM_TOUS_CONTRATS = 40;
// NOTE: petit bonus discret pour une offre proche du lieu bonus facultatif du .env (SUIVI_LIEU_BONUS)
const BONUS_LIEU = 3;
const KM_LIEU_BONUS = 15;
const paliersKm = (km: number) => (km <= 15 ? 25 : km <= 30 ? 20 : km <= 50 ? 14 : km <= 80 ? 7 : 0);

// Prépare le calcul une fois pour toutes les offres (les compétences changent rarement)
// NOTE: les points d'une compétence sont pondérés par sa récence (fin de la dernière expérience liée ou début du dernier projet lié), voir recenceCompetences
// NOTE: le niveau retenu dépend de la catégorie de l'offre (Enseigner pour formateur_digital, Exécuter pour les métiers opérationnels, le plus haut sinon), voir niveauPourCible
export function preparerScore(competences, auj, experiences = [], projets = [], distanceKm: (o: any) => number | null = () => null, distanceLieuBonusKm: (o: any) => number | null = () => null) {
  const parCategorie = new Map<string, ReturnType<typeof termesCompetences>>();
  const termes = (categorie: string) => parCategorie.get(categorie) ?? parCategorie.set(categorie, termesCompetences(competences, NIVEAU_MIN, categorie)).get(categorie)!;
  const recence = recenceCompetences(experiences, auj, projets);
  return o => {
    const liste = termes(o.categorie ?? '');
    const titre = norm(o.titre);
    const texte = `${titre} ${norm(o.annonce)}`;
    const trouvees: string[] = [];
    let points = 0;
    for (const c of competencesTrouvees(liste, titre, texte)) {
      trouvees.push(c.competence);
      points += c.niveau * (recence.get(c.id) ?? 1) * (c.dansTitre ? 2 : 1);
    }
    const competences = Math.round(MAX_COMPETENCES * Math.min(1, points / PLAFOND));
    const categorie = POIDS_CATEGORIE[o.categorie] ?? 0;
    const km = distanceKm(o);
    // NOTE: paliers de distance (km par la route estimés) ; sans coordonnées connues, la zone « proche » du .env reste tout ou rien
    const proximite = km !== null ? paliersKm(km) : o.proche ? 25 : o.id_offre?.startsWith('man-') ? 12 : 0;
    // NOTE: hors de la zone proche, un contrat ni CDI ni CDD long coûte des points (rien n'est masqué) ; sans distance connue, pas de malus
    const loin = km !== null && km > KM_TOUS_CONTRATS && !o.proche;
    const mc = loin ? malusContrat(o.contrat, o.annonce) : { points: 0, raison: '' };
    const kmB = distanceLieuBonusKm(o);
    const bonusLieu = kmB !== null && kmB <= KM_LIEU_BONUS ? BONUS_LIEU : 0;
    // NOTE: diplôme, années demandées, niveau du poste et cabinet, déjà chiffrés par l'analyse IA (le télétravail n'en fait pas partie)
    const exigences = Math.max(-25, Math.min(10, (o.analyse?.details ?? []).filter(d => !/^Télétravail/.test(d.libelle)).reduce((t, d) => t + (Number(d.points) || 0), 0)));
    const age = o.date_detection ? Math.max(0, joursEntre(o.date_detection, auj)) : JOURS_MAX;
    const fraicheur = Math.round(15 * Math.max(0, 1 - age / JOURS_MAX));
    return { total: Math.max(0, Math.min(100, categorie + competences + proximite + fraicheur + exigences + mc.points + bonusLieu)), exigences, contrat: mc.points, contratRaison: mc.raison, bonusLieu, km, categorie, competences, proximite, fraicheur, trouvees };
  };
}

// Niveau affiché : bon, moyen ou faible
export const niveauScore = n => (n >= 55 ? 'haut' : n >= 40 ? 'moyen' : 'bas');
