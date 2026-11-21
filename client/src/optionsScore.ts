import { useEffect, useState } from 'react';
import { chargerReglages } from './api.ts';
import type { OptionsScore } from './score.ts';
import { metiersProfil, useMetiers } from './metiers.ts';

// ANCHOR: options du score tirées des réglages de recherche (mode, malus de contrat, distance), chargées une fois et partagées par Offres et À postuler
// NOTE: rechargées après chaque enregistrement des réglages (signalerReglages) ; serveur injoignable = valeurs par défaut du score
let options: OptionsScore = {};
let chargement: Promise<void> | null = null;
const abonnes = new Set<() => void>();

function charger(): Promise<void> {
  chargement ??= chargerReglages()
    .then(({ reglages: r }) => { options = { mode: r.mode, malus: r.malus_contrat, km: r.km_tous_contrats }; })
    .catch(() => { /* réglages indisponibles : défauts */ })
    .finally(() => abonnes.forEach(f => f()));
  return chargement;
}

// NOTE: métiers du profil ajoutés à chaque appel (client/src/metiers.ts), pour suivre un changement de liste sans recharger
export const optionsScore = (): OptionsScore => ({ ...options, metiers: metiersProfil() });

export function signalerReglages() {
  chargement = null;
  charger();
}

/** Renvoie un compteur qui change à chaque chargement des options, à mettre dans les dépendances du calcul des scores */
export function useOptionsScore() {
  const [version, setVersion] = useState(0);
  const { liste } = useMetiers();
  useEffect(() => {
    const maj = () => setVersion(v => v + 1);
    abonnes.add(maj);
    charger();
    return () => { abonnes.delete(maj); };
  }, []);
  return `${version}|${liste.join(',')}`;
}
