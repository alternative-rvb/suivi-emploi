// ANCHOR: métier d'une offre ou d'une candidature d'après son intitulé, pur et sans dépendance Node : partagé par lib/offres.mjs (synchro) et l'interface (bilan Recherche d'emploi)
import { norm } from './texte.mjs';

// NOTE: l'ordre compte, la première catégorie qui correspond l'emporte
/** @type {[string, RegExp][]} */
const CATEGORIES = [
  ['comptabilite', /comptab|\bcompta\b/],
  ['web_design', /web ?design|graphiste|\bux\b|\bui\b|infographiste|maquettiste|\bpao\b|directeur artistique/],
  ['dev_web', /developpeu|integrateur|webmaster|full ?stack|front ?end|back ?end|wordpress|webflow|chef de projet (web|digital)|concepteur.*site/],
  ['formateur_digital', /formateur|formatrice|concepteur pedagogique|ingenieur pedagogique|digital learning|e-learning|charge(e)? de formation|responsable pedagogique|coord\w*nat\w*.{0,20}pedagogi|coordination pedagogi|projet pedagogi|conseill\w*( \w+)* (en )?formation|referent pedagogique/],
];
const FORMATION_NUMERIQUE = /numerique|digital|web|\bia\b|intelligence|bureautique|informatique|multimedia|linux|no-code|graphisme|design|devops|docker|automatisation|prompt|e-learning|learning|pedagogique|formation/;

export function classer(titre) {
  const t = norm(titre);
  for (const [cat, re] of CATEGORIES) {
    if (!re.test(t)) continue;
    if (cat === 'dev_web' && /\bjava\b|c\+\+|\bc#|\.net|embarque|\bsap\b|cobol|salesforce|mainframe|\bdevops\b|data engineer|android|\bios\b/.test(t)) continue;
    if (cat === 'formateur_digital' && /formateur|formatrice/.test(t) && !FORMATION_NUMERIQUE.test(t)) continue;
    return cat;
  }
  return 'autre';
}
