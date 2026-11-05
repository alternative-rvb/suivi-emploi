import { useEffect, useRef } from 'react';
import { useMemoire } from './utils.ts';

// ANCHOR: hauteur d'un bloc mémorisée d'une visite à l'autre (localStorage) : le squelette de chargement réserve la hauteur réelle du bloc, pour que ce qui suit ne descende pas quand les données arrivent
// pret vaut true quand le bloc affiche ses vraies données : sa hauteur est alors relevée. Tant que pret est faux, hauteur sert de min-height au squelette.
export function useHauteur(cle: string, defaut: number, pret: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [hauteur, setHauteur] = useMemoire('hauteur.' + cle, defaut);
  useEffect(() => {
    if (!pret || !ref.current) return;
    const v = Math.round(ref.current.offsetHeight);
    if (v > 40 && v !== hauteur) setHauteur(v);
  });
  return { ref, hauteur };
}
