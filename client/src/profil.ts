// ANCHOR: profil ouvert dans ce navigateur (ligne 263). Vide = profil par défaut, routes /api/... sans préfixe ; sinon /api/p/<profil>/...
// NOTE: le choix est gardé dans localStorage ; changer de profil recharge la page, ce qui remet à zéro tous les caches de module (zone, photo, options du score, plateformes)
const CLE = 'suivi.profil';

function lire() {
  try { return localStorage.getItem(CLE) || ''; } catch { return ''; }
}

const actif = lire();

/** Identifiant du profil ouvert, vide pour le profil par défaut */
export const profilOuvert = () => actif;

/** Préfixe une adresse /api/... avec le profil ouvert ; les autres adresses passent telles quelles */
export function urlApi(url: string) {
  if (!actif || !url.startsWith('/api/') || url.startsWith('/api/p/')) return url;
  return `/api/p/${encodeURIComponent(actif)}/${url.slice(5)}`;
}

/** Clé localStorage d'un choix d'interface : celles du profil par défaut ne changent pas, rien ne se perd */
export const cleMemoire = (cle: string) => (actif ? `suivi.${actif}.${cle}` : `suivi.${cle}`);

/** Ouvre un autre profil (vide = profil par défaut) : la page est rechargée */
export function ouvrirProfil(id: string, defaut = false) {
  try {
    if (!id || defaut) localStorage.removeItem(CLE);
    else localStorage.setItem(CLE, id);
  } catch { /* stockage indisponible : le profil par défaut reste ouvert */ }
  location.reload();
}
