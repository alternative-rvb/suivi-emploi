import type { Contact } from '../../types.js';

// ANCHOR: utilitaires des contacts (ligne 119), partagés par l'onglet Contacts et le bloc des contacts liés
export { EMAIL, TELEPHONE } from '../../lib/texte.mjs';
import { EMAIL as EMAIL_VALIDE, TELEPHONE as TEL_VALIDE } from '../../lib/texte.mjs';
import { norm } from '../../lib/texte.mjs';

import { COULEURS_CONTACT } from '../../lib/listes.mjs';

// NOTE: couleurs proposées pour un contact (valeurs de lib/listes.mjs, seuls les libellés vivent ici) ; la valeur est le suffixe de la variable CSS --c-<valeur>
const LIBELLES_COULEUR: Record<string, string> = { violet: 'Violet', amber: 'Ambre', orange: 'Orange', green: 'Vert', emerald: 'Émeraude', blue: 'Bleu', red: 'Rouge', pink: 'Rose', grey: 'Gris' };
export const COULEURS: { valeur: string; libelle: string }[] = COULEURS_CONTACT.filter(Boolean).map(v => ({ valeur: v, libelle: LIBELLES_COULEUR[v] ?? v }));
// NOTE: valeur CSS d'une couleur de contact, undefined sans couleur
export const cssCouleur = (c?: string) => (c ? `var(--c-${c})` : undefined);

export const nomContact = (k: Pick<Contact, 'prenom' | 'nom'>) => [k.prenom, k.nom].filter(Boolean).join(' ') || 'Sans nom';

// NOTE: libellé unique d'un contact dans une liste de suggestions (l'entreprise départage les homonymes)
export const libelleContact = (k: Contact) => nomContact(k) + (k.entreprise ? ` (${k.entreprise})` : '');

export const libelleOffre = o => `${o.entreprise || 'Employeur non indiqué'} · ${o.titre} (${o.id_offre})`;

// NOTE: comparaison d'entreprises sans casse, accents ni forme juridique, pour proposer d'abord les contacts du même employeur
export const simplifier = (s: string) => norm(s).replace(/\b(sas|sarl|sa|eurl|sasu|sci|scop)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const memeEntreprise = (a: string, b: string) => Boolean(simplifier(a)) && simplifier(a) === simplifier(b);

export const telLien = (t: string) => 'tel:' + t.replace(/[^\d+]/g, '');

// ANCHOR: contrôle qualité d'une fiche contact (ligne 138) : calculé à l'affichage, jamais stocké ni bloquant
export type AlerteContact = { niveau: 'avertissement' | 'info'; message: string };
export const avertissementsContact = (k: Contact): AlerteContact[] => {
  const a: AlerteContact[] = [];
  if (!k.prenom && !k.nom) a.push({ niveau: 'avertissement', message: 'Aucun nom.' });
  else if (!k.prenom || !k.nom) a.push({ niveau: 'avertissement', message: k.prenom ? 'Nom de famille absent.' : 'Prénom absent.' });
  if (!k.prenom && k.nom === 'Nouveau contact') a.push({ niveau: 'avertissement', message: 'Nom par défaut à remplacer.' });
  if (!k.email && !k.telephone && !(k.sans_telephone && k.sans_email)) a.push({ niveau: 'avertissement', message: 'Ni email ni téléphone : contact impossible à joindre.' });
  if (k.email && !EMAIL_VALIDE.test(k.email)) a.push({ niveau: 'avertissement', message: 'Adresse email invalide.' });
  if (k.telephone && !TEL_VALIDE.test(k.telephone)) a.push({ niveau: 'avertissement', message: 'Numéro de téléphone invalide.' });
  if (!k.fonction) a.push({ niveau: 'info', message: 'Fonction non précisée.' });
  if (!k.entreprise) a.push({ niveau: 'info', message: 'Société non précisée.' });
  if (k.offres.length + k.candidatures.length === 0) a.push({ niveau: 'info', message: 'Aucune offre ni candidature liée.' });
  return a;
};
export const aCompleter = (k: Contact) => avertissementsContact(k).some(x => x.niveau === 'avertissement');
