// Compétences du Profil retrouvées dans un texte d'offre : partagé par le score des offres (client/src/score.ts) et le CV sur mesure (lib/cv.mjs)

import { norm } from './texte.mjs';

export { norm };

// ANCHOR: clé de comparaison de deux intitulés de compétence : sans accents, casse, parenthèses ni « s » final de chaque mot (« Maquettes » et « Maquette » ont la même), ni numéro de version collé au nom (« HTML5 » et « HTML », « CSS3 » et « CSS »)
export const signature = s => norm(s).replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9#.+]+/).filter(Boolean).map(w => w.replace(/^([a-z]{3,})\d+$/, '$1').replace(/s$/, '')).join(' ');

// NOTE: morceaux d'intitulés de compétences trop vagues pour signaler une adéquation dans une annonce
const VAGUES = new Set([
  'clients', 'fournisseurs', 'gestion', 'projet', 'equipe', 'outil', 'outils', 'autre', 'avance', 'avancee', 'base', 'bases',
  'contenu', 'donnees', 'mise', 'jour', 'production', 'ecrit', 'oral', 'texte', 'image', 'video', 'print', 'tableur', 'reseaux sociaux',
  'presentiel', 'distanciel', 'etc', 'tests', 'test', 'design', 'web', 'dev', 'strategie', 'animation', 'creation',
  'mise a jour', 'analyse', 'veille', 'conception', 'technique', 'administration', 'deploiement', 'recherche', 'evaluation', 'accompagnement',
]);

export const niveauCompetence = c => Math.max(c.enseigner ?? 0, c.executer ?? 0);

// ANCHOR: niveau qui décide de la place d'une compétence dans un CV visant un métier : Enseigner pour le formateur, Exécuter pour les métiers opérationnels, le plus haut des deux sinon (CV général, offre sans métier connu)
export const niveauPourCible = (c, metier = '') => (metier === 'formateur_digital' ? c.enseigner ?? 0 : ['comptabilite', 'web_design', 'dev_web'].includes(metier) ? c.executer ?? 0 : niveauCompetence(c));

// NOTE: nombre de projets liés à chaque compétence (id de compétence vers nombre), calculé depuis projets[].competences, jamais saisi
export function nombreProjetsParCompetence(projets) {
  const m = new Map();
  for (const p of projets ?? []) for (const id of new Set(p.competences ?? [])) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

// NOTE: un intitulé en lettres seules (« HTML ») retrouve aussi sa version collée (« HTML5 »), et « CSS3 » retrouve « CSS » : le numéro de version ne compte pas
const motif = x => {
  const base = x.replace(/^([a-z]{3,})\d+$/, '$1');
  const version = /^[a-z]{3,}$/.test(base) ? '\\d*' : '';
  return new RegExp(`(^|[^a-z0-9])${base.replace(/[.+#]/g, '\\$&')}${version}($|[^a-z0-9])`);
};

/**
 * Termes recherchés pour chaque compétence notée au moins niveauMin (niveau de la cible, voir niveauPourCible) : l'intitulé découpé sur les virgules, barres et parenthèses
 * @param {any[]} competences
 * @returns {{ competence: string, id: string, niveau: number, motifs: RegExp[] }[]}
 */
export function termesCompetences(competences, niveauMin = 3, metier = '') {
  const liste = [];
  for (const s of competences ?? []) {
    const niveau = niveauPourCible(s, metier);
    if (niveau < niveauMin) continue;
    // NOTE: le contenu entre parenthèses précise la compétence, il n'est pas cherché dans les annonces
    const t = norm(s.competence).replace(/\([^)]*\)/g, ' ')
      .split(/[,/()+;:]|\bet\b|\bou\b/)
      .map(x => x.replace(/[^a-z0-9#.+ -]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(x => x.length >= 3 && !VAGUES.has(x));
    if (t.length) liste.push({ competence: s.competence, id: s.id, niveau, motifs: t.map(x => motif(x)) });
  }
  return liste;
}

/**
 * Compétences trouvées dans le titre ou le texte (déjà normalisés par norm), avec leur place
 * @param {ReturnType<typeof termesCompetences>} termes
 */
export function competencesTrouvees(termes, titre, texte) {
  const trouvees = [];
  for (const c of termes) {
    const dansTitre = c.motifs.some(m => m.test(titre));
    if (dansTitre || c.motifs.some(m => m.test(texte))) trouvees.push({ ...c, dansTitre });
  }
  return trouvees;
}

/**
 * Coefficient de récence de chaque compétence (id), d'après la fin de l'expérience la plus récente qui la mobilise
 * (fin vide = en cours). Une compétence sans expérience liée n'a pas d'entrée : le coefficient neutre 1 s'applique.
 * @param {{ fin?: string, debut?: string, competences?: string[] }[]} experiences
 * @param {string} auj date du jour AAAA-MM-JJ
 * @returns {Map<string, number>}
 */
export function recenceCompetences(experiences, auj, projets = []) {
  // NOTE: paliers de récence (années écoulées depuis le dernier usage -> coefficient)
  const paliers = [[3, 1], [6, 0.75], [11, 0.5], [Infinity, 0.3]];
  const mois = Number(auj.slice(0, 4)) * 12 + Number(auj.slice(5, 7)) - 1;
  const dernier = new Map();
  for (const e of experiences ?? []) {
    const f = e.fin ?? '';
    const fin = /^\d{4}-\d{2}$/.test(f) ? Number(f.slice(0, 4)) * 12 + Number(f.slice(5, 7)) - 1 : mois;
    for (const id of e.competences ?? []) dernier.set(id, Math.max(dernier.get(id) ?? -Infinity, fin));
  }
  // NOTE: un projet atteste un usage au plus tard à son mois de début (sa fin n'est pas connue, on reste prudent)
  for (const p of projets ?? []) {
    if (!/^\d{4}-\d{2}$/.test(p.debut ?? '')) continue;
    const debut = Number(p.debut.slice(0, 4)) * 12 + Number(p.debut.slice(5, 7)) - 1;
    for (const id of p.competences ?? []) dernier.set(id, Math.max(dernier.get(id) ?? -Infinity, debut));
  }
  const coef = new Map();
  for (const [id, fin] of dernier) {
    const annees = Math.max(0, mois - fin) / 12;
    coef.set(id, (paliers.find(([max]) => annees < max) ?? [0, 1])[1]);
  }
  return coef;
}
