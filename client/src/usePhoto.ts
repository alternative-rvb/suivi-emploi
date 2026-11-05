import { useSyncExternalStore } from 'react';

// ANCHOR: état partagé de la photo de profil (présence et version pour contourner le cache), lu par la barre, les Coordonnées et l'aperçu du CV
let etat = { presente: false, version: 0 };
const abonnes = new Set<() => void>();
const lire = () => etat;
const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };

/** Fixe la présence de la photo (état du serveur) ; une version change force le rechargement de l'image */
export function definirPhoto(presente: boolean, nouvelle = false) {
  if (etat.presente === presente && !nouvelle) return;
  etat = { presente, version: nouvelle ? etat.version + 1 : etat.version };
  abonnes.forEach(f => f());
}

export const usePhoto = () => {
  const e = useSyncExternalStore(abonner, lire);
  return { presente: e.presente, url: e.presente ? `/api/photo?v=${e.version}` : '' };
};
