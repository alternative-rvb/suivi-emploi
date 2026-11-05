import { useCallback, useEffect, useRef, useState } from 'react';
import type { EvenementAgenda } from '../../types';
import { evenementsPeriode } from './api.ts';
import type { ErreurApi } from './api.ts';

// ANCHOR: événements Google d'une période (ligne 121), relus quand la période ou la version des rendez-vous change
// NOTE: probleme.genre : config (variables .env absentes, rien à afficher), connexion (à refaire dans Admin), calendrier (aucun choisi), erreur (Google injoignable ou autre)
export type Probleme = { genre: 'config' | 'connexion' | 'calendrier' | 'erreur'; message: string };

export function useEvenements(du: string, au: string, version: number) {
  const [evenements, setEvenements] = useState<EvenementAgenda[]>([]);
  const [chargement, setChargement] = useState(true);
  const [probleme, setProbleme] = useState<Probleme | null>(null);
  const [relecture, setRelecture] = useState(0);
  const frais = useRef(false);

  useEffect(() => {
    let vivant = true;
    setChargement(true);
    const f = frais.current;
    frais.current = false;
    evenementsPeriode(du, au, f)
      .then(r => { if (vivant) { setEvenements(r.evenements); setProbleme(null); } })
      .catch((e: ErreurApi) => {
        if (!vivant) return;
        setEvenements([]);
        const genre = e.status === 503 ? 'config' : e.status === 401 ? 'connexion' : e.status === 409 && e.code === 'calendrier' ? 'calendrier' : 'erreur';
        setProbleme({ genre, message: e.message });
      })
      .finally(() => { if (vivant) setChargement(false); });
    return () => { vivant = false; };
  }, [du, au, version, relecture]);

  // NOTE: le bouton Relire ignore le cache d'une minute du serveur
  const relire = useCallback(() => { frais.current = true; setRelecture(n => n + 1); }, []);
  return { evenements, chargement, probleme, relire };
}
