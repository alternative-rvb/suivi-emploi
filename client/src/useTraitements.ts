import { useEffect, useRef, useState } from 'react';
import { etatAnalyse, etatSynchro, lancerSynchro } from './api.ts';

// ANCHOR: état de l'analyse IA relevé toutes les 2 s pendant un passage (6 s sinon) tant qu'elle est active, commun à Admin et à useTraitements.
// `surFin` (stable, facultatif) est appelé à la fin d'un passage ; `relever()` relance aussitôt le relevé, par exemple juste après le bouton d'analyse.
export function useEtatAnalyse(surFin?: () => unknown) {
  const [analyse, setAnalyse] = useState<any>(null);
  const relance = useRef<() => void>(() => {});
  useEffect(() => {
    let actif = true;
    let minuteur;
    let etaitEnCours = false;
    let tour = 0;
    const verifier = async () => {
      // NOTE: un seul relevé à la fois : un relevé relancé à la main annule le minuteur et rend caduc celui encore en vol
      const n = ++tour;
      clearTimeout(minuteur);
      try {
        const a = await etatAnalyse();
        if (!actif || n !== tour) return;
        setAnalyse(a);
        if (etaitEnCours && !a.enCours) surFin?.();
        etaitEnCours = a.enCours;
        if (a.actif) minuteur = setTimeout(verifier, a.enCours ? 2000 : 6000);
      } catch { /* l'analyse est facultative */ }
    };
    relance.current = verifier;
    verifier();
    return () => { actif = false; clearTimeout(minuteur); };
  }, [surFin]);
  return { analyse, setAnalyse, relever: () => relance.current() };
}

// ANCHOR: état de la synchro des offres et de l'analyse IA, partagé par l'accueil (barre d'actualisation) et l'onglet Offres (analyse active, rechargement en fin de passage)
// `recharger` doit être stable (useCallback) : il relance les deux relevés quand il change
export function useTraitements(recharger: () => unknown) {
  // NOTE: le serveur synchronise déjà au démarrage, le bouton relance à la demande
  const [synchro, setSynchro] = useState<{ enCours: boolean; dernier: any }>({ enCours: false, dernier: null });
  const [actualisation, setActualisation] = useState(false);
  const [resultat, setResultat] = useState('');
  const dejaEnCours = useRef(false);
  // NOTE: offres rechargées à la fin d'un passage d'analyse, pour afficher les analyses
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

  const { analyse } = useEtatAnalyse(recharger);

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
