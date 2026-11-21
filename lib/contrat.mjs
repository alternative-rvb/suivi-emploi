// ANCHOR: lecture du type de contrat et de la durée d'un CDD, pour le malus de contrat du score quand l'offre est loin
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const MOIS_CDD_LONG = 12;

// ANCHOR: mode de recherche (réglages) : il décide des contrats voulus, les autres perdent des points quand l'offre est loin
export const MODES_RECHERCHE = /** @type {const} */ (['emploi', 'alternance', 'stage']);
export const MALUS_CONTRAT_DEFAUT = 15;
export const MALUS_CONTRAT_MAX = 30;
export const KM_TOUS_CONTRATS_DEFAUT = 40;

// NOTE: lus dans le libellé du contrat seulement, jamais dans le titre ou l'annonce (« Formateur en apprentissage » est un poste, pas une alternance)
const ALTERNANCE = /\b(alternance|alternant|apprenti|apprentissage|professionnalisation)\b/;
const STAGE = /\b(stage|stagiaire)\b/;

/**
 * @param {string | null | undefined} contrat libellé stocké (« CDI », « CDD - 12 mois », « Intérim », « Contrat d'apprentissage »…)
 * @param {string | null | undefined} [annonce] texte de l'annonce, utilisé seulement si le libellé du CDD n'a pas de durée
 * @returns {{ type: 'cdi' | 'cdd' | 'alternance' | 'stage' | 'autre' | 'inconnu', mois: number | null }}
 */
export function typeContrat(contrat, annonce = '') {
  const c = norm(contrat).trim();
  if (!c) return { type: 'inconnu', mois: null };
  // NOTE: avant le CDD et le CDI, car une alternance est souvent un CDD (« CDD - 24 mois, apprentissage »)
  if (ALTERNANCE.test(c)) return { type: 'alternance', mois: null };
  if (STAGE.test(c)) return { type: 'stage', mois: null };
  if (/\bcdi\b/.test(c)) return { type: 'cdi', mois: null };
  if (!/\bcdd\b/.test(c)) return { type: 'autre', mois: null };
  const duree = c.match(/(\d+)\s*(mois|ans?)\b/);
  if (duree) return { type: 'cdd', mois: Number(duree[1]) * (duree[2] === 'mois' ? 1 : 12) };
  // NOTE: repli sur l'annonce, limité aux mentions de durée du contrat (« 6 mois d'expérience » ne compte pas)
  const texte = norm(annonce).match(/(?:cdd|duree|contrat)[^.\n]{0,30}?(\d+)\s*(mois|ans?)\b/);
  return { type: 'cdd', mois: texte ? Number(texte[1]) * (texte[2] === 'mois' ? 1 : 12) : null };
}

const LIBELLES = { cdi: 'CDI', alternance: 'Alternance', stage: 'Stage', autre: 'Autre contrat' };

/**
 * Malus de score d'un contrat pour une offre éloignée, selon le mode de recherche :
 * emploi, CDI et CDD de 12 mois et plus passent ; alternance, seule l'alternance passe ; stage, seul le stage passe. Le reste perd `malus` points.
 * @param {string | null | undefined} contrat
 * @param {string | null | undefined} [annonce]
 * @param {number} [malus]
 * @param {string} [mode] 'emploi' (défaut), 'alternance' ou 'stage'
 * @returns {{ points: number, raison: string }}
 */
export function malusContrat(contrat, annonce = '', malus = MALUS_CONTRAT_DEFAUT, mode = 'emploi') {
  const { type, mois } = typeContrat(contrat, annonce);
  if (type === 'inconnu') return { points: 0, raison: 'Contrat non précisé' };
  if (mode === 'alternance' || mode === 'stage') {
    const libelle = type === 'cdd' ? (mois === null ? 'CDD' : `CDD de ${mois} mois`) : LIBELLES[type];
    return { points: type === mode ? 0 : -malus, raison: libelle };
  }
  if (type === 'cdi') return { points: 0, raison: 'CDI' };
  if (type === 'cdd') {
    if (mois === null) return { points: -Math.round(malus / 2), raison: 'CDD de durée inconnue' };
    if (mois >= MOIS_CDD_LONG) return { points: 0, raison: `CDD de ${mois} mois` };
    return { points: -malus, raison: `CDD de ${mois} mois` };
  }
  return { points: -malus, raison: type === 'autre' ? 'Contrat ni CDI ni CDD long' : LIBELLES[type] };
}
