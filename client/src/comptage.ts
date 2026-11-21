import { regrouperAnnonces, rapprocher } from './doublons.ts';
import { ajouterJours, aujourdhui } from './utils.ts';

// ANCHOR: offres actives = celles de la vue par défaut de l'onglet Offres (ni écartée, ni expirée, ni déjà suivie, copies exclues), toutes catégories et zones confondues
export function offresActives(offres: any[] | null, candidatures: any[]) {
  if (!offres) return [];
  const parOffre = rapprocher(offres, candidatures).parOffre;
  const suivie = (id: string) => ['lien', 'numero'].includes(parOffre.get(id)?.type);
  const { principales } = regrouperAnnonces(offres, suivie);
  return offres.filter(o => !o.ignoree && !o.expiree && !suivie(o.id_offre) && principales.has(o.id_offre));
}

export const compterNonVues = (offres: any[] | null, candidatures: any[]) => offresActives(offres, candidatures).filter(o => !o.vue).length;

// ANCHOR: nouvelle = détectée il y a moins de 3 jours, ni vue, ni écartée, ni expirée : une seule règle pour le badge New, le filtre Nouvelles de l'onglet Offres et le compteur de l'accueil
export const JOURS_NOUVELLE = 2;
export const estNouvelle = (o: any, auj = aujourdhui()) => !o.vue && !o.ignoree && !o.expiree && (o.date_detection ?? '') >= ajouterJours(auj, -JOURS_NOUVELLE);
