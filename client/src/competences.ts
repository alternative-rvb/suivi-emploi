import { signature } from '../../lib/correspondance.mjs';

// ANCHOR: ajout d'une compétence au Profil, partagé par l'onglet Compétences et les propositions tirées des annonces
// NOTE: rangée après la dernière compétence du domaine, ordre (nombre réel) pris entre ses deux voisines ; niveaux et note à renseigner ensuite
// NOTE: metier (offre d'un métier connu) pose le poids 3 pour ce seul métier ; une compétence déjà au Profil le reçoit aussi mais son poids ne baisse jamais, les autres métiers restent sans poids
export function avecCompetence(competences: any[], domaine: string, nom: string, niveaux: { enseigner?: number | null; executer?: number | null } = {}, metier = '') {
  const POIDS_OFFRE = 3;
  const existante = competences.find(s => signature(s.competence) === signature(nom));
  // NOTE: pas de doublon au singulier ou au pluriel (« Maquette » existe déjà : « Maquettes » n'est pas ajoutée)
  if (existante) {
    if (!metier || (existante.poids?.[metier] ?? 0) >= POIDS_OFFRE) return competences;
    return competences.map(s => (s === existante ? { ...s, poids: { ...(s.poids ?? {}), [metier]: POIDS_OFFRE } } : s));
  }
  let n = competences.length + 1;
  while (competences.some(s => s.id === 'c' + n)) n++;
  const idx = competences.map(s => s.domaine).lastIndexOf(domaine);
  const rang = (i: number) => competences[i]?.ordre ?? i;
  const ordre = idx < 0 ? rang(competences.length - 1) + 1 : idx + 1 < competences.length ? (rang(idx) + rang(idx + 1)) / 2 : rang(idx) + 1;
  const item = { id: 'c' + n, domaine, competence: nom, enseigner: niveaux.enseigner ?? null, executer: niveaux.executer ?? null, note: '', valide: false, ordre, poids: metier ? { [metier]: POIDS_OFFRE } : {} };
  const copie = [...competences];
  if (idx >= 0) copie.splice(idx + 1, 0, item); else copie.push(item);
  return copie;
}
