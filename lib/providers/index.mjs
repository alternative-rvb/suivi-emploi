// Registre des providers d'offres. Chaque source (webhook n8n, API France Travail en direct, autre site...) est un module de ce dossier.
//
// ANCHOR: contrat d'un provider (export par défaut)
//   id        identifiant court, utilisé dans SUIVI_PROVIDERS et dans le résultat de synchro
//   nom       libellé affiché dans les messages
//   secours   true : exécuté seulement si aucun provider principal n'a réussi
//   recuperer(ctx) : async, renvoie { date, offres, zones?, exclusions?, config?, couverture? } ou lève une ErreurSync typée
//     ctx.config : dernière configuration de veille mémorisée (kv veille : mots_cles, zones, mots_exclus...) ou null,
//                  copie locale que peut réutiliser un provider qui n'a pas la sienne (ex. API directe en secours de n8n)
//     date       horodatage de la source (texte affiché, facultatif)
//     offres     lignes au format de la table offres_emploi de la veille :
//                { id_offre, titre, entreprise, lieu: "83 - Villeneuve", type_de_contrat, salaire, lien,
//                  date_de_detection: "AAAA-MM-JJ", description: texte de l'annonce, plateforme: nom affiché (défaut "France Travail") }
//     zones      codes départements à garder (sinon ceux de ctx.config)
//     exclusions [{ type: "mot_intitule", valeur }] (sinon ceux de ctx.config)
//     config     mots_cles, entreprises, plateformes, contrats_exclus, mots_exclus : mémorisés pour l'onglet Profil
//     couverture { complete, ids, verifier } (facultatif) : seulement un provider qui liste TOUTES les offres en ligne de sa fenêtre (31 jours) ; ids = numéros reçus
//                avant filtrage local, complete = aucune recherche en échec ni tronquée. verifier(id) : contrôle unitaire (en_ligne, cloturee, inconnu) qui confirme chaque disparue avant marquage. Sert à marquer expirées les offres France Travail disparues.
//
// NOTE: id_offre doit rester unique entre providers. France Travail garde son identifiant brut (la même offre vue par n8n et en direct
// fusionne sans doublon), toute autre source préfixe le sien (ex. "wttj-1234").
//
// Ajouter un provider : créer lib/providers/<id>.mjs, l'importer ici, puis ajouter son id à SUIVI_PROVIDERS dans le .env.
import { ErreurSync } from '../erreurs.mjs';
import n8n from './n8n.mjs';
import franceTravail from './france-travail.mjs';

export const PROVIDERS = Object.fromEntries([n8n, franceTravail].map(p => [p.id, p]));

// SUIVI_PROVIDERS="france-travail,n8n" : liste des providers actifs, dans l'ordre d'exécution (défaut : france-travail principal, n8n en secours)
export function providersActifs(env = process.env) {
  const ids = (env.SUIVI_PROVIDERS ?? 'france-travail,n8n').split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) throw new ErreurSync('config', 'SUIVI_PROVIDERS est vide : indiquer au moins un provider.');
  return [...new Set(ids)].map(id => {
    if (!PROVIDERS[id]) throw new ErreurSync('config', `Provider inconnu : ${id}. Disponibles : ${Object.keys(PROVIDERS).join(', ')}.`);
    return PROVIDERS[id];
  });
}
