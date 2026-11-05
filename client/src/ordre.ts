// ANCHOR: ordre des tuiles de l'accueil (ligne 122), fonctions pures partagées avec les tests

// Ordre d'affichage : l'ordre mémorisé d'abord, les éléments nouveaux gardent leur place d'origine à la suite
export function trier<T extends { id: string }>(defs: T[], ordre: string[]): T[] {
  const rang = (id: string) => { const i = ordre.indexOf(id); return i < 0 ? Infinity : i; };
  return defs.map((d, i) => ({ d, i })).sort((a, b) => rang(a.d.id) - rang(b.d.id) || a.i - b.i).map(x => x.d);
}

// Place `id` avant ou après `cible` dans la liste d'ids (liste inchangée si l'un des deux est inconnu)
export function deplacer(ids: string[], id: string, cible: string, apres: boolean): string[] {
  if (id === cible || !ids.includes(id) || !ids.includes(cible)) return ids;
  const sans = ids.filter(x => x !== id);
  sans.splice(sans.indexOf(cible) + (apres ? 1 : 0), 0, id);
  return sans;
}
