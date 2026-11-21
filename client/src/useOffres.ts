import { useCallback, useEffect, useRef, useState } from 'react';
import { chargerOffres } from './api.ts';
import { useMetiers } from './metiers.ts';

// ANCHOR: état des offres porté par App.tsx, pour que le badge de l'onglet et l'écran Offres partagent les mêmes données
export function useOffres() {
  const [offres, setOffres] = useState<any>(null);
  const [erreur, setErreur] = useState('');
  const recharger = useCallback(() => chargerOffres().then(l => { setOffres(l); setErreur(''); }).catch(e => setErreur(e.message)), []);
  useEffect(() => { recharger(); }, [recharger]);
  // NOTE: catégorie de chaque offre vue par le profil (serveur) : rechargée quand la liste des métiers change (bloc Métiers recherchés)
  // NOTE: les mots d'un métier créé comptent aussi (ligne 266) : les modifier change le rangement sans changer la liste des clés
  const { liste, perso } = useMetiers();
  const metiers = liste.join(',') + '|' + JSON.stringify(perso);
  const vus = useRef(metiers);
  useEffect(() => { if (vus.current !== metiers) { vus.current = metiers; recharger(); } }, [metiers, recharger]);
  return { offres, setOffres, erreur, recharger };
}
