// ANCHOR: métier d'une offre ou d'une candidature d'après son intitulé, pur et sans dépendance Node : partagé par lib/offres.mjs (synchro) et l'interface (bilan Recherche d'emploi)
import { metier, ORDRE_CLASSEMENT } from './metiers.mjs';
import { norm } from './texte.mjs';

// NOTE: tous les métiers du catalogue (lib/metiers.mjs) dans l'ordre du classement : la catégorie est commune à tous les profils, chacun la voit ensuite avec sa liste (vueCategorie)
export function classer(titre) {
  const t = norm(titre);
  for (const cle of ORDRE_CLASSEMENT) {
    const m = metier(cle);
    if (!m || !m.motifs.test(t) || m.refus?.(t)) continue;
    return cle;
  }
  return 'autre';
}
