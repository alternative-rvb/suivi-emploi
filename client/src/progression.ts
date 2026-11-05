// ANCHOR: progression de l'accueil (ligne 85) : défis du jour, objectif de la semaine, grades et métiers validés.
// Logique pure, sans appel réseau : l'activité vient du rapport du journal (GET /api/rapport) et de l'état déjà chargé.
// NOTE: on récompense l'effort, jamais le résultat (une réponse pour une dizaine de candidatures ciblées en 2026).
import type { Candidature, Echange, Tache } from '../../types.js';
import { ajouterJours } from './utils.ts';

export const PREFIXE_DEFI = 'Défi : ';
export const OBJECTIF_JOURS = 4;
// ANCHOR: quotas de candidatures fixés d'après les conseils courants (sources : Indeed, Resume Worded et guides français) : 2 à 3 candidatures ciblées par jour au plus, 10 à 15 par semaine ; au-delà, les envois deviennent génériques. Le plancher de la fourchette est retenu, car chaque candidature de l'app est adaptée (CV et lettre sur mesure).
export const QUOTA_JOUR = 2;
export const QUOTA_SEMAINE = 10;
const OBJECTIF_TRI = 5;
const ENVOYEES = new Set(['en_cours', 'entretien', 'sans_reponse', 'refuse', 'accepte']);

// Compteurs d'actions du rapport qui rendent une journée active (les offres détectées ou expirées ne dépendent pas de l'utilisateur)
const ACTIONS = ['offres_vues', 'offres_ecartees', 'offres_saisies', 'candidatures_creees', 'changements_statut', 'taches_creees', 'taches_faites', 'echanges'];
export const estActif = (p: any) => !!p && ACTIONS.some(c => (p[c] ?? 0) > 0);
const tri = (p: any) => (p?.offres_vues ?? 0) + (p?.offres_ecartees ?? 0);

export const estEnvoyee = (c: Candidature) => ENVOYEES.has(c.statut);
export const envoyeesLe = (candidatures: Candidature[], jour: string) => candidatures.filter(c => c.date === jour && estEnvoyee(c)).length;

export interface Contexte {
  auj: string;
  candidatures: Candidature[];
  taches: Tache[];
  echanges: Echange[];
  rapportJour: any; // période du jour dans le rapport, null tant qu'il n'est pas chargé
  offresNonVues: number;
  aRelancer: number;
  enRetard: number;
}

export interface Defi {
  id: string;
  titre: string;
  pourquoi: string;
  manuel?: boolean; // validé par un clic, enregistré comme tâche faite « Défi : titre »
  avancement?: (x: Contexte) => [number, number];
}

const faitManuel = (x: Contexte, d: Defi) => x.taches.some(t => t.faite && t.creee === x.auj && t.titre === PREFIXE_DEFI + d.titre);

export const DEFIS: Record<string, Defi> = {
  postuler: {
    id: 'postuler',
    titre: `Envoyer ${QUOTA_JOUR} candidatures ciblées`,
    pourquoi: 'Deux à trois candidatures adaptées par jour valent mieux qu\'un envoi en masse : une candidature sur mesure obtient bien plus de réponses qu\'un envoi générique.',
    avancement: x => [Math.min(QUOTA_JOUR, envoyeesLe(x.candidatures, x.auj)), QUOTA_JOUR],
  },
  trier: {
    id: 'trier',
    titre: `Passer en revue ${OBJECTIF_TRI} offres`,
    pourquoi: 'Trier régulièrement évite de laisser passer une offre fraîche : les premiers candidats sont lus en premier.',
    avancement: x => [Math.min(OBJECTIF_TRI, tri(x.rapportJour)), OBJECTIF_TRI],
  },
  relancer: {
    id: 'relancer',
    titre: 'Relancer une candidature sans nouvelles',
    pourquoi: 'Près d\'un candidat sur deux reste sans réponse : une relance polie remet votre dossier sur le dessus de la pile.',
    avancement: x => [Math.min(1, x.echanges.filter(e => e.date === x.auj).length + x.taches.filter(t => t.titre === 'Relancer' && t.creee === x.auj).length), 1],
  },
  tache: {
    id: 'tache',
    titre: 'Solder une tâche en retard',
    pourquoi: 'Une tâche qui traîne pèse plus lourd que le temps qu\'elle demande.',
    avancement: x => [Math.min(1, x.rapportJour?.taches_faites ?? 0), 1],
  },
  reseau: {
    id: 'reseau',
    titre: 'Prendre des nouvelles d\'une personne de votre réseau',
    pourquoi: 'Le soutien social fait partie des leviers les plus efficaces de la recherche d\'emploi, et beaucoup de postes se pourvoient sans annonce.',
    manuel: true,
  },
  pause: {
    id: 'pause',
    titre: 'Faire une vraie pause de 30 minutes',
    pourquoi: 'Gérer son stress fait partie des méthodes qui marchent : une recherche d\'emploi est un marathon.',
    manuel: true,
  },
  profil: {
    id: 'profil',
    titre: 'Améliorer une ligne du CV ou du profil',
    pourquoi: 'Chaque retouche sert à toutes les candidatures suivantes.',
    manuel: true,
  },
};

export const avancementDefi = (d: Defi, x: Contexte): [number, number] => (d.manuel ? [faitManuel(x, d) ? 1 : 0, 1] : d.avancement!(x));
export const defiFait = (d: Defi, x: Contexte) => { const [n, sur] = avancementDefi(d, x); return n >= sur; };

// ANCHOR: trois défis selon la situation du moment : une action, un suivi, un défi bien-être ou réseau en rotation (figés pour la journée par l'appelant)
export function choisirDefis(x: Contexte): string[] {
  const action = x.offresNonVues >= OBJECTIF_TRI ? 'trier' : 'postuler';
  const suivi = x.aRelancer > 0 ? 'relancer' : x.enRetard > 0 ? 'tache' : action === 'trier' ? 'postuler' : 'trier';
  const rotation = ['reseau', 'pause', 'profil'];
  const n = Math.floor(new Date(x.auj + 'T12:00:00Z').getTime() / 864e5);
  return [action, suivi, rotation[n % rotation.length]];
}

// --- Semaine ---
export const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function lundiDe(jour: string) {
  const d = new Date(jour + 'T12:00:00Z');
  return ajouterJours(jour, -((d.getUTCDay() + 6) % 7));
}

// Jours de la semaine en cours, actifs ou non, à partir des périodes du rapport
export function semaine(auj: string, periodes: any[]) {
  const parJour = new Map(periodes.map(p => [p.periode, p]));
  const lundi = lundiDe(auj);
  const jours = JOURS_COURTS.map((nom, i) => {
    const jour = ajouterJours(lundi, i);
    return { jour, nom, actif: estActif(parJour.get(jour)), futur: jour > auj, weekend: i >= 5 };
  });
  const actifs = jours.filter(j => j.actif && !j.weekend).length;
  const bonus = jours.filter(j => j.actif && j.weekend).length;
  return { jours, actifs, bonus, atteint: actifs >= OBJECTIF_JOURS };
}

// Semaines (lundi) où l'objectif a été atteint, sur tout le journal
export function semainesReussies(periodes: any[]) {
  const parSemaine = new Map<string, number>();
  for (const p of periodes) {
    const d = new Date(p.periode + 'T12:00:00Z').getUTCDay();
    if (d === 0 || d === 6 || !estActif(p)) continue;
    const l = lundiDe(p.periode);
    parSemaine.set(l, (parSemaine.get(l) ?? 0) + 1);
  }
  return [...parSemaine.values()].filter(n => n >= OBJECTIF_JOURS).length;
}

// Candidatures envoyées de la semaine en cours (lundi au dimanche)
export const envoyeesSemaine = (candidatures: Candidature[], auj: string) => {
  const lundi = lundiDe(auj);
  const dimanche = ajouterJours(lundi, 6);
  return candidatures.filter(c => estEnvoyee(c) && c.date >= lundi && c.date <= dimanche).length;
};

// Jours où le quota quotidien est tenu, et semaines (lundi au dimanche) où le quota hebdomadaire l'est, sur toutes les candidatures
export function quotasTenus(candidatures: Candidature[]) {
  const parJour = new Map<string, number>();
  for (const c of candidatures) if (estEnvoyee(c) && c.date) parJour.set(c.date, (parJour.get(c.date) ?? 0) + 1);
  const parSemaine = new Map<string, number>();
  for (const [jour, n] of parJour) parSemaine.set(lundiDe(jour), (parSemaine.get(lundiDe(jour)) ?? 0) + n);
  return {
    jours: [...parJour.values()].filter(n => n >= QUOTA_JOUR).length,
    semaines: [...parSemaine.values()].filter(n => n >= QUOTA_SEMAINE).length,
  };
}

// ANCHOR: meilleure série de jours actifs consécutifs (week-end compris) sur tout le journal. C'est un record : il ne se perd jamais, une série interrompue ne retire rien.
export function serieRecord(periodes: any[]) {
  let record = 0;
  let courante = 0;
  let veille = '';
  for (const p of [...periodes].sort((a, b) => a.periode.localeCompare(b.periode))) {
    if (!estActif(p)) { courante = 0; veille = p.periode; continue; }
    courante = veille && ajouterJours(veille, 1) === p.periode ? courante + 1 : 1;
    veille = p.periode;
    record = Math.max(record, courante);
  }
  return record;
}

// --- Grades et badges ---
export interface Grade { seuil: number; titre: string; mot: string }

// ANCHOR: grades selon le nombre de candidatures envoyées, sur une seule échelle (la carrière d'un service comptable), du stagiaire au grade suprême
export const GRADES: Grade[] = [
  { seuil: 0, titre: 'Stagiaire de la candidature', mot: 'Tout le monde commence quelque part, même les directeurs financiers.' },
  { seuil: 1, titre: 'Chercheur d\'emploi professionnel', mot: 'Première candidature envoyée : le métier est officiellement validé.' },
  { seuil: 5, titre: 'Aide-comptable des candidatures', mot: 'Cinq pièces saisies, le classeur prend forme.' },
  { seuil: 10, titre: 'Assistant comptable des candidatures', mot: 'Dix écritures passées, le rapprochement se fait les yeux fermés.' },
  { seuil: 20, titre: 'Comptable des candidatures', mot: 'Vingt candidatures : le grand livre est tenu à jour.' },
  { seuil: 35, titre: 'Comptable confirmé des candidatures', mot: 'Trente-cinq envois, la clôture mensuelle ne vous fait plus peur.' },
  { seuil: 50, titre: 'Chef comptable des candidatures', mot: 'Cinquante dossiers : vous encadrez désormais votre propre motivation.' },
  { seuil: 75, titre: 'Expert-comptable de la candidature', mot: 'Soixante-quinze envois certifiés sincères et véritables.' },
  { seuil: 100, titre: 'Commissaire aux candidatures', mot: 'Cent dossiers audités, aucune réserve à signaler.' },
  { seuil: 150, titre: 'Directeur administratif et financier de la recherche', mot: 'Cent cinquante candidatures : le comité de direction vous consulte.' },
  { seuil: 200, titre: 'Légende vivante de la candidature', mot: 'Grade suprême. Votre bilan est enseigné en formation.' },
];

export function grade(envoyees: number) {
  let i = 0;
  while (i + 1 < GRADES.length && envoyees >= GRADES[i + 1].seuil) i++;
  return { actuel: GRADES[i], suivant: GRADES[i + 1] ?? null, rang: i };
}

export interface Stats {
  envoyees: number;
  echanges: number;
  triees: number;
  entretiens: number;
  refus: number;
  acceptees: number;
  semaines: number;
  serie: number;
  joursQuota: number;
  semainesQuota: number;
  defis: Record<string, number>;
  defisReussis: number;
}

// ANCHOR: badges par famille d'effort, chacun sur trois niveaux au nom construit de la même façon (apprenti, confirmé, émérite), seuils croissants
export const NIVEAUX = ['apprenti', 'confirmé', 'émérite'];

export interface Famille { id: string; role: string; cle: (s: Stats) => number; seuils: number[]; mots: string[] }

export const FAMILLES: Famille[] = [
  { id: 'tri', role: 'Trieur d\'offres', cle: s => s.triees, seuils: [25, 100, 300], mots: ['Vingt-cinq annonces lues jusqu\'au bout.', 'Cent offres passées au crible, l\'œil est affûté.', 'Trois cents offres triées : plus rien ne vous échappe.'] },
  { id: 'relance', role: 'Relanceur', cle: s => s.echanges, seuils: [1, 5, 20], mots: ['Premier contact noté : le silence n\'est plus une fatalité.', 'Cinq contacts : les recruteurs connaissent votre nom.', 'Vingt contacts : la relance est devenue un art.'] },
  { id: 'reseau', role: 'Réseauteur', cle: s => s.defis.reseau ?? 0, seuils: [1, 5, 15], mots: ['Une première personne du réseau recontactée.', 'Cinq contacts du réseau : le bouche-à-oreille travaille pour vous.', 'Quinze contacts du réseau : vous êtes un carrefour.'] },
  { id: 'regularite', role: 'Marathonien', cle: s => s.semaines, seuils: [1, 4, 12], mots: ['Première semaine réussie.', 'Quatre semaines réussies : la régularité paie.', 'Douze semaines réussies : un trimestre sans faiblir.'] },
  { id: 'quotidien', role: 'Sprinteur', cle: s => s.joursQuota, seuils: [1, 10, 30], mots: [`Premier jour à ${QUOTA_JOUR} candidatures ciblées : le rythme est lancé.`, 'Dix jours au quota : deux bonnes candidatures par jour, c\'est une méthode.', 'Trente jours au quota : la régularité fait le travail.'] },
  { id: 'hebdo', role: 'Fondeur', cle: s => s.semainesQuota, seuils: [1, 4, 12], mots: [`Première semaine à ${QUOTA_SEMAINE} candidatures : le volume utile est atteint.`, 'Quatre semaines au quota : un mois de recherche menée à bon rythme.', 'Douze semaines au quota : un trimestre de candidatures ciblées.'] },
  { id: 'serie', role: 'Assidu', cle: s => s.serie, seuils: [7, 14, 30], mots: ['Sept jours d\'affilée : une semaine complète sans relâche.', 'Quatorze jours d\'affilée : l\'habitude est prise.', 'Trente jours d\'affilée : un mois entier, chapeau bas.'] },
  { id: 'entretien', role: 'Orateur', cle: s => s.entretiens, seuils: [1, 3, 10], mots: ['Premier entretien décroché : la lettre a fait son travail.', 'Trois entretiens : le discours est rodé.', 'Dix entretiens : vous pourriez les animer.'] },
  { id: 'refus', role: 'Encaisseur de refus', cle: s => s.refus, seuils: [1, 5, 15], mots: ['Premier refus encaissé. Il en faut une dizaine pour une réponse positive.', 'Cinq refus : chaque non rapproche statistiquement du oui.', 'Quinze refus encaissés sans faiblir : une cuirasse de comptable.'] },
  { id: 'defi', role: 'Relève-défis', cle: s => s.defisReussis, seuils: [5, 20, 50], mots: ['Cinq défis relevés : le rituel du matin s\'installe.', 'Vingt défis relevés : vous ne les comptez plus, ils vous comptent.', 'Cinquante défis relevés : le sport de haut niveau de la recherche d\'emploi.'] },
  { id: 'zen', role: 'Gardien de l\'équilibre', cle: s => s.defis.pause ?? 0, seuils: [1, 5, 15], mots: ['Une vraie pause prise sans culpabiliser.', 'Cinq pauses : le meilleur atout d\'un marathonien.', 'Quinze pauses : la sérénité est une compétence.'] },
];

export interface Badge { id: string; famille: Famille; niveau: number; titre: string; mot: string; seuil: number }

// Les trois badges d'une famille, niveau 1 à 3
export const badgesFamille = (f: Famille): Badge[] => f.seuils.map((seuil, i) => ({ id: `${f.id}-${i + 1}`, famille: f, niveau: i + 1, titre: `${f.role} ${NIVEAUX[i]}`, mot: f.mots[i], seuil }));
export const TOUS_BADGES = FAMILLES.flatMap(badgesFamille);

// Niveau atteint dans une famille (0 si aucun badge)
export const niveauFamille = (f: Famille, s: Stats) => f.seuils.filter(n => f.cle(s) >= n).length;
export const badgesObtenus = (s: Stats) => TOUS_BADGES.filter(b => b.famille.cle(s) >= b.seuil);

// Statistiques cumulées : l'état pour ce qui est daté dans les données, le journal pour le reste (tri des offres, entretiens passés)
export function statistiques(candidatures: Candidature[], taches: Tache[], echanges: Echange[], periodes: any[], defisNotes: string[] = []): Stats {
  const somme = (c: string) => periodes.reduce((n, p) => n + (p[c] ?? 0), 0);
  const defis: Record<string, number> = {};
  for (const d of Object.values(DEFIS)) if (d.manuel) defis[d.id] = taches.filter(t => t.faite && t.titre === PREFIXE_DEFI + d.titre).length;
  // NOTE: un défi réussi est une paire jour + défi : les défis manuels se retrouvent aussi dans les tâches, les automatiques viennent de la mémoire du navigateur
  const reussis = new Set(defisNotes);
  for (const t of taches) if (t.faite && t.titre.startsWith(PREFIXE_DEFI)) for (const d of Object.values(DEFIS)) if (d.manuel && t.titre === PREFIXE_DEFI + d.titre) reussis.add(`${t.creee}:${d.id}`);
  const quotas = quotasTenus(candidatures);
  const parStatut = (s: string) => candidatures.filter(c => c.statut === s).length;
  return {
    envoyees: candidatures.filter(estEnvoyee).length,
    echanges: echanges.length,
    triees: somme('offres_vues') + somme('offres_ecartees'),
    entretiens: Math.max(somme('entretiens'), parStatut('entretien') + parStatut('accepte')),
    refus: Math.max(somme('refus'), parStatut('refuse')),
    acceptees: parStatut('accepte'),
    semaines: semainesReussies(periodes),
    serie: serieRecord(periodes),
    joursQuota: quotas.jours,
    semainesQuota: quotas.semaines,
    defis,
    defisReussis: reussis.size,
  };
}
