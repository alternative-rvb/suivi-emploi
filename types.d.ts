// ANCHOR: types de données partagés par le serveur (JSDoc : @type {import('./types').Candidature}) et l'interface (import type)

export type Statut = 'a_faire' | 'en_cours' | 'entretien' | 'sans_reponse' | 'refuse' | 'accepte' | 'ecarte';
export type Interet = 'important' | 'fort' | 'moyen' | 'faible' | '';
export type ModeEnvoi = 'formulaire' | 'email' | 'telephone' | 'autre' | '';
export type CategorieOffre = 'comptabilite' | 'formateur_digital' | 'web_design' | 'dev_web' | 'autre';

export interface Lieu {
  id: string;
  nom: string;
  adresse: string;
  lon: number | null;
  lat: number | null;
  jours: number;
  peage: number;
}

export interface Candidature {
  id: string;
  entreprise: string;
  poste: string;
  description: string;
  statut: Statut | '';
  raison: string;
  date: string;
  plateforme: string;
  interet: Interet;
  notes: string;
  offre_id: string | null;
  mode_envoi: ModeEnvoi;
  cv: string;
  lettre: boolean;
  lieux: Lieu[];
  lien: string;
  /** enseignements tirés de la réponse (refus, silence, entretien), texte libre, v29 */
  enseignements?: string;
}

export interface Tache {
  id: string;
  candidature_id: string | null;
  titre: string;
  echeance: string;
  faite: boolean;
  creee: string;
}

export interface Echange {
  id: string;
  candidature_id: string;
  date: string;
  heure: string;
  canal: string;
  sens: string;
  resume: string;
}

// ANCHOR: contact (schéma v11), relié aux offres par contact_offres ; au moins un prénom ou un nom
export interface Contact {
  id: string;
  prenom: string;
  nom: string;
  fonction: string;
  entreprise: string;
  adresse: string;
  telephone: string;
  email: string;
  note: string;
  cree: string;
  // NOTE: couleur du contact (v14), suffixe de --c-<couleur>, vide = aucune
  couleur: string;
  // NOTE: contact épinglé (v15), remonté en tête de la liste
  epingle: boolean;
  // NOTE: téléphone ou email impossible à obtenir (v18), saisie bloquée et manque non signalé
  sans_telephone: boolean;
  sans_email: boolean;
  offres: string[];
  // NOTE: contact relié directement à une candidature (v13), sans passer par une offre
  candidatures: string[];
}

// Google Agenda (ligne 120) : état de la connexion et calendrier choisi (kv agenda), événements réduits par lib/agenda/google.mjs
export interface EtatAgenda {
  configure: boolean;
  connecte: boolean;
  depuis: string;
  calendrier_id: string;
  calendrier_nom: string;
}

export interface CalendrierGoogle {
  id: string;
  nom: string;
  principal: boolean;
  couleur: string;
  fuseau: string;
}

// NOTE: debut et fin en RFC 3339 (AAAA-MM-JJ seul pour un événement sur la journée), suivi = id du RDV local s'il a été créé par l'app
export interface EvenementAgenda {
  id: string;
  titre: string;
  debut: string;
  fin: string;
  journee: boolean;
  lieu: string;
  visio: string;
  lien: string;
  statut: string;
  suivi: string;
  // NOTE: id du rendez-vous local rattaché (par suivi ou google_id), null pour un événement externe (ligne 121)
  rdv?: string | null;
}

// ANCHOR: rendez-vous (schéma v11) : debut AAAA-MM-JJTHH:MM en heure de Paris, duree en minutes ; google_id et synchro sont gérés par le serveur
export type TypeRdv = 'telephone' | 'visio' | 'sur_place' | 'autre';
export type SynchroRdv = 'ok' | 'a_envoyer' | 'erreur' | 'annule';
export interface RendezVous {
  id: string;
  titre: string;
  debut: string;
  duree: number;
  type: TypeRdv;
  lieu: string;
  lien_visio: string;
  note: string;
  offre_id: string | null;
  candidature_id: string | null;
  contact_id: string | null;
  google_id: string | null;
  synchro: SynchroRdv;
  cree: string;
}
export type RendezVousSaisie = Partial<Pick<RendezVous, 'titre' | 'debut' | 'duree' | 'type' | 'lieu' | 'lien_visio' | 'note' | 'offre_id' | 'candidature_id' | 'contact_id'>>;

// Parcours du Profil (schéma v7) : niveaux de 0 à 5 ou null (non noté), mois au format AAAA-MM, fin vide = en cours
export type TypeFormation = 'diplome' | 'titre_pro' | 'certification';
export type TypeExperience = 'salarie' | 'freelance' | 'formateur' | 'autre';

export interface Competence {
  id: string;
  domaine: string;
  competence: string;
  enseigner: number | null;
  executer: number | null;
  note: string;
  valide: boolean;
  ordre?: number;
  poids?: Partial<Record<'comptabilite' | 'formateur_digital' | 'web_design' | 'dev_web', number>>;
}

export interface Formation {
  id: string;
  type: TypeFormation;
  titre: string;
  etablissement: string;
  /** Ville et département de l'établissement (texte libre, ex. Marseille (13)) */
  lieu?: string;
  /** AAAA ou AAAA-MM, vide = non renseigné (schéma v10) */
  debut: string;
  /** AAAA ou AAAA-MM ; vide avec un début = en cours, seule = année d'obtention */
  fin: string;
  /** NOTE: anciennes matières en texte libre, à reclasser (schéma v9) */
  matieres: string;
  note: string;
  ordre?: number;
  /** compétences enseignées (formation_competences), titres enseignés seulement */
  competences?: string[];
}

export interface Experience {
  id: string;
  poste: string;
  employeur: string;
  lieu: string;
  type: TypeExperience;
  categorie: CategorieOffre;
  debut: string;
  fin: string;
  description: string;
  ordre?: number;
  competences: string[];
  /** Intitulé du poste dans un CV par métier ou sur mesure (vide = poste) */
  intitules?: Partial<Record<'comptabilite' | 'formateur_digital' | 'web_design' | 'dev_web', string>>;
  /** Poids de 0 à 3 par puce (clé : texte normalisé de la puce) et par métier, lu par le tri des puces */
  poids?: Record<string, Partial<Record<'comptabilite' | 'formateur_digital' | 'web_design' | 'dev_web', number>>>;
}

export type TypeProjet = 'demo' | 'education' | 'client' | 'perso';
export type UsageIa = '' | 'aucune' | 'assistee' | 'deleguee';

// Projet du portfolio (schéma v19), relié aux compétences mobilisées ; usage de l'IA renseigné par l'utilisateur
export interface Projet {
  id: string;
  nom: string;
  url: string;
  type: TypeProjet;
  debut: string;
  ia: UsageIa;
  technologies: string;
  description: string;
  ordre?: number;
  competences: string[];
}

// Contact de l'entête du CV (schéma v8, kv profil), saisi dans Profil > CV
export interface ContactCv {
  nom: string; titre: string; adresse: string; code_postal: string; ville: string; telephone: string; email: string;
  site: string; linkedin: string; github: string; mention: string;
}

export interface ProfilCv {
  accroche: string;
  resume: string;
  // NOTE: accroche par cible (general et métiers), repli sur accroche quand elle est vide
  accroches?: Partial<Record<'general' | 'comptabilite' | 'formateur_digital' | 'web_design' | 'dev_web', string>>;
  // NOTE: titre sous le nom du CV par cible, repli sur contact.titre
  titres?: Partial<Record<'general' | 'comptabilite' | 'formateur_digital' | 'web_design' | 'dev_web', string>>;
  // NOTE: résumé du CV par cible, repli sur resume
  resumes?: Partial<Record<'general' | 'comptabilite' | 'formateur_digital' | 'web_design' | 'dev_web', string>>;
  // NOTE: variantes nommées (titre, accroche, résumé) par cible, proposées en liste déroulante dans l'onglet CV
  variantes?: Partial<Record<'titres' | 'accroches' | 'resumes', Partial<Record<'general' | 'comptabilite' | 'formateur_digital' | 'web_design' | 'dev_web', { nom: string; texte: string }[]>>>>;
  contact?: Partial<ContactCv>;
}

export type CibleCv = 'general' | 'metier' | 'offre';

// Document composé par lib/cv.mjs (composerCv), seule forme acceptée par POST /api/cv/pdf
export interface CvDocument {
  cible: CibleCv; categorie: string; offre_id: string; libelle: string;
  entete: ContactCv; accroche: string; resume: string;
  experiences: { ids: string[]; poste: string; employeur: string; lieu: string; debut: string; fin: string; periode: string; puces: string[]; missions: { id: string; employeur: string; lieu: string; poste: string; periode: string }[]; condensee: boolean }[];
  formation: { id: string; titre: string; etablissement: string; lieu?: string; annees: string; note: string }[];
  titres_prepares: string[];
  competences: { domaine: string; liste: string[] }[];
  langues: { langue: string; niveau: string }[];
}

export type StatutFait = 'ok' | 'partiel' | 'profil' | 'absent';
export interface ControleCv {
  disponible: boolean;
  faits: { rubrique: string; element: string; valeur: string; statut: StatutFait }[];
  ecarts: number;
  avertissements: number;
}

export interface CvReference { id: string; fichier: string; importe_le: string; pages: number; caracteres: number }

export interface CvVersion {
  id: string; nom: string; cible: CibleCv; categorie: string; offre_id: string; candidature_id: string;
  reference_id: string; cree_le: string; ecarts: number; avertissements: number;
}

// ANCHOR: lettre de motivation (schéma v23), forme de lib/lettre.mjs et des routes /api/lettre
export type BlocLettre = 'vous' | 'moi' | 'faible' | 'nous' | 'conclusion';
export type OrigineLettre = 'qwen' | 'utilisateur' | 'claude';
export interface LettreMatrice {
  ton: 'sobre' | 'chaleureux' | 'dynamique'; mots: number; competences: string[];
  blocs: Record<BlocLettre, { actif: boolean; consigne: string }>;
}
export type MetierLettre = 'formateur_digital' | 'web_design' | 'dev_web' | 'comptabilite';
/** bibliothèque de style (kv lettre_style) : angles d'accroche (metiers vide = tous) et formules à éviter, sans accents */
export interface LettreStyle { angles: { id: string; nom: string; consigne: string; metiers: MetierLettre[] }[]; eviter: string[] }
export interface LettreBrouillon {
  cle: string; offre_id: string | null; candidature_id: string | null; objet: string; destinataire: string; texte: string;
  matrice: LettreMatrice; origine: OrigineLettre; maj_le: string;
  /** trace de la dernière génération du texte (vide si jamais généré) : modèle, durée, déclencheur (auto = préparée à l'arrivée depuis l'offre, bouton = Rédiger, reecriture = Claude) et date */
  generation: { modele?: string; duree_ms?: number; declencheur?: 'auto' | 'bouton' | 'reecriture'; le?: string };
}
export interface ControleLettre {
  faits: { fait: string; statut: StatutFait | 'offre' }[];
  conseils: { code: string; message: string }[];
  mots: number; ecarts: number; avertissements: number;
}
export interface LettreVersion {
  id: string; nom: string; offre_id: string | null; candidature_id: string | null; cree_le: string; ecarts: number; avertissements: number;
}

export interface Offre {
  id_offre: string;
  titre: string;
  entreprise: string | null;
  lieu: string | null;
  departement: string | null;
  ville: string | null;
  proche: boolean;
  contrat: string | null;
  salaire: string | null;
  lien: string | null;
  date_detection: string | null;
  categorie: CategorieOffre;
  ignoree: boolean;
  vue: boolean;
  expiree: boolean;
  /** épingle active (14 jours à partir de epinglee_le), jours_epingle = jours restants */
  epinglee: boolean;
  epinglee_le: string;
  jours_epingle: number | null;
  source: string;
  postuler_via: string;
  description: string;
  annonce: string;
  // Ajoutés par GET /api/offres
  candidature_id?: string | null;
  analyse?: Record<string, any> | null;
}

export interface PointDepart {
  nom: string;
  adresse: string;
  trouve: string;
  lon: number;
  lat: number;
}

export interface Trajets {
  departs: PointDepart[];
  carburant: string;
  prix_litre: number;
  conso_100: number;
  peage_jour: number;
  jours_defaut: number;
  attente_annuelle: number;
  tjm: number;
  peage_km: number;
}

export interface Reglages {
  zones: string[];
  mots_cles: string[];
  mots_exclus: string[];
  contrats_exclus: string[];
  entreprises: string[];
}

// ANCHOR: analyses ponctuelles du modèle (ligne 86), schémas et contrôles dans lib/analyse/synthese.mjs
export interface ProfilIa {
  titre: string;
  correspond: string;
  seniorite: 'debutant' | 'confirme' | 'senior' | 'expert' | '';
  synthese: string;
  points_attention: string[];
  points_forts: { point: string; preuve: string }[];
  points_ecartes: number;
  metiers: { categorie: CategorieOffre; intitule: string }[];
  mots_cles: string[];
}
export interface SuggestionVeille { valeur: string; raison: string }
export type VeilleIa = Record<'mots_cles' | 'zones' | 'entreprises' | 'mots_exclus', SuggestionVeille[]>;
export interface EtatSynthese<T> {
  resultat: T | null;
  enCours: boolean;
  erreur: string | null;
  date?: string;
  modele?: string;
  duree_ms?: number;
  a_jour?: boolean;
}
export interface Syntheses {
  actif: boolean;
  erreur?: string;
  modele?: string;
  profil: EtatSynthese<ProfilIa>;
  veille: EtatSynthese<VeilleIa>;
}

// ANCHOR: compétences demandées par une annonce, relevées par le modèle local ; le statut est calculé contre le Profil du moment, jamais stocké
export type StatutCompetenceOffre = 'profil' | 'proche' | 'absente' | 'ignoree';
export interface CompetenceOffre {
  valeur: string;
  citation: string;
  domaine: string;
  statut: StatutCompetenceOffre;
  competence_id?: string;
  competence?: string;
}
export interface CompetencesOffre {
  extrait: boolean;
  enCours: boolean;
  erreur: string | null;
  code: string | null;
  date: string | null;
  items: CompetenceOffre[];
}
