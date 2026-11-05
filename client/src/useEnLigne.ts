import { useEffect, useRef, useState } from 'react';
import { verifierOffre } from './api.ts';

type Verif = { id: string; statut: 'en_ligne' | 'cloturee' | 'inconnu'; protegee: boolean; marquee: boolean };

// ANCHOR: contrôle d'une offre France Travail ouverte (une seconde et demie après l'ouverture, comme la consultation d'une candidature) : le serveur marque expirée une annonce clôturée libre, ou signale seulement une offre liée ou épinglée
// NOTE: échec réseau ou offre hors France Travail : aucun résultat, rien n'est affiché
export function useEnLigne(id: string | null | undefined, actif: boolean, ouMarquee?: (id: string) => void): Verif | null {
  const [verif, setVerif] = useState<Verif | null>(null);
  const rappel = useRef(ouMarquee);
  rappel.current = ouMarquee;
  useEffect(() => {
    if (!id || !actif) return;
    let annule = false;
    const t = setTimeout(() => {
      verifierOffre(id).then(r => {
        if (annule) return;
        setVerif({ id, ...r });
        if (r.marquee) rappel.current?.(id);
      }).catch(() => {});
    }, 1500);
    return () => { annule = true; clearTimeout(t); };
  }, [id, actif]);
  return verif && verif.id === id ? verif : null;
}
