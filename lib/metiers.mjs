// ANCHOR: catalogue neutre des métiers (ligne 260), pur et sans dépendance Node : partagé par le serveur, le classement des offres et l'interface.
// Chaque profil choisit sa liste dans ce catalogue (réglage « metiers », lib/metiers-profil.mjs) ; l'ordre de sa liste donne le poids du score, rien n'est priorisé ici.
// NOTE: l'ordre du catalogue est celui des colonnes par métier (intitulés, poids des puces) ; le classement d'un intitulé suit ORDRE_CLASSEMENT (le premier qui correspond l'emporte)

/**
 * @typedef {{ cle: string, libelle: string, titre: string, couleur: string, rome: string, motifs: RegExp, refus?: (t: string) => boolean, preuve?: boolean, niveau_min?: number }} Metier
 */

const FORMATION_NUMERIQUE = /numerique|digital|web|\bia\b|intelligence|bureautique|informatique|multimedia|linux|no-code|graphisme|design|devops|docker|automatisation|prompt|e-learning|learning|pedagogique|formation/;

/** @type {Metier[]} */
export const CATALOGUE = [
  { cle: 'formateur_digital', libelle: 'Formateur digital', titre: 'Formateur digital', couleur: 'violet', rome: 'K2111',
    motifs: /formateur|formatrice|concepteur pedagogique|ingenieur pedagogique|digital learning|e-learning|charge(e)? de formation|responsable pedagogique|coord\w*nat\w*.{0,20}pedagogi|coordination pedagogi|projet pedagogi|conseill\w*( \w+)* (en )?formation|referent pedagogique/,
    refus: t => /formateur|formatrice/.test(t) && !FORMATION_NUMERIQUE.test(t) },
  { cle: 'web_design', libelle: 'Web design', titre: 'Web designer', couleur: 'pink', rome: 'E1205', preuve: true,
    motifs: /web ?design|graphiste|\bux\b|\bui\b|infographiste|maquettiste|\bpao\b|directeur artistique/ },
  { cle: 'dev_web', libelle: 'Développement web', titre: 'Développeur web', couleur: 'blue', rome: 'M1805', preuve: true,
    motifs: /developpeu|integrateur|webmaster|full ?stack|front ?end|back ?end|wordpress|webflow|chef de projet (web|digital)|concepteur.*site/,
    refus: t => /\bjava\b|c\+\+|\bc#|\.net|embarque|\bsap\b|cobol|salesforce|mainframe|\bdevops\b|data engineer|android|\bios\b/.test(t) },
  { cle: 'comptabilite', libelle: 'Comptabilité', titre: 'Comptable', couleur: 'emerald', rome: 'M1203', niveau_min: 2,
    motifs: /comptab|\bcompta\b/ },
  { cle: 'marketing_digital', libelle: 'Marketing digital', titre: 'Chargé de marketing digital', couleur: 'orange', rome: 'M1705',
    motifs: /marketing|community manager|social media|reseaux sociaux|\bseo\b|\bsea\b|charge(e)? de communication|traffic manager|growth/ },
  { cle: 'ressources_humaines', libelle: 'Ressources humaines', titre: 'Chargé de ressources humaines', couleur: 'amber', rome: 'M1502',
    motifs: /ressources humaines|\brh\b|recrut|charge(e)? de recrutement|talent acquisition|gestionnaire (de )?paie|\bpaie\b/ },
  { cle: 'commercial', libelle: 'Commercial', titre: 'Commercial', couleur: 'red', rome: 'D1402',
    motifs: /commercia|vendeu|business developer|charge(e)? d.affaires|conseiller (de |en )?vente|technico.commercial|account manager/ },
  { cle: 'assistanat', libelle: 'Assistanat administratif', titre: 'Assistant administratif', couleur: 'green', rome: 'M1607',
    motifs: /assistant(e)? (administrati|de direction|de gestion|polyvalent)|secretaire|agent administratif|employe(e)? administratif|accueil/ },
  { cle: 'logistique', libelle: 'Logistique', titre: 'Agent logistique', couleur: 'grey', rome: 'N1103',
    motifs: /logisti|magasinier|preparateur de commandes|cariste|supply chain|approvisionn/ },
];

export const CLES_METIERS = CATALOGUE.map(m => m.cle);
// NOTE: ordre du classement : les quatre premiers métiers gardent l'ordre historique (une offre « formateur développeur web » reste en développement web), les autres suivent
export const ORDRE_CLASSEMENT = ['comptabilite', 'web_design', 'dev_web', 'formateur_digital', 'ressources_humaines', 'marketing_digital', 'commercial', 'assistanat', 'logistique'];
/** Catégories possibles d'une offre : un métier du catalogue, ou autre */
export const CATEGORIES_METIER = [...CLES_METIERS, 'autre'];
export const METIERS_MAX = 8;
// NOTE: poids du score de pertinence (client/src/score.ts) : 14 pour le premier métier de la liste du profil, un de moins à chaque rang, 8 au moins
export const POIDS_PREMIER = 14;
export const poidsMetier = (/** @type {string[]} */ liste, /** @type {string} */ cle) => { const i = liste.indexOf(cle); return i < 0 ? 0 : Math.max(8, POIDS_PREMIER - i); };

const PAR_CLE = new Map(CATALOGUE.map(m => [m.cle, m]));
/** @returns {Metier | undefined} */
export const metier = (/** @type {string} */ cle) => PAR_CLE.get(cle);
export const libelleMetier = (/** @type {string} */ cle, /** @type {MetierPerso[]} */ perso = []) => metierDe(cle, perso)?.libelle ?? (cle === 'autre' ? 'Autre' : cle);

// SECTION: métiers créés par un profil (ligne 266), réglage « metiers_perso » : reconnus par des mots du titre des annonces, propres au profil
/**
 * @typedef {{ cle: string, libelle: string, titre: string, mots: string[], exclus: string[], rome: string, couleur: string }} MetierPerso
 */
export const PERSO_MAX = 20;
export const MOTS_MAX = 15;
export const COULEURS_METIER = ['violet', 'pink', 'blue', 'emerald', 'orange', 'amber', 'red', 'green', 'grey'];
export const CLE_PERSO = /^perso_[a-z0-9]{6}$/;
/** Clé de métier admise dans les données (poids, intitulés, lettres) : métier du catalogue ou métier créé par un profil */
export const estCleMetier = (/** @type {unknown} */ c) => typeof c === 'string' && (PAR_CLE.has(c) || CLE_PERSO.test(c));
export const nouvelleCleMetier = () => 'perso_' + Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

/** Clés de métier d'un objet { métier: valeur } dans l'ordre canonique : catalogue d'abord, puis métiers créés par clé (même JSON pour une même saisie) */
export function clesMetierDe(/** @type {unknown} */ v) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return [];
  const rang = (/** @type {string} */ c) => { const i = CLES_METIERS.indexOf(c); return i < 0 ? CLES_METIERS.length : i; };
  return Object.keys(v).filter(estCleMetier).sort((a, b) => rang(a) - rang(b) || a.localeCompare(b));
}

/** Définition d'un métier, du catalogue ou créé par le profil ; undefined si inconnu */
export function metierDe(/** @type {string} */ cle, /** @type {MetierPerso[]} */ perso = []) {
  return PAR_CLE.get(cle) ?? perso.find(p => p.cle === cle);
}

const sansAccents = (/** @type {unknown} */ s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// NOTE: un mot cherché en début de mot du titre normalisé (« boulang » trouve boulanger et boulangère) ; caractères spéciaux échappés
const motif = (/** @type {string[]} */ mots) => (mots.length ? new RegExp(`(^|[^a-z0-9])(${mots.map(m => sansAccents(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`) : null);
const motifs = new WeakMap();
/** Le titre (normalisé ou non) correspond-il au métier créé par le profil ? */
export function correspondPerso(/** @type {MetierPerso} */ def, /** @type {string} */ titre) {
  let m = motifs.get(def);
  if (!m) { m = { oui: motif(def.mots), non: motif(def.exclus) }; motifs.set(def, m); }
  const t = sansAccents(titre);
  return Boolean(m.oui?.test(t)) && !m.non?.test(t);
}

/**
 * Contrôle et normalise la définition d'un métier créé par le profil ; lève une Error au message lisible
 * @param {any} d
 * @returns {MetierPerso}
 */
export function validerMetierPerso(d) {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new Error('Métier : objet attendu.');
  const texte = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const libelle = texte(d.libelle, 40);
  if (libelle.length < 2) throw new Error('Métier : nom de 2 caractères au moins.');
  const liste = (v, nom) => {
    if (v !== undefined && !Array.isArray(v)) throw new Error(`Métier ${libelle} : ${nom} en liste.`);
    const vus = new Set();
    return (v ?? []).map(x => texte(x, 40)).filter(x => sansAccents(x).length >= 2 && !vus.has(sansAccents(x)) && vus.add(sansAccents(x)));
  };
  const mots = liste(d.mots, 'mots à chercher');
  const exclus = liste(d.exclus, 'mots à exclure');
  if (!mots.length) throw new Error(`Métier ${libelle} : au moins un mot à chercher dans le titre des annonces.`);
  if (mots.length > MOTS_MAX || exclus.length > MOTS_MAX) throw new Error(`Métier ${libelle} : ${MOTS_MAX} mots au plus par liste.`);
  const rome = texte(d.rome, 5).toUpperCase();
  if (rome && !/^[A-N]\d{4}$/.test(rome)) throw new Error(`Métier ${libelle} : code ROME attendu sous la forme D1102.`);
  const cle = d.cle === undefined || d.cle === '' ? nouvelleCleMetier() : String(d.cle);
  if (!CLE_PERSO.test(cle)) throw new Error(`Métier ${libelle} : clé invalide.`);
  const couleur = COULEURS_METIER.includes(d.couleur) ? d.couleur : 'grey';
  return { cle, libelle, titre: texte(d.titre, 60) || libelle, mots, exclus, rome, couleur };
}

/** Contrôle la liste des métiers créés par le profil (20 au plus, noms et clés uniques) */
export function validerMetiersPerso(/** @type {unknown} */ d) {
  if (!Array.isArray(d)) throw new Error('Liste de métiers créés attendue.');
  if (d.length > PERSO_MAX) throw new Error(`${PERSO_MAX} métiers créés au plus.`);
  const liste = d.map(validerMetierPerso);
  const noms = new Set();
  for (const m of liste) {
    const n = sansAccents(m.libelle);
    if (noms.has(n) || CATALOGUE.some(c => sansAccents(c.libelle) === n)) throw new Error(`Métier ${m.libelle} : ce nom existe déjà.`);
    noms.add(n);
  }
  if (new Set(liste.map(m => m.cle)).size !== liste.length) throw new Error('Métiers créés : clé en double.');
  return liste;
}

/**
 * Catégorie d'une offre vue par un profil : le premier métier créé de sa liste dont les mots figurent dans le titre, sinon la catégorie commune vue par sa liste
 * @param {string} titre @param {string} categorie @param {string[]} liste @param {MetierPerso[]} [perso]
 */
export function classerProfil(titre, categorie, liste, perso = []) {
  for (const cle of liste) {
    const def = CLE_PERSO.test(cle) ? perso.find(p => p.cle === cle) : undefined;
    if (def && correspondPerso(def, titre)) return cle;
  }
  // NOTE: clé d'un métier créé puis supprimé (offre manuelle) : rangée dans autre
  if (CLE_PERSO.test(categorie) && !perso.some(p => p.cle === categorie)) return 'autre';
  return vueCategorie(categorie, liste);
}
// !SECTION

/** Catégorie vue par un profil : un métier de sa liste, sinon autre ; sans liste (profil qui n'a rien choisi), la catégorie commune telle quelle */
export const vueCategorie = (/** @type {string} */ categorie, /** @type {string[]} */ liste) => (!liste.length || liste.includes(categorie) ? categorie : 'autre');

/**
 * Contrôle une liste de métiers reçue de l'interface ; lève une Error au message lisible
 * @param {unknown} d
 * @param {MetierPerso[]} [perso] métiers créés par le profil, admis dans la liste
 * @returns {string[]}
 */
export function validerMetiers(d, perso = []) {
  if (!Array.isArray(d) || d.some(x => typeof x !== 'string')) throw new Error('Liste de clés de métiers attendue.');
  const liste = [...new Set(d)];
  const inconnus = liste.filter(c => !PAR_CLE.has(c) && !perso.some(p => p.cle === c));
  if (inconnus.length) throw new Error(`Métiers inconnus : ${inconnus.join(', ')} (catalogue : ${CLES_METIERS.join(', ')}).`);
  if (liste.length > METIERS_MAX) throw new Error(`${METIERS_MAX} métiers au plus.`);
  return liste;
}
