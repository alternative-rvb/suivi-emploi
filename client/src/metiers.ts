import { useEffect, useState } from 'react';
import { chargerMetiers } from './api.ts';
import { abonnes, categorieVue, definirMetiers, metiersAffiches, metiersPerso, metiersProfil, prevenir } from './metiersListe.ts';

export { categorieVue, definirMetiers, metiersAffiches, metiersPerso, metiersProfil };

// ANCHOR: métiers recherchés par le profil ouvert (ligne 260), chargés une fois et partagés par les écrans (CV, lettres, offres, parcours, score)
let charge = false;
let chargement: Promise<void> | null = null;

function charger(): Promise<void> {
  chargement ??= chargerMetiers()
    .then(r => { definirMetiers(r.metiers, r.perso); })
    .catch(() => { /* serveur injoignable : dernière liste connue */ })
    .finally(() => { charge = true; prevenir(); });
  return chargement;
}

/** Métiers du profil et métiers à proposer ; le composant se redessine quand la liste change */
export function useMetiers() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const maj = () => setVersion(v => v + 1);
    abonnes.add(maj);
    charger();
    return () => { abonnes.delete(maj); };
  }, []);
  return { liste: metiersProfil(), affiches: metiersAffiches(), perso: metiersPerso(), charge };
}
