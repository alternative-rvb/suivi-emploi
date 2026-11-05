// Provider n8n : offres lues dans la base de veille via le webhook "Suivi emploi API".
// Configuration dans .env : SUIVI_API_URL, SUIVI_API_TOKEN, et SUIVI_API_HEADER si l'en-tête n'est pas X-Api-Key.
import { ErreurSync } from '../erreurs.mjs';

export default {
  id: 'n8n',
  nom: 'n8n (base de veille)',
  secours: true,

  async recuperer() {
    const { SUIVI_API_URL: url, SUIVI_API_TOKEN: jeton, SUIVI_API_HEADER: entete = 'X-Api-Key' } = process.env;
    if (!url || !jeton) throw new ErreurSync('config', 'Configuration absente : renseigner SUIVI_API_URL et SUIVI_API_TOKEN dans le fichier .env.');
    let reponse;
    try {
      reponse = await fetch(url, { headers: { [entete]: jeton, Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      const motif = e.name === 'TimeoutError' ? 'délai dépassé' : (e.cause?.code ?? e.message);
      throw new ErreurSync('reseau', `Serveur n8n injoignable (${motif}).`);
    }
    if (reponse.status === 401 || reponse.status === 403) throw new ErreurSync('auth', 'Jeton refusé par n8n : vérifier SUIVI_API_TOKEN et SUIVI_API_HEADER.');
    if (!reponse.ok) throw new ErreurSync('http', `Le webhook n8n a répondu ${reponse.status}. Le workflow est-il publié ?`);
    let donnees;
    try {
      donnees = await reponse.json();
    } catch {
      throw new ErreurSync('format', 'Réponse du webhook illisible (JSON attendu).');
    }
    if (!Array.isArray(donnees?.offres) || !Array.isArray(donnees.zones) || !Array.isArray(donnees.exclusions)) {
      throw new ErreurSync('format', 'Réponse du webhook inattendue : offres, zones ou exclusions absentes.');
    }
    // ANCHOR: la clé veille liste les mots-clés, entreprises et plateformes de la veille (absente d'un ancien webhook)
    const veille = Array.isArray(donnees.veille) ? donnees.veille : [];
    const de = t => veille.filter(v => v.type === t).map(v => v.valeur);
    return {
      date: donnees.genere_le,
      offres: donnees.offres,
      zones: donnees.zones.map(z => z.code),
      exclusions: donnees.exclusions.map(e => ({ type: e.type, valeur: e.valeur })),
      config: {
        mots_cles: de('mot_cle'),
        entreprises: de('entreprise'),
        plateformes: de('plateforme'),
        contrats_exclus: donnees.exclusions.filter(e => e.type === 'type_contrat').map(e => e.valeur),
        mots_exclus: donnees.exclusions.filter(e => e.type === 'mot_intitule').map(e => e.valeur),
      },
    };
  },
};
