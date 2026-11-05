import { useLayoutEffect, useRef } from 'react';

// ANCHOR: grille masonry sans dépendance (ligne 106). Le conteneur est une grille à rangées fines (--masonry-pas), chaque enfant
// s'étend sur autant de rangées que sa hauteur : le placement automatique de la grille le pose alors dans la colonne la plus courte,
// l'ordre du DOM (lecture, clavier, lecteur d'écran) reste celui du code. Hauteurs suivies par ResizeObserver (blocs repliés, contenu chargé).
export function useMasonry<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const grille = ref.current;
    if (!grille) return undefined;
    const placer = (el: HTMLElement) => {
      const s = getComputedStyle(grille);
      const pas = parseFloat(s.gridAutoRows) || 4;
      const ecart = parseFloat(s.getPropertyValue('--masonry-ecart')) || 16;
      el.style.gridRowEnd = `span ${Math.max(1, Math.ceil((el.getBoundingClientRect().height + ecart) / pas))}`;
    };
    const ro = new ResizeObserver(entrees => entrees.forEach(e => placer(e.target as HTMLElement)));
    const suivre = () => { ro.disconnect(); [...grille.children].forEach(c => { placer(c as HTMLElement); ro.observe(c); }); };
    suivre();
    // NOTE: une carte qui apparaît ou disparaît (entretiens, relances) est prise en compte sans recharger la page
    const mo = new MutationObserver(suivre);
    mo.observe(grille, { childList: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);
  return ref;
}
