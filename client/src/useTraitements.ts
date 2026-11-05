import { useEffect, useRef, useState } from 'react';
import { etatAnalyse, etatSynchro, lancerSynchro } from './api.ts';

// ANCHOR: état de la synchro des offres et de l'analyse IA, partagé par l'accueil (barre d'actualisation) et l'onglet Offres (analyse active, rechargement en fin de passage)
// `recharger` doit être stable (useCallback) : il relance les deux relevés quand il change
export function useTraitements(recharger: () => unknown) {
  // NOTE: le serveur synchronise déjà au démarrage, le bouton relance à la demande
  const [synchro, setSynchro] = useState<{ enCours: boolean; dernier: any }>({ enCours: false, dernier: null });
  const [actualisation, setActualisation] = useState(false);
  const [resultat, setResultat] = useState('');
  const dejaEnCours = useRef(false);
  // NOTE: analyse relevée toutes les 2 s pendant un passage (6 s sinon) tant qu'elle est active, offres rechargées à la fin d'un passage pour afficher les analyses
  const [analyse, setAnalyse] = useState<any>(null);

  useEffect(() => {
    let actif = true;
    let minuteur;
    const verifier = async () => {
      try {
        const s = await etatSynchro();
        if (!actif) return;
        setSynchro(s);
        if (s.enCours) { dejaEnCours.current = true; minuteur = setTimeout(verifier, 1500); }
        else if (dejaEnCours.current) { dejaEnCours.current = false; recharger(); }
      } catch { /* l'erreur serveur est déjà affichée par le chargement des offres */ }
    };
    verifier();
    return () => { actif = false; clearTimeout(minuteur); };
  }, [recharger]);

  useEffect(() => {
    let actif = true;
    let minuteur;
    let etaitEnCours = false;
    const verifier = async () => {
      try {
        const a = await etatAnalyse();
        if (!actif) return;
        setAnalyse(a);
        if (etaitEnCours && !a.enCours) recharger();
        etaitEnCours = a.enCours;
        if (a.actif) minuteur = setTimeout(verifier, a.enCours ? 2000 : 6000);
      } catch { /* l'analyse est facultative */ }
    };
    verifier();
    return () => { actif = false; clearTimeout(minuteur); };
  }, [recharger]);

  const actualiser = async () => {
    setActualisation(true);
    setResultat('');
    try {
      const r = await lancerSynchro();
      setSynchro({ enCours: false, dernier: r });
      await recharger();
      setResultat(r.stats.nouvelles ? `${r.stats.nouvelles} nouvelle(s) offre(s)` : 'Aucune nouvelle offre');
    } catch (e) {
      setResultat('');
      setSynchro(s => ({ ...s, dernier: { ok: false, erreur: e.message } }));
    } finally {
      setActualisation(false);
    }
  };

  return { synchro, analyse, resultat, actualiser, enCours: actualisation || synchro.enCours };
}
