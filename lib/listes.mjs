// ANCHOR: listes fermées du schéma, sans dépendance Node : partagées par lib/offres.mjs (validation du serveur) et l'interface (libellés)
export const CATEGORIES_OFFRE = ['formateur_digital', 'web_design', 'dev_web', 'comptabilite', 'autre'];
export const TYPES_FORMATION = ['diplome', 'titre_pro', 'certification'];
export const TYPES_EXPERIENCE = ['salarie', 'freelance', 'formateur', 'autre'];
// NOTE: métiers d'un CV par métier (lib/cv.mjs) et des intitulés d'une expérience (formulaire du Parcours, validation du serveur)
export const METIERS_CV = ['formateur_digital', 'web_design', 'dev_web', 'comptabilite'];
export const STATUTS_CANDIDATURE = ['a_faire', 'en_cours', 'entretien', 'sans_reponse', 'refuse', 'accepte', 'ecarte'];
// NOTE: couleur d'un contact (v14), reprise sur ses rendez-vous ; chaque valeur est le suffixe d'une variable CSS --c-<valeur> ; vide = aucune couleur
export const COULEURS_CONTACT = ['', 'violet', 'amber', 'orange', 'green', 'emerald', 'blue', 'red', 'pink', 'grey'];
export const INTERETS_CANDIDATURE = ['', 'important', 'fort', 'moyen', 'faible'];
// NOTE: projets du portfolio (v19) : nature du projet, et part de l'IA dans sa réalisation, renseignée par l'utilisateur (vide = non renseignée)
export const TYPES_PROJET = ['demo', 'education', 'client', 'perso'];
export const USAGES_IA = ['', 'aucune', 'assistee', 'deleguee'];
