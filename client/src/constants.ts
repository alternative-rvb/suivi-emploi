export const STATUTS = {
  a_faire: { label: 'À faire', color: 'var(--c-blue)' },
  en_cours: { label: 'En cours', color: 'var(--c-amber)' },
  entretien: { label: 'Entretien', color: 'var(--c-green)' },
  sans_reponse: { label: 'Sans réponse', color: 'var(--c-orange)' },
  refuse: { label: 'Refusé', color: 'var(--c-red)' },
  accepte: { label: 'Accepté', color: 'var(--c-emerald)' },
  ecarte: { label: 'Écarté', color: 'var(--c-grey)' },
};

// Statuts pour lesquels la plateforme d'envoi est attendue
export const SENT = ['en_cours', 'entretien', 'refuse', 'sans_reponse', 'accepte'];

export const INTERETS = {
  important: 'Intérêt important',
  fort: 'Fort intérêt',
  moyen: 'Intérêt moyen',
  faible: 'Faible intérêt',
};

export const PLATEFORMES = ['Indeed', 'LinkedIn', 'France Travail', 'HelloWork', 'Glassdoor', 'Malt', 'Email direct', 'Portail entreprise', 'Autre'];

export const RAISONS = [
  'Qualification ou diplôme demandé',
  'Prérequis métier non rempli',
  'Refus après entretien',
  'Refus sans motif précis',
  'Pas de réponse',
  'Offre hors profil',
  'Certification manquante',
  'Pas une vraie offre',
  'Offre expirée',
  'Autre',
];

export const CATEGORIES = {
  toutes: { label: 'Toutes', color: 'var(--c-grey)' },
  formateur_digital: { label: 'Formateur digital', color: 'var(--c-violet)' },
  web_design: { label: 'Web design', color: 'var(--c-pink)' },
  dev_web: { label: 'Développement web', color: 'var(--c-blue)' },
  comptabilite: { label: 'Comptabilité', color: 'var(--c-emerald)' },
  autre: { label: 'Autre', color: 'var(--c-grey)' },
};

export const MODES_ENVOI = {
  formulaire: 'Formulaire',
  email: 'Email',
  telephone: 'Téléphone',
  autre: 'Autre',
};

// ANCHOR: statuts d'une candidature encore en cours, partagés par la liste et le badge de l'onglet
export const ACTIFS = ['a_faire', 'en_cours', 'entretien'];

// NOTE: au-delà de ce nombre de kilomètres (aller simple), la distance et le coût s'affichent en rouge
export const KM_LONG_TRAJET = 60;

export const CANAUX = {
  email: 'Email',
  telephone: 'Téléphone',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  linkedin: 'LinkedIn',
  entretien: 'Entretien',
  plateforme: 'Plateforme',
  autre: 'Autre',
};

// Suggestions pour la provenance d'une offre saisie à la main et pour l'endroit où mène le bouton Postuler
export const SOURCES = ['Glassdoor', 'Indeed', 'LinkedIn', 'HelloWork', 'Meteojob', 'Site de l\'employeur', 'Réseau', 'Autre'];
export const POSTULER_VIA = ['France Travail', 'Meteojob', 'Site de l\'employeur', 'Indeed', 'HelloWork', 'LinkedIn', 'Glassdoor', 'Email', 'Autre site'];

// ANCHOR: délai de la tâche de relance créée à l'envoi d'une candidature
export const JOURS_RELANCE = 7;

// NOTE: codes de type de contrat de l'API France Travail
export const CONTRATS = { FRA: 'Franchise', STA: 'Stage', CDD: 'CDD', CDI: 'CDI', MIS: 'Intérim', SAI: 'Saisonnier', LIB: 'Profession libérale', TTI: 'Travail temporaire', DDI: 'CDD d\'insertion', DIN: 'CDI intérimaire', CCE: 'Profession commerciale', REP: 'Reprise d\'entreprise' };
