// Provider France Travail direct : interroge l'API Offres d'emploi v2 sans passer par n8n.
// Configuration dans .env : FT_CLIENT_ID et FT_CLIENT_SECRET (application déclarée sur francetravail.io).
// Les réglages (mots-clés, zones, contrats exclus, employeurs surveillés) viennent de la copie locale de la veille (ctx.config).
import { ErreurSync } from '../erreurs.mjs';
import { jetonFranceTravail } from '../ft-jeton.mjs';

const URL_RECHERCHE = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const URL_OFFRE = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres';
// NOTE: FT_PAUSE_MS permet de supprimer les pauses dans les tests
const PAUSE_MS = Number(process.env.FT_PAUSE_MS ?? 700);
const TAILLE_PAGE = 150;
// NOTE: l'API limite une recherche à 1150 résultats, par pages de 150 au plus
const MAX_RESULTATS = 1000;
const attendre = ms => new Promise(r => setTimeout(r, ms));

// NOTE: l'API répond 204 sans corps quand il n'y a aucun résultat
async function appeler(url, options, delai = 30_000) {
  let reponse;
  try {
    reponse = await fetch(url, { ...options, signal: AbortSignal.timeout(delai) });
  } catch (e) {
    const motif = e.name === 'TimeoutError' ? 'délai dépassé' : (e.cause?.code ?? e.message);
    throw new ErreurSync('reseau', `API France Travail injoignable (${motif}).`);
  }
  return reponse;
}

// NOTE: pas de cache de jeton ici, une synchro en demande un seul
const jeton = () => jetonFranceTravail('api_offresdemploiv2 o2dsoffre', { memoriser: false, nomApi: 'Offres d\'emploi' });

// Une page de résultats (50 au plus), avec un nouvel essai sur 429 ou coupure réseau
async function page(token, motsCles, departement, debut) {
  const url = `${URL_RECHERCHE}?${new URLSearchParams({ motsCles, departement, range: `${debut}-${debut + TAILLE_PAGE - 1}`, sort: '1', publieeDepuis: '31' })}`;
  for (let essai = 0; ; essai++) {
    let r;
    try {
      r = await appeler(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    } catch (e) {
      if (essai === 0) { await attendre(PAUSE_MS * 4); continue; }
      throw e;
    }
    if (r.status === 429 && essai === 0) { await attendre(PAUSE_MS * 4); continue; }
    if (r.status === 204) return [];
    if (r.status === 401 || r.status === 403) throw new ErreurSync('auth', 'Jeton France Travail refusé pendant la recherche.');
    if (!r.ok && r.status !== 206) throw new ErreurSync('http', `La recherche France Travail a répondu ${r.status}.`);
    const donnees = await r.json().catch(() => null);
    if (!donnees) throw new ErreurSync('format', 'Réponse de recherche France Travail illisible.');
    return donnees.resultats ?? [];
  }
}

// ANCHOR: la veille n8n n'en lit que 50 par recherche, mais elle tourne toutes les 4 heures. Une synchro ponctuelle doit paginer pour voir les 31 jours
// NOTE: plafond vrai quand les 1000 résultats permis sont atteints : la recherche est alors tronquée, une offre absente n'est pas forcément clôturée
async function chercher(token, motsCles, departement) {
  const offres = [];
  let plafond = true;
  for (let debut = 0; debut < MAX_RESULTATS; debut += TAILLE_PAGE) {
    const lot = await page(token, motsCles, departement, debut);
    offres.push(...lot);
    if (lot.length < TAILLE_PAGE) { plafond = false; break; }
    await attendre(PAUSE_MS);
  }
  return { offres, plafond };
}

// ANCHOR: contrôle unitaire d'une offre par son numéro : l'API détail répond 200 avec l'offre, 204 sans corps quand elle n'est plus en ligne
// NOTE: renvoie en_ligne, cloturee ou inconnu (clés absentes, réseau, jeton refusé, autre statut) ; ne lève jamais, rien n'est marqué sur inconnu
export async function verifierEnLigne(id) {
  try {
    const token = await jeton();
    const r = await appeler(`${URL_OFFRE}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, 15_000);
    if (r.status === 200) return 'en_ligne';
    if (r.status === 204) return 'cloturee';
    return 'inconnu';
  } catch {
    return 'inconnu';
  }
}

// Salaire annuel estimé (même règle que la veille n8n) : horaire inchangé, mensuel x 12, fourchette moyennée
function salaire(libelle) {
  const m = (libelle || '').match(/(\d[\d\s.,]+)\s*[Ee]uros?(?:\s*[àa]\s*(\d[\d\s.,]+)\s*[Ee]uros?)?/);
  if (!m) return null;
  const nombre = v => parseFloat(v.replace(/\s/g, '').replace(',', '.'));
  const bas = nombre(m[1]);
  const haut = m[2] ? nombre(m[2]) : null;
  const moyen = haut ? (bas + haut) / 2 : bas;
  return String(/mensuel/i.test(libelle) ? moyen * 12 : moyen);
}

// NOTE: la durée du CDD est gardée (« CDD - 12 mois »), car le score en dépend pour les offres éloignées ; seul le détail après la durée est retiré
const contrat = t => (t || '').replace(/(\s*-\s*\d+\s*(?:mois|semaines?|ans?|jours?)).*/i, (_, d) => d.toLowerCase()).trim();

export default {
  id: 'france-travail',
  nom: 'API France Travail (directe)',
  secours: false,

  async recuperer(ctx) {
    const c = ctx.config;
    if (!c?.mots_cles?.length || !c?.zones?.length) {
      throw new ErreurSync('config', 'Mots-clés et zones inconnus : une synchro réussie avec un autre provider (n8n) est nécessaire une première fois.');
    }
    const exclus = new Set((c.contrats_exclus?.length ? c.contrats_exclus : ['FRA']).map(x => x.toUpperCase()));
    const surveilles = (c.entreprises ?? []).map(e => e.toLowerCase().trim()).filter(Boolean);
    const token = await jeton();

    const vues = new Set();
    const enLigne = new Set();
    const offres = [];
    const erreurs = [];
    let plafond = false;
    for (const dep of c.zones) {
      for (const mot of c.mots_cles) {
        // ANCHOR: l'intitulé doit contenir un mot de 5 lettres ou plus du mot-clé, sauf pour un employeur surveillé
        const mots5 = mot.toLowerCase().split(/\s+/).filter(w => w.length >= 5);
        let trouvees;
        try {
          const r = await chercher(token, mot, dep);
          trouvees = r.offres;
          if (r.plafond) plafond = true;
        } catch (e) {
          // NOTE: une erreur d'authentification arrête tout, une recherche isolée en échec est seulement signalée
          if (e instanceof ErreurSync && e.code === 'auth') throw e;
          erreurs.push(`${mot} (${dep}) : ${e.message}`);
          await attendre(PAUSE_MS);
          continue;
        }
        for (const o of trouvees) {
          enLigne.add(o.id);
          if (vues.has(o.id) || exclus.has((o.typeContrat || '').toUpperCase())) continue;
          const employeur = (o.entreprise?.nom || '').toLowerCase();
          const surveille = surveilles.some(e => employeur.includes(e));
          if (mots5.length && !surveille && !mots5.some(w => (o.intitule || '').toLowerCase().includes(w))) continue;
          vues.add(o.id);
          offres.push({
            id_offre: o.id,
            titre: (o.intitule || '').substring(0, 255),
            entreprise: (o.entreprise?.nom || '').substring(0, 255),
            lieu: (o.lieuTravail?.libelle || '').substring(0, 255),
            type_de_contrat: contrat(o.typeContratLibelle),
            salaire: salaire(o.salaire?.libelle),
            lien: o.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}`,
            date_de_detection: (o.dateCreation || new Date().toISOString()).slice(0, 10),
            description: o.description || '',
            plateforme: 'France Travail',
          });
        }
        await attendre(PAUSE_MS);
      }
    }
    // NOTE: aucune offre et que des erreurs : vrai échec, pas une journée creuse
    if (!offres.length && erreurs.length) throw new ErreurSync('http', `Aucune recherche n'a abouti (${erreurs[0]}).`);
    // NOTE: couverture : ids = toutes les offres reçues de l'API avant les filtres locaux, complete = aucune recherche en échec ni tronquée (voir lib/providers/index.mjs)
    return { date: new Date().toISOString(), offres, couverture: { complete: !erreurs.length && !plafond, ids: [...enLigne], verifier: verifierEnLigne } };
  },
};
