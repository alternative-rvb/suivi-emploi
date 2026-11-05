// ANCHOR: lecture du type de contrat et de la durée d'un CDD, pour le malus de contrat du score quand l'offre est loin
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const MOIS_CDD_LONG = 12;

/**
 * @param {string | null | undefined} contrat libellé stocké (« CDI », « CDD - 12 mois », « Intérim »…)
 * @param {string | null | undefined} [annonce] texte de l'annonce, utilisé seulement si le libellé du CDD n'a pas de durée
 * @returns {{ type: 'cdi' | 'cdd' | 'autre' | 'inconnu', mois: number | null }}
 */
export function typeContrat(contrat, annonce = '') {
  const c = norm(contrat).trim();
  if (!c) return { type: 'inconnu', mois: null };
  if (/\bcdi\b/.test(c)) return { type: 'cdi', mois: null };
  if (!/\bcdd\b/.test(c)) return { type: 'autre', mois: null };
  const duree = c.match(/(\d+)\s*(mois|ans?)\b/);
  if (duree) return { type: 'cdd', mois: Number(duree[1]) * (duree[2] === 'mois' ? 1 : 12) };
  // NOTE: repli sur l'annonce, limité aux mentions de durée du contrat (« 6 mois d'expérience » ne compte pas)
  const texte = norm(annonce).match(/(?:cdd|duree|contrat)[^.\n]{0,30}?(\d+)\s*(mois|ans?)\b/);
  return { type: 'cdd', mois: texte ? Number(texte[1]) * (texte[2] === 'mois' ? 1 : 12) : null };
}

/**
 * Malus de score d'un contrat pour une offre éloignée : CDI et CDD de 12 mois et plus passent, le reste perd des points.
 * @returns {{ points: number, raison: string }}
 */
export function malusContrat(contrat, annonce = '', malus = 15) {
  const { type, mois } = typeContrat(contrat, annonce);
  if (type === 'cdi') return { points: 0, raison: 'CDI' };
  if (type === 'inconnu') return { points: 0, raison: 'Contrat non précisé' };
  if (type === 'cdd') {
    if (mois === null) return { points: -Math.round(malus / 2), raison: 'CDD de durée inconnue' };
    if (mois >= MOIS_CDD_LONG) return { points: 0, raison: `CDD de ${mois} mois` };
    return { points: -malus, raison: `CDD de ${mois} mois` };
  }
  return { points: -malus, raison: 'Contrat ni CDI ni CDD long' };
}
