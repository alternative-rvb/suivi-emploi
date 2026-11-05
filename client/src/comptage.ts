import { regrouperAnnonces, rapprocher } from './doublons.ts';

// ANCHOR: offres actives = celles de la vue par défaut de l'onglet Offres (ni écartée, ni expirée, ni déjà suivie, copies exclues), toutes catégories et zones confondues
export function offresActives(offres: any[] | null, candidatures: any[]) {
  if (!offres) return [];
  const parOffre = rapprocher(offres, candidatures).parOffre;
  const suivie = (id: string) => ['lien', 'numero'].includes(parOffre.get(id)?.type);
  const { principales } = regrouperAnnonces(offres, suivie);
  return offres.filter(o => !o.ignoree && !o.expiree && !suivie(o.id_offre) && principales.has(o.id_offre));
}

export const compterNonVues = (offres: any[] | null, candidatures: any[]) => offresActives(offres, candidatures).filter(o => !o.vue).length;
