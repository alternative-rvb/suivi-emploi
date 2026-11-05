import { useCallback, useEffect, useState } from 'react';
import { chargerOffres } from './api.ts';

// ANCHOR: état des offres porté par App.tsx, pour que le badge de l'onglet et l'écran Offres partagent les mêmes données
export function useOffres() {
  const [offres, setOffres] = useState<any>(null);
  const [erreur, setErreur] = useState('');
  const recharger = useCallback(() => chargerOffres().then(l => { setOffres(l); setErreur(''); }).catch(e => setErreur(e.message)), []);
  useEffect(() => { recharger(); }, [recharger]);
  return { offres, setOffres, erreur, recharger };
}
