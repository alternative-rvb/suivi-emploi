// Questions posées au modèle pour chaque annonce, et note calculée par le code à partir des réponses.
// ANCHOR: le modèle ne donne jamais de note. Il répond à des questions fermées (niveau du poste, diplôme exigé, années demandées...),
// chaque réponse chiffrée doit citer l'annonce, et le code vérifie la citation puis calcule la note. Les poids de POIDS sont à ajuster
// au fil de l'usage : la note est recalculée à la lecture, sans refaire d'appel au modèle.
import { ErreurSync } from '../erreurs.mjs';
import { norm } from '../offres.mjs';

// NOTE: à incrémenter dès que SCHEMA ou la consigne change, les analyses d'une version plus ancienne sont refaites
export const VERSION_CONSIGNE = 2;

const FAMILLES = ['comptabilite', 'formation', 'web_design', 'dev_web', 'autre'];
const NIVEAUX = ['junior', 'assistant', 'confirme', 'responsable', 'inconnu'];
const TELETRAVAIL = ['oui', 'partiel', 'non', 'inconnu'];

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    famille: { type: 'string', enum: FAMILLES },
    niveau: { type: 'string', enum: NIVEAUX },
    diplome_exige: { type: 'boolean' },
    diplome_citation: { type: 'string' },
    experience_annees: { type: 'integer' },
    experience_citation: { type: 'string' },
    cabinet: { type: 'boolean' },
    teletravail: { type: 'string', enum: TELETRAVAIL },
    salaire_cite: { type: 'string' },
    logiciels: { type: 'array', items: { type: 'string' } },
    resume: { type: 'string' },
  },
  required: ['famille', 'niveau', 'diplome_exige', 'diplome_citation', 'experience_annees', 'experience_citation', 'cabinet', 'teletravail', 'salaire_cite', 'logiciels', 'resume'],
};

// Profil en texte pour la consigne : compétences par domaine (niveau 3 ou plus en clair, le reste en notions), puis intitulés des titres
export function construireProfil(skills = [], titres = []) {
  const domaines = new Map();
  for (const s of skills) {
    const niveau = Math.max(s.enseigner ?? 0, s.executer ?? 0);
    const d = domaines.get(s.domaine) ?? { solides: [], notions: [] };
    const note = s.note && /avant|depuis|\d{4}/i.test(s.note) ? ` (${s.note.slice(0, 60)})` : '';
    (niveau >= 3 ? d.solides : d.notions).push(s.competence + note);
    domaines.set(s.domaine, d);
  }
  const lignes = [...domaines].map(([nom, d]) => `- ${nom} : ${d.solides.join(', ') || 'aucune compétence solide'}${d.notions.length ? `. Notions : ${d.notions.join(', ')}` : ''}`);
  // NOTE: un titre_pro est un titre que l'utilisateur prépare en tant que formateur, jamais un diplôme qu'il détient
  const intitules = type => titres.filter(t => (t.type === 'titre_pro') === (type === 'titre_pro') && t.titre).map(t => t.titre).join(' ; ');
  const enseignes = intitules('titre_pro');
  const obtenus = intitules('obtenu');
  return lignes.join('\n') + (obtenus ? `\nDiplômes et certifications obtenus : ${obtenus}` : '') + (enseignes ? `\nTitres enseignés en tant que formateur (non détenus) : ${enseignes}` : '');
}

export const construireConsigne = profil => `Tu lis une annonce d'emploi et tu réponds à des questions factuelles, en JSON. Tu ne juges pas l'adéquation avec un profil : ton rôle est d'extraire ce que dit l'annonce.

Règles :
- N'invente rien. Si l'annonce ne le dit pas, mets false, 0, "inconnu" ou une chaîne vide.
- Les champs diplome_citation, experience_citation et salaire_cite recopient mot pour mot un passage de l'annonce, sans le reformuler.
- diplome_exige vaut true seulement si l'annonce impose un diplôme ou un niveau d'études (BTS, DCG, Bac+2...). "Idéalement", "un plus", "ou expérience équivalente", "ou autodidacte" ou "diplômé ou non" donnent false, même si un niveau d'études figure dans l'en-tête de l'annonce.
- experience_annees : nombre d'années d'expérience exigées, 0 si l'annonce n'en demande pas. L'en-tête compte ("expérience 3 ans", "plus de 4 ans d'expérience").
- cabinet vaut true si le poste est en cabinet d'expertise comptable.
- niveau : junior (débutant accepté), assistant, confirme (expérience demandée, autonomie), responsable (encadrement, direction) ou inconnu.
- famille : comptabilite, formation (formateur, chargé de formation, conseiller formation), web_design, dev_web ou autre.
- logiciels : uniquement des logiciels, langages ou technologies de travail écrits mot pour mot dans l'annonce. N'en ajoute aucun qui n'y figure pas. Jamais des avantages, services ou marques d'employeur (tickets restaurant, mutuelle, primes, offre collaborateur). Liste vide si l'annonce n'en cite aucun.
- resume : une phrase en français sur les missions et la technologie du poste, sans reprendre les avantages ni la rémunération.

Contexte, uniquement pour t'aider à reconnaître les logiciels et le vocabulaire du métier de la personne qui lit tes réponses :
${profil}`;

export const construireMessage = o => `Titre : ${o.titre}\nEntreprise : ${o.entreprise ?? ''}\nLieu : ${o.lieu ?? ''}\nContrat : ${o.contrat ?? ''}\n\n${(o.annonce ?? '').slice(0, 6000)}`;

// Comparaison tolérante (casse, accents, espaces) pour vérifier qu'une citation figure bien dans l'annonce
export const compact = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
export const citee = (annonce, citation) => {
  const c = compact(citation);
  return c.length >= 4 && compact(annonce).includes(c);
};

// NOTE: une citation censée prouver un diplôme doit en parler (le modèle recopie parfois une autre phrase de l'annonce)
const MOT_DIPLOME = /\b(bac|bts|dut|but|dcg|dscg|dec|licence|master|bachelor|cap|bep|diplome|titre|formation|niveau d etudes|ingenieur)\b/;

const AUTODIDACTE = /\b(autodidactes?|equivalente?s?|equivalence)\b/;

const choix = (v, valeurs, defaut) => (valeurs.includes(v) ? v : defaut);
/**
 * Résumé propre : reste entier jusqu'à `max` caractères, sinon coupé à la dernière phrase complète, à défaut au dernier mot suivi de « ... ».
 * Un résumé déjà tronqué en base (ancienne limite à 400 caractères) est aussi nettoyé à la lecture.
 */
export function terminerResume(v, max = 600) {
  const t = typeof v === 'string' ? v.trim() : '';
  const fini = /[.!?)»]$/.test(t);
  if (t.length <= max && fini) return t;
  if (!t) return '';
  const base = t.length > max ? t.slice(0, max) : t;
  // NOTE: fenêtre d'un caractère de plus que `max` pour garder une phrase finie exactement à la limite (le point est suivi d'une espace)
  const fenetre = t.length > max ? t.slice(0, max + 1) : base;
  const phrase = Math.max(fenetre.lastIndexOf('. '), fenetre.lastIndexOf('! '), fenetre.lastIndexOf('? '));
  if (phrase > 40) return base.slice(0, phrase + 1);
  if (fini) return base;
  const mot = base.lastIndexOf(' ');
  return `${(mot > 40 ? base.slice(0, mot) : base).replace(/[,;:\s]+$/, '')}...`;
}

const texte = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Contrôle et normalise la réponse du modèle. Une citation introuvable dans l'annonce invalide la valeur chiffrée correspondante.
export function validerReponses(brut, annonce) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) throw new ErreurSync('format', 'Réponse du modèle illisible (objet JSON attendu).');
  const r = {
    famille: choix(brut.famille, FAMILLES, 'autre'),
    niveau: choix(brut.niveau, NIVEAUX, 'inconnu'),
    diplome_exige: brut.diplome_exige === true,
    diplome_citation: texte(brut.diplome_citation),
    experience_annees: Math.min(40, Math.max(0, Math.round(Number(brut.experience_annees) || 0))),
    experience_citation: texte(brut.experience_citation),
    cabinet: brut.cabinet === true,
    teletravail: choix(brut.teletravail, TELETRAVAIL, 'inconnu'),
    salaire_cite: texte(brut.salaire_cite),
    // NOTE: un logiciel que l'annonce ne cite pas est une invention du modèle (il recopie parfois les exemples de la consigne)
    logiciels: Array.isArray(brut.logiciels) ? brut.logiciels.map(x => texte(x, 60)).filter(x => x && ` ${compact(annonce)} `.includes(` ${compact(x)} `)).slice(0, 12) : [],
    resume: terminerResume(brut.resume),
  };
  r.verifie = {
    // NOTE: « ou autodidacte » dans la citation lève l'exigence, quoi qu'ait répondu le modèle
    diplome: r.diplome_exige && citee(annonce, r.diplome_citation) && MOT_DIPLOME.test(compact(r.diplome_citation)) && !AUTODIDACTE.test(compact(r.diplome_citation)),
    experience: r.experience_annees > 0 && citee(annonce, r.experience_citation),
    salaire: !!r.salaire_cite && citee(annonce, r.salaire_cite),
  };
  if (!r.verifie.salaire) r.salaire_cite = '';
  return r;
}

// ANCHOR: poids de la note, à ajuster. Départ à BASE, chaque règle ajoute ou retire des points, résultat borné entre 0 et 100.
export const POIDS = {
  base: 60,
  niveau: { junior: 10, assistant: 10, confirme: 0, responsable: -25, inconnu: 0 },
  diplome: -15,
  anneesSansPenalite: 3,
  parAnneeSupplementaire: -5,
  experienceMax: -25,
  cabinet: -10,
  teletravail: { oui: 5, partiel: 3, non: 0, inconnu: 0 },
};

// NOTE: anneesProfil (années du parcours dans la catégorie de l'offre) relève le seuil sans pénalité : demander 5 ans à qui en a 9 ne coûte rien
export function noter(r, /** @type {{ anneesProfil?: number }} */ { anneesProfil = 0 } = {}) {
  if (!r) return null;
  const details = [];
  const ajouter = (libelle, points) => { if (points) details.push({ libelle, points }); };
  ajouter(`Poste de niveau ${r.niveau}`, POIDS.niveau[r.niveau] ?? 0);
  if (r.verifie?.diplome) ajouter('Diplôme exigé', POIDS.diplome);
  if (r.verifie?.experience) {
    const exces = Math.max(0, r.experience_annees - Math.max(POIDS.anneesSansPenalite, anneesProfil));
    const parcours = anneesProfil > 0 ? `, ${String(anneesProfil).replace('.', ',')} an${anneesProfil >= 2 ? 's' : ''} dans votre parcours` : '';
    const points = exces ? Math.max(POIDS.experienceMax, exces * POIDS.parAnneeSupplementaire) : 0;
    // NOTE: l'exigence reste listée dans le détail même couverte par le parcours (0 point), pour que la note s'explique
    if (points || parcours) details.push({ libelle: `${r.experience_annees} ans d'expérience demandés${parcours}`, points });
  }
  if (r.cabinet) ajouter('Cabinet d\'expertise comptable', POIDS.cabinet);
  ajouter(`Télétravail : ${r.teletravail}`, POIDS.teletravail[r.teletravail] ?? 0);
  const note = Math.max(0, Math.min(100, POIDS.base + details.reduce((t, d) => t + d.points, 0)));
  return { note, base: POIDS.base, details };
}
