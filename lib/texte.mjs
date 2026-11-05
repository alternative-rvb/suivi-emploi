// ANCHOR: comparaison de textes partagée par lib/ et l'interface (client/src/utils.ts la réexporte)

/** Minuscules sans accents, pour comparer des intitulés. @param {any} s @returns {string} */
export const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ANCHOR: formats des coordonnées d'un contact (ligne 119), contrôlés par le serveur et par la fiche contact
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TELEPHONE = /^\+?[\d .-]{6,20}$/;
