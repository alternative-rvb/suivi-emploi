// ANCHOR: code postal et ville des coordonnées, lus tels quels ou séparés quand un ancien profil les a saisis dans le seul champ ville
// NOTE: module sans dépendance, partagé par le CV, la lettre, la synthèse du profil et l'interface (aucun import circulaire)
const CP_TETE = /^(\d{5})\s*[,\-]?\s*(.*)$/;

/** Code postal et ville nettoyés : « 49100 Villeneuve » saisi dans ville est séparé, un code postal répété dans ville est retiré @param {any} [c] */
export function separerLieu(c) {
  const cp = String(c?.code_postal ?? '').trim();
  let ville = String(c?.ville ?? '').trim();
  const m = ville.match(CP_TETE);
  if (m && (!cp || m[1] === cp)) return { code_postal: cp || m[1], ville: m[2].trim() };
  return { code_postal: cp, ville };
}

/** Ligne « code postal ville » de l'entête d'un CV ou d'une lettre @param {any} [c] */
export function codePostalVille(c) {
  const { code_postal, ville } = separerLieu(c);
  return [code_postal, ville].filter(Boolean).join(' ');
}
