import { useEffect, useRef, useState } from 'react';
import type { Syntheses } from '../../types';
import { etatSyntheses, lancerSynthese } from './api.ts';

// ANCHOR: état des analyses ponctuelles du modèle (ligne 86), relevé toutes les deux secondes tant que l'une d'elles tourne
export function useSyntheses() {
  const [etat, setEtat] = useState<Syntheses | null>(null);
  const [erreur, setErreur] = useState('');
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined);
  const monte = useRef(true);

  const suivre = (s: Syntheses) => {
    if (!monte.current) return;
    setEtat(s);
    clearTimeout(minuteur.current);
    if (s.profil.enCours || s.veille.enCours) minuteur.current = setTimeout(() => etatSyntheses().then(suivre).catch(e => setErreur(e.message)), 2000);
  };

  useEffect(() => {
    monte.current = true;
    etatSyntheses().then(suivre).catch(e => setErreur(e.message));
    return () => { monte.current = false; clearTimeout(minuteur.current); };
  }, []);

  const lancer = async (cle: 'profil' | 'veille') => {
    setErreur('');
    try { suivre(await lancerSynthese(cle)); } catch (e) { setErreur(e.message); }
  };
  return { etat, erreur, lancer };
}
