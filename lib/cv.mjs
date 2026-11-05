// ANCHOR: CV composé à partir des tables du Profil (jamais rédigé), puis contrôlé contre le texte du CV de référence.
// Pur et sans dépendance Node : utilisé par server.mjs, bin/cv.mjs (secours en ligne de commande), l'interface et les tests.
import { anneeTri, periodeFormation } from './periode.mjs';
import { METIERS_CV } from './listes.mjs';
import { competencesTrouvees, niveauPourCible, nombreProjetsParCompetence, norm, termesCompetences } from './correspondance.mjs';

export const CIBLES_CV = ['general', 'metier', 'offre'];
export { METIERS_CV };
// NOTE: titre sous le nom par défaut d'un CV par métier, remplacé par profil.titres[métier] s'il est saisi ; le CV général garde le titre des coordonnées
export const TITRES_METIER = { comptabilite: 'Comptable', formateur_digital: 'Formateur digital', web_design: 'Web designer', dev_web: 'Développeur web' };
export const LIBELLES_METIER = { comptabilite: 'Comptabilité', formateur_digital: 'Formateur digital', web_design: 'Web design', dev_web: 'Développement web' };
export const CHAMPS_CONTACT = ['nom', 'titre', 'adresse', 'code_postal', 'ville', 'telephone', 'email', 'site', 'linkedin', 'github', 'mention'];

export class ErreurCv extends Error {}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const NIVEAU_MIN = 3;
// NOTE: pour ces métiers, le domaine principal descend le seuil à 2 (paie, bilan : pratique réelle mais ancienne, notée 2 au Profil)
const NIVEAU_MIN_PRINCIPAL = { comptabilite: 2 };
// NOTE: une compétence n'affiche son nombre de projets qu'à partir de ce seuil (un seul projet est une preuve trop faible)
const PROJETS_MIN_PREUVE = 2;

// NOTE: la preuve se glisse dans la parenthèse existante pour éviter « Encadrement (stagiaire, équipe) (2 projets) »
/** @param {string} nom @param {number} n */
function avecPreuve(nom, n) {
  // NOTE: une parenthèse de plus de 30 caractères (liste d'API, d'outils) alourdit la ligne sans rien prouver de plus : elle saute
  nom = nom.replace(/\s*\([^()]{31,}\)/, '');
  if (n < PROJETS_MIN_PREUVE) return nom;
  return nom.endsWith(')') ? `${nom.slice(0, -1)}, ${n} projets)` : `${nom} (${n} projets)`;
}
const PAR_DOMAINE = 6;
const PAR_DOMAINE_GENERAL = 14; // NOTE: sans métier visé tous les domaines ont le même plafond, sinon la pile MERN (niveau 4) passe après HTML, CSS et Git (niveau 5)
const PAR_DOMAINE_PRINCIPAL = 14; // NOTE: le premier domaine (métier visé) en garde davantage, sinon la pile MERN (niveau 4) passe après HTML, CSS et Git (niveau 5)
const DOMAINES_MAX_CIBLE = 6;
const MISSIONS_MAX = 6; // NOTE: « Missions récentes » d'une expérience : les 6 plus récentes, la liste complète tenait 6 lignes
const COMPETENCES_MAX_CIBLE = 26; // NOTE: total de compétences d'un CV par métier ou sur mesure, toutes catégories confondues
const DOMAINES_MAX_GENERAL = 5; // NOTE: sans métier visé, les 5 domaines les plus solides seulement : 9 domaines faisaient un mur de texte
// NOTE: la preuve « (N projets) » parle aux métiers de réalisation ; sur un CV de formateur ou de comptable elle fait portfolio, elle est retirée
const METIERS_AVEC_PREUVE = ['dev_web', 'web_design'];
const COMPETENCES_PHARES = 6; // NOTE: seules ces compétences portent la preuve « (N projets) », le reste s'allège
// NOTE: une expérience hors cible garde ses premières puces (une ligne de période seule faisait un CV pauvre)
const PUCES_CONDENSEE = 2;
// NOTE: une mission courte (12 mois au plus) contenue dans une expérience plus longue du même type devient une ligne « Missions récentes » de celle-ci, comme dans le CV de référence
const MISSION_MAX_MOIS = 12;
// ANCHOR: domaines de compétences retenus pour un CV par métier, dans l'ordre d'affichage. `d` : domaine (texte normalisé), `c` : compétences retenues dans ce domaine
// (toutes si absent). Hors de cette liste, un domaine n'apparaît que par les compétences trouvées dans l'offre visée. Sans entrée (général, offre « autre ») : tout.
const DOMAINES_METIER = {
  comptabilite: [{ d: /compta|gestion et/ }, { d: /gestion de projet/, c: /budget|tableau|kpi|encadrement/ }],
  formateur_digital: [{ d: /pedagog|formation/ }, { d: /\bia\b/ }, { d: /developpement/ }, { d: /cms/ }, { d: /design/ }, { d: /gestion de projet/ }],
  web_design: [{ d: /design/ }, { d: /marketing/ }, { d: /cms/ }, { d: /developpement/ }, { d: /gestion de projet/ }],
  dev_web: [{ d: /developpement/ }, { d: /devops/ }, { d: /cms/ }, { d: /\bia\b/ }, { d: /gestion de projet/ }],
};

const indice = m => (/^\d{4}-\d{2}$/.test(m ?? '') ? Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 : null);
const moisNom = m => MOIS[Number(m.slice(5, 7)) - 1];
const majuscule = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
// NOTE: indications de travail (« à préciser », « à confirmer ») : jamais reprises dans un CV
const INTERNE = /a preciser|a confirmer|peut-etre|a verifier|a retrouver/;
const interne = s => INTERNE.test(norm(s));
const NIVEAU_LANGUE = /^(debutant|intermediaire|avance|courant|bilingue|natif|langue maternelle|notions|professionnel|[abc][12])( \(?[abc][12]\)?)?$/;
const sansParentheses =s => String(s ?? '').replace(/\s*\([^)]*\)/g, '').trim();

// Période lisible : « Depuis 2017 », « 2006 à 2015 », « mars à avril 2026 »
/** Ville seule d'une mission (sans département), au format " (Ville)" ou chaîne vide */
export const villeMission = m => { const v = String(m?.lieu ?? '').replace(/\s*\(.*$/, '').trim(); return v ? ` (${v})` : ''; };

export function periode(debut, fin, { mois = false } = {}) {
  if (indice(debut) === null) return '';
  if (!fin) return `Depuis ${mois ? `${moisNom(debut)} ` : ''}${debut.slice(0, 4)}`;
  if (indice(fin) === null) return debut.slice(0, 4);
  if (debut.slice(0, 4) === fin.slice(0, 4)) return debut === fin ? `${moisNom(debut)} ${debut.slice(0, 4)}` : `${moisNom(debut)} à ${moisNom(fin)} ${fin.slice(0, 4)}`;
  return mois ? `${moisNom(debut)} ${debut.slice(0, 4)} à ${moisNom(fin)} ${fin.slice(0, 4)}` : `${debut.slice(0, 4)} à ${fin.slice(0, 4)}`;
}

// Puces tirées de la description : une phrase par puce, sans les indications de travail
export const puces = description => String(description ?? '')
  .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÝÉ])/)
  .map(p => p.trim().replace(/\.$/, ''))
  .filter(p => p && !interne(p));

// NOTE: postes regroupés : une puce dont tous les mots figurent déjà dans une autre puce est une redite
const sansRedites = liste => {
  const jeux = liste.map(p => new Set(norm(p).split(/[^a-z0-9+#]+/).filter(Boolean)));
  return liste.filter((p, i) => !jeux.some((j, k) => k !== i && j.size >= jeux[i].size && [...jeux[i]].every(m => j.has(m)) && (j.size > jeux[i].size || k < i)));
};

// ANCHOR: mots du métier visé (texte normalisé) : dans un CV par métier ou sur mesure, les puces qui en parlent passent en tête
// NOTE: aucune puce n'est figée en tête : le contexte de l'employeur se met dans le champ employeur de l'expérience, pas dans une puce
const MOTS_METIER = {
  comptabilite: /compta|tresorerie|tva|bilan|budget|paie|cloture|recouvrement|fournisseur|analytique/,
  formateur_digital: /formation|formateur|apprenant|pedagog|certification|parcours/,
  web_design: /design|\bux\b|\bui\b|figma|maquette|prototype|charte|identite visuelle|graphi|\bpao\b|adobe|print|logo/,
  dev_web: /developpement|fullstack|react|node|php|javascript|hugo|astro|wordpress|\bapi\b|docker|ci\/cd/,
};
// NOTE: une expérience d'un autre métier qui compte au moins PUCES_DU_METIER puces pertinentes est affichée en entier (activité freelance mixte)
const PUCES_DU_METIER = 3;
const echapper = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// NOTE: puce pertinente : mots du métier visé, ou libellé d'une compétence trouvée dans l'offre (sans parenthèses, mot entier)
const pertinence = (metier, libelles = []) => {
  const mots = MOTS_METIER[metier];
  const termes = libelles.map(l => norm(sansParentheses(l))).filter(t => t.length >= 2).map(t => new RegExp(`(^|[^a-z0-9])${echapper(t)}($|[^a-z0-9])`));
  if (!mots && !termes.length) return null;
  return p => { const n = norm(p); return Boolean(mots?.test(n)) || termes.some(r => r.test(n)); };
};
// ANCHOR: poids des puces par métier (experiences.poids) : { clé de puce: { métier: 0 à 3 } }, la clé est le texte de la puce normalisé (une puce réécrite perd son poids)
export const POIDS_MAX = 3;
export const clePuce = p => norm(p).replace(/\s+/g, ' ').trim();
// NOTE: objet (API) ou JSON brut (bin/cv.mjs lit la base directement), comme les intitulés
const jsonDe = (x, champ) => {
  if (typeof x?.[champ] !== 'string') return x?.[champ] ?? {};
  try { return JSON.parse(x[champ]) ?? {}; } catch { return {}; }
};
const poidsValide = n => Number.isInteger(n) && n >= 0 && n <= POIDS_MAX;
/** Forme canonique : clés normalisées, métiers connus dans l'ordre de METIERS_CV, poids entiers de 0 à 3, vides retirés (même JSON pour une même saisie) */
export const normaliserPoids = v => {
  const sortie = {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return sortie;
  for (const [puce, parMetier] of Object.entries(v)) {
    const cle = clePuce(puce);
    if (!cle || typeof parMetier !== 'object' || parMetier === null) continue;
    const garde = Object.fromEntries(METIERS_CV.filter(m => poidsValide(parMetier[m])).map(m => [m, parMetier[m]]));
    if (Object.keys(garde).length) sortie[cle] = { ...sortie[cle], ...garde };
  }
  return sortie;
};
/** Poids d'une compétence par métier (competences.poids) : { métier: 0 à 3 }, métiers connus et entiers de 0 à 3 seulement */
export const normaliserPoidsCompetence = v => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  return Object.fromEntries(METIERS_CV.filter(m => poidsValide(v[m])).map(m => [m, v[m]]));
};
// NOTE: null = pas de poids saisi pour ce métier (la compétence suit le niveau seul, comme avant les poids)
const poidsCompetence = (c, metier) => {
  const n = normaliserPoidsCompetence(jsonDe(c, 'poids'))[metier];
  return poidsValide(n) ? n : null;
};
const poidsPuce = (poids, p, metier) => {
  const n = poids?.[clePuce(p)]?.[metier];
  return poidsValide(n) ? n : null;
};
// NOTE: suggestion de départ de la grille, tirée des mots du métier : 0 sans mot, 2 avec un mot, 3 avec deux mots différents ou plus
export const poidsSuggere = (puce, metier) => {
  const mots = MOTS_METIER[metier];
  if (!mots) return 0;
  const trouves = new Set(norm(puce).match(new RegExp(mots.source, 'g')) ?? []);
  return trouves.size >= 2 ? 3 : trouves.size === 1 ? 2 : 0;
};
// NOTE: sans aucun poids saisi pour le métier, le tri reste celui des mots-clés (deux groupes) ; avec des poids, tri décroissant et stable,
// une puce sans poids vaut 2 si elle est pertinente (mots du métier ou de l'offre), 0,5 sinon (un 0 saisi passe donc après une puce non pesée, puis la composition le masque), une puce pesée gagne 1 si elle cite une compétence de l'offre
/** @param {string} metier @param {string[]} libelles @param {Record<string, Record<string, number>>} poids */
const evaluerPuces = (metier, libelles = [], poids = {}) => {
  const pertinente = pertinence(metier, libelles);
  const offre = pertinence('', libelles);
  const score = p => {
    const n = poidsPuce(poids, p, metier);
    return n === null ? (pertinente?.(p) ? 2 : 0.5) : n + (offre?.(p) ? 1 : 0);
  };
  return { pertinente, score, pese: liste => liste.some(p => poidsPuce(poids, p, metier) !== null) };
};
export const trierPuces = (liste, metier, libelles = [], poids = {}) => {
  const { pertinente, score, pese } = evaluerPuces(metier, libelles, poids);
  if (liste.length < 2) return liste;
  if (pese(liste)) return liste.map((p, i) => ({ p, i, s: score(p) })).sort((a, b) => b.s - a.s || a.i - b.i).map(({ p }) => p);
  if (!pertinente) return liste;
  // NOTE: aucune puce figée en tête : une ligne hors métier (ex. développement sur un CV design) passe après celles du métier visé, l'ordre du Profil est gardé dans chaque groupe
  return [...liste.filter(pertinente), ...liste.filter(p => !pertinente(p))];
};
// NOTE: intitulés par métier : objet (API) ou JSON brut (bin/cv.mjs lit la base directement)
const intitulesDe = x => jsonDe(x, 'intitules');

const duree = x => (indice(x.fin || '9999-12') ?? 0) - (indice(x.debut) ?? 0) + 1;
const contient = (p, x) => (indice(p.debut) ?? Infinity) <= (indice(x.debut) ?? -Infinity) && (p.fin === '' || (x.fin !== '' && (indice(p.fin) ?? 0) >= (indice(x.fin) ?? 0)));
const triAntechrono = (a, b) => (b.fin === '' ? 1 : 0) - (a.fin === '' ? 1 : 0) || (indice(b.fin) ?? 0) - (indice(a.fin) ?? 0) || (indice(b.debut) ?? 0) - (indice(a.debut) ?? 0);

/**
 * Compose le CV. cible : general, metier (categorie obligatoire) ou offre (categorie de l'offre, prioritaires = ids des compétences trouvées dans l'annonce)
 * @param {{ profil?: any, experiences?: any[], formations?: any[], competences?: any[], projets?: any[] }} etat
 * @param {{ cible?: string, categorie?: string, prioritaires?: string[], offre?: { id_offre: string, titre?: string, entreprise?: string } | null, seuilPuces?: number, plafondCompetences?: number }} options  seuilPuces : poids de puce (0 à 2) jusqu'auquel les puces sont masquées (0 par défaut), plafondCompetences : total de compétences d'un CV par métier ou sur mesure
 */
export function composerCv(etat, { cible = 'general', categorie = '', prioritaires = [], offre = null, seuilPuces = 0, plafondCompetences = COMPETENCES_MAX_CIBLE } = {}) {
  if (!CIBLES_CV.includes(cible)) throw new ErreurCv(`Cible inconnue : ${cible} (general, metier ou offre).`);
  if (cible === 'metier' && !METIERS_CV.includes(categorie)) throw new ErreurCv(`Métier inconnu : ${categorie || 'vide'}.`);
  const vise = cible === 'general' ? '' : categorie;
  const profil = etat.profil ?? {};
  const contact = Object.fromEntries(CHAMPS_CONTACT.map(k => [k, String(profil.contact?.[k] ?? '').trim()]));
  const competences = etat.competences ?? [];
  const prio = new Set(prioritaires);
  const libellesPrio = (etat.competences ?? []).filter(c => prio.has(c.id)).map(c => c.competence ?? '');
  const nbProjets = nombreProjetsParCompetence(etat.projets);

  // ANCHOR: expériences, du plus récent au plus ancien ; missions courtes rattachées, postes identiques regroupés
  // NOTE: CV général façon LinkedIn (backlog 220) : une ligne par expérience, rien de regroupé ; l'expérience parapluie qui recevait les missions courtes sort du CV, ses missions deviennent des lignes
  const lineaire = cible === 'general';
  const toutes = [...(etat.experiences ?? [])].filter(x => x.poste).sort(triAntechrono);
  const missions = new Map();
  const parents = new Set();
  let principales = [];
  for (const x of toutes) {
    const parent = duree(x) <= MISSION_MAX_MOIS && toutes.filter(p => p !== x && p.type === x.type && duree(p) > MISSION_MAX_MOIS && contient(p, x)).sort((a, b) => duree(b) - duree(a))[0];
    if (parent) parents.add(parent.id);
    if (parent && !lineaire) (missions.get(parent.id) ?? missions.set(parent.id, []).get(parent.id)).push(x);
    else principales.push(x);
  }
  if (lineaire) principales = principales.filter(x => !parents.has(x.id));
  const groupes = [];
  for (const x of principales) {
    const g = !lineaire && groupes.find(g => norm(g.poste) === norm(x.poste) && g.type === x.type);
    if (g) g.membres.push(x);
    else groupes.push({ poste: x.poste, type: x.type, membres: [x] });
  }
  const duMetierIds = new Set();
  const experiencesBrutes = groupes.map(({ poste, membres }) => {
    const ids = membres.map(m => m.id);
    const debut = membres.map(m => m.debut).filter(Boolean).sort()[0] ?? '';
    const fin = membres.some(m => !m.fin) ? '' : membres.map(m => m.fin).sort().at(-1) ?? '';
    const employeur = membres.length === 1 ? membres[0].employeur : membres.map(m => `${m.employeur} (${periode(m.debut, m.fin)})`).join(', ');
    // NOTE: postes regroupés : le lieu n'est affiché que si tous les membres ont le même (ou un seul le renseigne)
    const lieux = [...new Set(membres.map(m => m.lieu).filter(Boolean))];
    const poids = Object.assign({}, ...membres.map(m => normaliserPoids(jsonDe(m, 'poids'))));
    // NOTE: pertinente = score d'au moins 2, la même règle que le tri : les puces comptées sont exactement celles de tête
    const { pertinente, score, pese } = evaluerPuces(vise, libellesPrio, poids);
    const triees = trierPuces(sansRedites(membres.flatMap(m => puces(m.description))), vise, libellesPrio, poids);
    // ANCHOR: un poids 0 saisi pour le métier visé masque la puce (score 0), sauf si elle cite une compétence de l'offre (+1) ; si toutes sont écartées, l'expérience sort du CV d'une offre ou tient sur une ligne dans un CV de métier (videPourMetier)
    // ANCHOR: seuil de poids (cible Offre sur 2 pages) : les puces pesées jusqu'au seuil sortent aussi, jamais celles qui citent une compétence de l'offre (score au-dessus du poids) ni les puces non pesées
    const masquee = p => { const n = poidsPuce(poids, p, vise); return n !== null && score(p) === n && n <= seuilPuces; };
    const gardees = vise && pese(triees) ? triees.filter(p => score(p) > 0 && !masquee(p)) : triees;
    // ANCHOR: expérience dont toutes les puces sont écartées (toutes à 0 pour le métier visé) : sortie du CV pour une offre, une seule ligne (poste, employeur, période) pour un métier
    const videPourMetier = Boolean(vise) && pese(triees) && gardees.length === 0;
    const liste = gardees.length ? gardees : triees;
    const duMetier = membres.some(m => m.categorie === vise);
    if (duMetier) duMetierIds.add(ids[0]);
    const nbPertinentes = (pertinente || pese(liste)) ? liste.filter(p => score(p) >= 2).length : 0;
    const enLien = duMetier || membres.some(m => (m.competences ?? []).some(c => prio.has(c))) || nbPertinentes >= PUCES_DU_METIER;
    const condensee = Boolean(vise) && !enLien;
    // NOTE: expérience d'un autre métier gardée : puces pertinentes (en tête après le tri), puis PUCES_CONDENSEE autres au plus
    const allegee = Boolean(vise) && enLien && !duMetier && (pertinente || pese(liste)) ? liste.slice(0, nbPertinentes + PUCES_CONDENSEE) : liste;
    const sous = membres.flatMap(m => missions.get(m.id) ?? []).sort(triAntechrono).slice(0, MISSIONS_MAX)
      .map(m => ({ id: m.id, employeur: m.employeur, lieu: m.lieu ?? '', poste: m.poste, periode: periode(m.debut, m.fin, { mois: true }) }));
    return {
      // ANCHOR: intitulé propre au métier visé (experiences.intitules), sinon le poste ; le regroupement reste fait sur le poste
      ids, poste: (vise && membres.map(m => intitulesDe(m)[vise]).find(Boolean)) || poste, employeur, lieu: lieux.length === 1 ? lieux[0] : '', debut, fin, periode: periode(debut, fin),
      puces: videPourMetier ? [] : condensee ? liste.slice(0, PUCES_CONDENSEE) : allegee, missions: condensee || videPourMetier ? [] : sous, condensee: condensee || videPourMetier, vide: videPourMetier,
    };
  });

  // ANCHOR: parmi les expériences en cours, celle du métier visé passe en premier (ordre chronologique inverse gardé pour le reste)
  const experiencesGardees = experiencesBrutes.filter(e => !(cible === 'offre' && e.vide)).map(({ vide, ...e }) => e);
  const enCours = experiencesGardees.filter(e => !e.fin).sort((a, b) => Number(duMetierIds.has(b.ids[0])) - Number(duMetierIds.has(a.ids[0])));
  const experiences = vise ? [...enCours, ...experiencesGardees.filter(e => e.fin)] : experiencesGardees;

  // ANCHOR: formation : diplômes et certifications seulement (un titre_pro est un titre enseigné, jamais un diplôme)
  const formations = etat.formations ?? [];
  // NOTE: pour un métier visé, le diplôme qui en parle (mots du métier dans son titre) passe avant les autres, l'ordre chronologique inverse départage chaque groupe
  const duMetierVise = f => Boolean(MOTS_METIER[vise]?.test(norm(f.titre)));
  const formation = formations.filter(f => f.type !== 'titre_pro' && f.titre).sort((a, b) => Number(duMetierVise(b)) - Number(duMetierVise(a)) || anneeTri(b) - anneeTri(a))
    .map(f => ({ id: f.id, titre: f.titre, etablissement: f.etablissement ?? '', lieu: f.lieu ?? '', annees: periodeFormation(f), note: interne(f.note) ? '' : f.note ?? '' }));
  const titresPrepares = vise === 'formateur_digital' ? formations.filter(f => f.type === 'titre_pro' && f.titre && !interne(f.titre)).map(f => sansParentheses(f.titre)) : [];

  // ANCHOR: compétences notées 3 ou plus, par domaine ; pour un métier visé, seulement celles du métier et les transversales (DOMAINES_METIER) ou trouvées dans l'offre
  const regles = DOMAINES_METIER[vise] ?? null;
  const rangRegle = c => (regles ? regles.findIndex(r => r.d.test(norm(c.domaine)) && (!r.c || r.c.test(norm(c.competence)))) : 0);
  const ordreDomaines = [];
  const parDomaine = new Map();
  competences.forEach((c, i) => {
    const rang = rangRegle(c);
    if (c.domaine === 'Langues' || niveauPourCible(c, vise) < (rang === 0 ? NIVEAU_MIN_PRINCIPAL[vise] ?? NIVEAU_MIN : NIVEAU_MIN)) return;
    if (rang === -1 && !prio.has(c.id)) return;
    // ANCHOR: un poids 0 saisi pour le métier visé masque la compétence, sauf si l'offre la demande
    if (vise && poidsCompetence(c, vise) === 0 && !prio.has(c.id)) return;
    if (!parDomaine.has(c.domaine)) { parDomaine.set(c.domaine, []); ordreDomaines.push(c.domaine); }
    parDomaine.get(c.domaine).push({ c, i });
  });
  const rangDomaine = d => {
    const k = regles ? Math.min(...parDomaine.get(d).map(({ c }) => rangRegle(c)).filter(r => r !== -1), regles.length) : 0;
    const avecPrio = parDomaine.get(d).some(({ c }) => prio.has(c.id)) ? 0 : 1;
    return [k, avecPrio, ordreDomaines.indexOf(d)];
  };
  // NOTE: sans métier visé, un domaine pèse selon ses 5 meilleures compétences (niveau le plus haut des deux axes) pour être retenu, puis les domaines retenus reprennent l'ordre du Profil
  const force = d => parDomaine.get(d).map(({ c }) => niveauPourCible(c, vise)).sort((a, b) => b - a).slice(0, 5).reduce((t, n) => t + n, 0);
  const tri = (a, b) => {
    const [x, y] = [rangDomaine(a), rangDomaine(b)];
    return x[0] - y[0] || (prio.size ? x[1] - y[1] : 0) || x[2] - y[2];
  };
  const domaines = (vise ? [...ordreDomaines].sort(tri).slice(0, DOMAINES_MAX_CIBLE)
    : [...ordreDomaines].sort((a, b) => force(b) - force(a) || tri(a, b)).slice(0, DOMAINES_MAX_GENERAL).sort(tri));
  const retenuesParDomaine = domaines.map((d, rang) => ({
    domaine: sansParentheses(d),
    // NOTE: le nombre de projets départage seulement (jamais un filtre : la comptabilité n'a aucun projet) ; la part de l'IA des projets n'est jamais lue ici
    items: parDomaine.get(d)
      .sort((a, b) => Number(prio.has(b.c.id)) - Number(prio.has(a.c.id)) || (poidsCompetence(b.c, vise) ?? 2) - (poidsCompetence(a.c, vise) ?? 2) /* NOTE: sans poids saisi, une compétence vaut 2 : elle passe avant un poids 0 ou 1 et après un 3 */ || niveauPourCible(b.c, vise) - niveauPourCible(a.c, vise) || (nbProjets.get(b.c.id) ?? 0) - (nbProjets.get(a.c.id) ?? 0) || a.i - b.i)
      .slice(0, vise ? (rang === 0 ? PAR_DOMAINE_PRINCIPAL : PAR_DOMAINE) : PAR_DOMAINE_GENERAL).map(({ c }) => c),
  }));
  // ANCHOR: plafond global pour un métier visé : au-delà de COMPETENCES_MAX_CIBLE, les moins significatives pour le métier sortent d'abord (hors compétences de l'offre, puis niveau faible, puis domaines et rangs de fin), les domaines vidés disparaissent
  const retenues = (() => {
    if (!vise) return retenuesParDomaine;
    const toutes = retenuesParDomaine.flatMap((r, d) => r.items.map((c, k) => ({ c, d, k, valeur: (prio.has(c.id) ? 10 : 0) + (poidsCompetence(c, vise) === 3 ? 5 : 0) + niveauPourCible(c, vise) })));
    const retirees = new Set(toutes.sort((a, b) => a.valeur - b.valeur || b.d - a.d || b.k - a.k).slice(0, Math.max(0, toutes.length - plafondCompetences)).map(x => x.c.id));
    return retenuesParDomaine.map(r => ({ ...r, items: r.items.filter(c => !retirees.has(c.id)) })).filter(r => r.items.length);
  })();
  const phares = new Set(retenues.flatMap(r => r.items).filter(c => (!vise || METIERS_AVEC_PREUVE.includes(vise)) && (nbProjets.get(c.id) ?? 0) >= PROJETS_MIN_PREUVE)
    .sort((a, b) => niveauPourCible(b, vise) - niveauPourCible(a, vise) || (nbProjets.get(b.id) ?? 0) - (nbProjets.get(a.id) ?? 0))
    .slice(0, COMPETENCES_PHARES).map(c => c.id));
  const competencesCv = retenues.map(({ domaine, items }) => ({ domaine, liste: items.map(c => avecPreuve(c.competence, phares.has(c.id) ? nbProjets.get(c.id) ?? 0 : 0)) }));
  // NOTE: la note d'une langue n'est reprise que si c'est un niveau (débutant, courant, B2...), une remarque de travail n'a rien à faire sur un CV
  const langues = competences.filter(c => c.domaine === 'Langues').map(c => ({ langue: c.competence, niveau: NIVEAU_LANGUE.test(norm(c.note)) ? String(c.note).trim() : '' }));

  const accroches = profil.accroches ?? {};
  // ANCHOR: titre sous le nom propre à la cible (profil.titres, sinon titre par défaut du métier), le CV général reprend celui des coordonnées
  const titre = String((vise ? profil.titres?.[vise] || TITRES_METIER[vise] : profil.titres?.general) || contact.titre || '');
  return {
    cible, categorie: vise, offre_id: offre?.id_offre ?? '',
    libelle: cible === 'offre' ? [offre?.titre, offre?.entreprise].filter(Boolean).join(', ') : cible === 'metier' ? LIBELLES_METIER[vise] : 'Général',
    entete: { ...contact, titre },
    accroche: String((vise && accroches[vise]) || (!vise && accroches.general) || profil.accroche || ''),
    resume: String((vise ? profil.resumes?.[vise] : profil.resumes?.general) || profil.resume || ''),
    experiences, formation, titres_prepares: titresPrepares, competences: competencesCv, langues,
  };
}

// Compétences du Profil trouvées dans une offre (titre et annonce), pour le CV sur mesure
export function prioritairesOffre(competences, offre) {
  const titre = norm(offre?.titre);
  return competencesTrouvees(termesCompetences(competences, NIVEAU_MIN), titre, `${titre} ${norm(offre?.annonce)}`).map(c => c.id);
}

// Nom de fichier, convention du dossier CV-LM : CV_Prenom_Nom_AAAA-MM.pdf (général) ou CV_Prenom_Nom_AAAA-MM_<Cible>.pdf
export function nomCv(doc, quand = new Date()) {
  const propre = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map(majuscule).join('-');
  const nom = norm(doc.entete?.nom).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map(majuscule).join('_') || 'CV';
  const mois = quand.toISOString().slice(0, 7);
  const suffixe = doc.cible === 'general' ? '' : `_${propre(doc.libelle).split('-').slice(0, 6).join('-')}`;
  return `CV_${nom}_${mois}${suffixe}`;
}

// --- Contrôle contre le CV de référence ---

const MOTS_VIDES = new Set(['de', 'des', 'du', 'la', 'le', 'les', 'et', 'en', 'un', 'une', 'pour', 'dans', 'avec', 'sur', 'aux', 'par', 'plus', 'ses', 'son', 'mes', 'mon', 'que', 'qui', 'est', 'sous', 'tout', 'tous', 'depuis']);
const mots = s => norm(s).split(/[^a-z0-9+#]+/).filter(m => m.length >= 3 && !MOTS_VIDES.has(m));
const preparerSource = texte => {
  const n = norm(texte).replace(/\s+/g, ' ');
  return { n, mots: new Set(n.split(/[^a-z0-9+#]+/)) };
};
const present = (source, m) => source.mots.has(m) || (m.length >= 4 && source.n.includes(m));

// Faits concrets d'un texte libre : années, nombres, noms propres et technologies (mot à majuscule hors début de phrase, sigle, mot avec chiffre ou point)
export function faitsConcrets(texte) {
  const faits = new Set();
  for (const phrase of String(texte ?? '').split(/(?<=[.!?:;])\s+|\n+/)) {
    const jetons = phrase.match(/[\p{L}\p{N}][\p{L}\p{N}.+#'-]*/gu) ?? [];
    jetons.forEach((j, i) => {
      const t = j.replace(/[.'-]+$/, '');
      if (/^\d+([.,]\d+)?$/.test(t)) { faits.add(t); return; }
      const sigle = /^[A-ZÀ-Ý0-9]{2,}$/.test(t) && /[A-Z]/.test(t);
      const technique = /\d/.test(t) || /\.[a-z]/i.test(t) || /[a-z][A-Z]/.test(t) || /[+#]/.test(t);
      const propre = i > 0 && /^[A-ZÀ-Ý]/.test(t) && t.length >= 2;
      if (sigle || technique || propre) faits.add(t);
    });
  }
  return [...faits];
}

/**
 * Contrôle d'un texte libre : chaque fait concret doit figurer dans le CV de référence (ok), sinon au moins dans le Profil (profil), sinon il est à vérifier (absent)
 * @param {string} texte @param {string} reference @param {string} [profil]
 */
export function controlerTexte(texte, reference, profil = '') {
  const ref = preparerSource(reference);
  const pro = preparerSource(profil);
  return faitsConcrets(texte).map(f => {
    const m = norm(f);
    const ok = /^\d/.test(m) ? new RegExp(`(^|[^0-9])${m.replace(/[.,]/g, '[.,]')}($|[^0-9])`).test(ref.n) : present(ref, m) || mots(f).every(x => present(ref, x));
    const dansProfil = !ok && (pro.n.includes(m) || mots(f).every(x => present(pro, x)));
    return { fait: f, statut: ok ? 'ok' : dansProfil ? 'profil' : 'absent' };
  });
}

// Texte du Profil, source secondaire du contrôle (ce que l'app sait de l'utilisateur, hors CV de référence)
export function texteProfil(etat) {
  const p = etat.profil ?? {};
  return [
    p.accroche, p.resume, ...Object.values(p.accroches ?? {}), ...Object.values(p.titres ?? {}), ...Object.values(p.resumes ?? {}),
    ...(etat.experiences ?? []).flatMap(x => [x.poste, ...Object.values(intitulesDe(x)), x.employeur, x.lieu, x.description, x.debut, x.fin]),
    ...(etat.formations ?? []).flatMap(f => [f.titre, f.etablissement, f.lieu, periodeFormation(f), f.matieres, f.note]),
    ...(etat.competences ?? []).flatMap(c => [c.domaine, c.competence, c.note]),
  ].filter(Boolean).join('\n');
}

/**
 * Compare le CV composé (ou personnalisé) au texte du CV de référence. Rien n'est bloquant : les écarts sont signalés.
 * statut : ok (trouvé), partiel (60 % des mots au moins), profil (absent du CV de référence mais présent dans le Profil), absent
 * @param {any} doc @param {string} reference @param {string} [profil]
 */
export function controlerCv(doc, reference, profil = '') {
  if (!String(reference ?? '').trim()) return { disponible: false, faits: [], ecarts: 0, avertissements: 0 };
  const ref = preparerSource(reference);
  const source = String(profil ?? '').trim() ? preparerSource(profil) : null;
  const faits = [];
  // NOTE: un intitulé absent du CV de référence mais saisi dans le Profil (intitulé par métier) est signalé « profil », pas comme un écart
  const intitule = (rubrique, element, valeur) => {
    const liste = mots(valeur);
    if (!liste.length) return;
    const trouves = liste.filter(m => present(ref, m)).length / liste.length;
    const statut = trouves === 1 ? 'ok' : trouves >= 0.6 ? 'partiel' : source && liste.every(m => present(source, m)) ? 'profil' : 'absent';
    faits.push({ rubrique, element, valeur, statut });
  };
  const annee = (rubrique, element, valeur) => {
    for (const a of String(valeur ?? '').match(/\b(19|20)\d{2}\b/g) ?? []) faits.push({ rubrique, element, valeur: a, statut: new RegExp(`(^|[^0-9])${a}($|[^0-9])`).test(ref.n) ? 'ok' : 'absent' });
  };
  const texte = (rubrique, element, valeur) => {
    for (const f of controlerTexte(valeur, reference, profil)) faits.push({ rubrique, element, valeur: f.fait, statut: f.statut });
  };
  texte('Profil', 'Accroche', doc.accroche);
  texte('Profil', 'Résumé', doc.resume);
  for (const x of doc.experiences ?? []) {
    const el = [x.poste, x.employeur].filter(Boolean).join(', ');
    intitule('Expérience', el, x.poste);
    for (const e of String(x.employeur ?? '').split(/,\s*(?![^()]*\))/)) intitule('Expérience', el, sansParentheses(e));
    annee('Expérience', el, x.periode);
    for (const p of x.puces ?? []) texte('Expérience', el, p);
    for (const m of x.missions ?? []) { intitule('Mission', m.employeur, m.employeur); annee('Mission', m.employeur, m.periode); }
  }
  for (const f of doc.formation ?? []) {
    intitule('Formation', f.titre, f.titre);
    if (f.etablissement) intitule('Formation', f.titre, f.etablissement);
    annee('Formation', f.titre, f.annees);
  }
  // NOTE: un même fait vérifié deux fois pour le même élément n'est compté qu'une fois
  const vus = new Set();
  const uniques = faits.filter(f => { const k = `${f.rubrique}|${f.element}|${norm(f.valeur)}`; return !vus.has(k) && vus.add(k); });
  return {
    disponible: true, faits: uniques,
    ecarts: uniques.filter(f => f.statut === 'absent').length,
    avertissements: uniques.filter(f => f.statut === 'partiel' || f.statut === 'profil').length,
  };
}

// --- Document reçu de l'extérieur (personnalisé par Claude ou renvoyé par l'interface) ---

const chaine = (v, champ, max = 2000) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new ErreurCv(`${champ} doit être une chaîne.`);
  if (v.length > max) throw new ErreurCv(`${champ} dépasse ${max} caractères.`);
  return v;
};
const tableau = (v, champ, max = 40) => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ErreurCv(`${champ} doit être un tableau.`);
  if (v.length > max) throw new ErreurCv(`${champ} : ${max} éléments au plus.`);
  return v;
};

// Valide et nettoie un document de CV (forme de composerCv). Lève ErreurCv avec un message clair.
export function validerDocument(d) {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new ErreurCv('document : objet attendu (forme renvoyée par POST /api/cv/composer).');
  if (!CIBLES_CV.includes(d.cible)) throw new ErreurCv('document.cible : general, metier ou offre.');
  const entete = Object.fromEntries(CHAMPS_CONTACT.map(k => [k, chaine(d.entete?.[k], `entete.${k}`, 200).trim()]));
  if (!entete.nom) throw new ErreurCv('Nom absent : renseignez le contact dans Profil > Coordonnées avant l\'export.');
  return {
    cible: d.cible, categorie: chaine(d.categorie, 'categorie', 40), offre_id: chaine(d.offre_id, 'offre_id', 100), libelle: chaine(d.libelle, 'libelle', 200),
    photo: Boolean(d.photo),
    entete, accroche: chaine(d.accroche, 'accroche', 400), resume: chaine(d.resume, 'resume', 3000),
    experiences: tableau(d.experiences, 'experiences').map((x, i) => ({
      ids: tableau(x?.ids, `experiences[${i}].ids`).map(String), poste: chaine(x?.poste, `experiences[${i}].poste`, 200), employeur: chaine(x?.employeur, `experiences[${i}].employeur`, 400),
      lieu: chaine(x?.lieu, `experiences[${i}].lieu`, 200), debut: chaine(x?.debut, `experiences[${i}].debut`, 7), fin: chaine(x?.fin, `experiences[${i}].fin`, 7),
      periode: chaine(x?.periode, `experiences[${i}].periode`, 80), condensee: Boolean(x?.condensee),
      puces: tableau(x?.puces, `experiences[${i}].puces`).map((p, j) => chaine(p, `experiences[${i}].puces[${j}]`, 500)),
      missions: tableau(x?.missions, `experiences[${i}].missions`).map((m, j) => ({
        id: chaine(m?.id, `missions[${j}].id`, 100), employeur: chaine(m?.employeur, `missions[${j}].employeur`, 200), lieu: chaine(m?.lieu ?? '', `missions[${j}].lieu`, 120), poste: chaine(m?.poste, `missions[${j}].poste`, 200), periode: chaine(m?.periode, `missions[${j}].periode`, 80),
      })),
    })),
    formation: tableau(d.formation, 'formation').map((f, i) => ({
      id: chaine(f?.id, `formation[${i}].id`, 100), titre: chaine(f?.titre, `formation[${i}].titre`, 300), etablissement: chaine(f?.etablissement, `formation[${i}].etablissement`, 200), lieu: chaine(f?.lieu ?? '', `formation[${i}].lieu`, 120),
      annees: chaine(f?.annees, `formation[${i}].annees`, 80), note: chaine(f?.note, `formation[${i}].note`, 300),
    })),
    titres_prepares: tableau(d.titres_prepares, 'titres_prepares').map((t, i) => chaine(t, `titres_prepares[${i}]`, 300)),
    competences: tableau(d.competences, 'competences').map((c, i) => ({
      domaine: chaine(c?.domaine, `competences[${i}].domaine`, 200), liste: tableau(c?.liste, `competences[${i}].liste`).map((x, j) => chaine(x, `competences[${i}].liste[${j}]`, 200)),
    })),
    langues: tableau(d.langues, 'langues').map((l, i) => ({ langue: chaine(l?.langue, `langues[${i}].langue`, 100), niveau: chaine(l?.niveau, `langues[${i}].niveau`, 200) })),
  };
}
