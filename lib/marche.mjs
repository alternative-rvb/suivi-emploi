// API Marché du travail v1 de francetravail.io : offres et demandeurs d'emploi par métier (code ROME) et département.
// Activée par FT_SCOPE_MARCHE dans le .env (voir .env.example) ; sans cette variable, la fonction est désactivée.
import { ErreurSync } from './erreurs.mjs';
import { jetonFranceTravail, URL_API } from './ft-jeton.mjs';
import { CATALOGUE, metierDe } from './metiers.mjs';
import { METIERS_HISTORIQUES } from './metiers-profil.mjs';
import { profilActif } from './profils.mjs';

const URL_INDICATEUR = `${URL_API}/stats-offres-demandes-emploi/v1/indicateur`;
// NOTE: l'API refuse le scope api_stats-offres-demandes-emploiv1 seul (403) : offresetdemandesemploi est requis en plus
const SCOPES_REQUIS = ['offresetdemandesemploi'];
// ANCHOR: un code ROME par métier du catalogue (lib/metiers.mjs, mêmes codes que les candidatures spontanées) ; chaque profil interroge les métiers de sa liste
export const METIERS = CATALOGUE.map(m => [m.cle, m.rome]);
// NOTE: un métier créé par le profil (ligne 266) n'est interrogé que s'il a un code ROME
const romes = (/** @type {string[]} */ cles, /** @type {import('./metiers.mjs').MetierPerso[]} */ perso = []) => /** @type {[string, string][]} */ (cles.map(c => [c, metierDe(c, perso)?.rome ?? '']).filter(([, r]) => r));
const DEPARTEMENT_DEFAUT = '13';
// NOTE: un cache par profil (département et métiers propres à chacun), sinon deux profils s'invalideraient l'un l'autre à chaque changement d'onglet
const cleKv = db => `marche_cache:${profilActif(db)}`;
const VERSION_CACHE = 2;
const DEPARTEMENT = /^(\d{2,3}|2[AB])$/;

// ANCHOR: la fonction est active seulement si FT_SCOPE_MARCHE est renseignée ; le scope requis est complété si le .env n'en cite qu'un
export function scopeMarche(env = process.env) {
  const saisi = (env.FT_SCOPE_MARCHE ?? '').split(/\s+/).filter(Boolean);
  if (!saisi.length) return null;
  return [...new Set([...saisi, ...SCOPES_REQUIS])].join(' ');
}

// NOTE: département de la zone « proche » du .env (SUIVI_DEPARTEMENT_PROCHE), sinon les Bouches-du-Rhône
export function departementMarche(env = process.env) {
  const d = (env.SUIVI_DEPARTEMENT_PROCHE ?? '').trim().toUpperCase();
  return DEPARTEMENT.test(d) ? d : DEPARTEMENT_DEFAUT;
}

const attendre = ms => new Promise(r => setTimeout(r, ms));
const entier = v => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Number(v) : null);

// Un appel d'indicateur. Renvoie les valeurs de toutes les périodes disponibles ; lève une ErreurSync typée
async function appeler(jeton, indicateur, corps) {
  let r;
  try {
    r = await fetch(`${URL_INDICATEUR}/${indicateur}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ codeTypeTerritoire: 'DEP', codeTypeActivite: 'ROME', codeTypePeriode: 'TRIMESTRE', ...corps }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const motif = e.name === 'TimeoutError' ? 'délai dépassé' : (e.cause?.code ?? e.message);
    throw new ErreurSync('reseau', `API Marché du travail injoignable (${motif}).`);
  }
  if (r.status === 204) return { libTerritoire: '', valeurs: [] };
  if (r.status === 401 || r.status === 403) throw new ErreurSync('auth', 'Le Marché du travail a refusé l\'accès : vérifier que l\'API est ajoutée à l\'application sur francetravail.io et que son accès est validé.');
  if (r.status === 429) throw new ErreurSync('http', 'Marché du travail : trop d\'appels, réessayer dans un instant.');
  if (!r.ok) throw new ErreurSync('http', `Le Marché du travail a répondu ${r.status}.`);
  const donnees = await r.json().catch(() => null);
  if (!donnees || !Array.isArray(donnees.listeValeursParPeriode)) throw new ErreurSync('format', 'Réponse du Marché du travail illisible.');
  return { libTerritoire: String(donnees.libTerritoire || donnees.listeValeursParPeriode[0]?.libTerritoire || ''), valeurs: donnees.listeValeursParPeriode };
}

// NOTE: l'API renvoie une valeur par période (22 trimestres depuis 2021) et par nomenclature ; on indexe par période pour une nomenclature donnée
const parPeriode = (valeurs, code) => new Map(valeurs.filter(v => v.codeNomenclature === code && v.codePeriode).map(v => [String(v.codePeriode), v]));
const NB_TRIMESTRES = 8;
const rapport = (offres, demandeurs) => (offres !== null && demandeurs ? Math.round((offres / demandeurs) * 1000) / 10 : null);
// NOTE: le même trimestre un an plus tôt (2026T2 vers 2025T2) : les offres sont saisonnières, comparer à un autre trimestre fausserait la tendance
const memeTrimestreAnPrecedent = code => { const m = /^(\d{4})T(\d)$/.exec(code); return m ? `${Number(m[1]) - 1}T${m[2]}` : ''; };

// ANCHOR: un métier vers le format de l'app : dernier trimestre (offres, cumul 12 mois, demandeurs de catégorie A, offres pour 100 demandeurs), historique des 8 derniers trimestres et évolution sur un an
// NOTE: une valeur absente ou masquée par l'API (secret statistique) reste null, jamais 0
export function normaliserMetier(cle, rome, offres, demandeurs) {
  const toff = parPeriode(offres, 'TOFF');
  const cumul = parPeriode(offres, 'TOFF-CUMUL12MOIS');
  const de = parPeriode(demandeurs, 'A');
  const periodes = [...new Set([...toff.keys(), ...de.keys()])].sort();
  const dernier = [...toff.keys()].sort().at(-1) ?? periodes.at(-1) ?? '';
  const ligne = code => {
    const o = entier(toff.get(code)?.valeurPrincipaleNombre);
    const d = entier(de.get(code)?.valeurPrincipaleNombre);
    return { periode: code, offres: o, demandeurs: d, offres_pour_100: rapport(o, d) };
  };
  const actuel = dernier ? ligne(dernier) : { offres: null, demandeurs: null, offres_pour_100: null };
  const avant = dernier ? ligne(memeTrimestreAnPrecedent(dernier)).offres_pour_100 : null;
  return {
    cle,
    rome,
    libelle: String((toff.get(dernier) ?? de.get(dernier))?.libActivite ?? ''),
    periode: String((toff.get(dernier) ?? de.get(dernier))?.libPeriode ?? ''),
    offres: actuel.offres,
    offres_12_mois: entier(cumul.get(dernier)?.valeurPrincipaleNombre),
    demandeurs: actuel.demandeurs,
    offres_pour_100: actuel.offres_pour_100,
    evolution_pct: actuel.offres_pour_100 !== null && avant ? Math.round(((actuel.offres_pour_100 - avant) / avant) * 100) : null,
    historique: periodes.filter(c => c <= dernier).slice(-NB_TRIMESTRES).map(ligne),
  };
}

// Interroge l'API pour les métiers demandés (deux appels chacun, espacés pour rester sous la limite de 10 appels par seconde)
export async function interrogerMarche(departement, cles = METIERS_HISTORIQUES, perso = []) {
  const scope = scopeMarche();
  if (!scope) throw new ErreurSync('config', 'Le Marché du travail est désactivé : renseigner FT_SCOPE_MARCHE dans le fichier .env (voir .env.example).');
  const jeton = await jetonFranceTravail(scope, { nomApi: 'Marché du travail' });
  let territoire = '';
  const metiers = [];
  for (const [cle, rome] of romes(cles, perso)) {
    const commun = { codeTerritoire: departement, codeActivite: rome };
    const offres = await appeler(jeton, 'stat-offres', { ...commun, codeTypeNomenclature: 'ORIGINEOFF', listeCodeNomenclature: ['TOFF', 'TOFF-CUMUL12MOIS'] });
    await attendre(150);
    const demandeurs = await appeler(jeton, 'stat-demandeurs', { ...commun, codeTypeNomenclature: 'CATCAND', listeCodeNomenclature: ['A'] });
    await attendre(150);
    territoire = territoire || offres.libTerritoire || demandeurs.libTerritoire;
    metiers.push(normaliserMetier(cle, rome, offres.valeurs, demandeurs.valeurs));
  }
  return { departement, territoire, metiers };
}

const jourDe = d => d.toISOString().slice(0, 10);
function lireCache(db) {
  const ligne = /** @type {any} */ (db.prepare('SELECT valeur FROM kv WHERE cle = ?').get(cleKv(db)));
  try {
    const v = ligne ? JSON.parse(ligne.valeur) : null;
    // NOTE: un cache écrit avant l'historique (sans version) est ignoré pour être reconstruit
    return v && v.version === VERSION_CACHE && Array.isArray(v.metiers) ? v : null;
  } catch {
    return null;
  }
}

/** @type {{ cle: string, p: Promise<any> } | null} */
let enCours = null;
// ANCHOR: données gardées dans le kv marche_cache et rafraîchies au plus une fois par jour (les chiffres sont trimestriels) ; en cas d'échec, les dernières données connues sont renvoyées avec `obsolete`
// NOTE: departement : celui de la zone « proche » du profil (fourni par le serveur), sinon l'ancien .env
// NOTE: metiers : liste du profil (lib/metiers-profil.mjs), perso : ses métiers créés ; le cache n'est repris que pour le même département et les mêmes codes ROME
// NOTE: sans_rome : métiers créés de la liste sans code ROME, signalés par la carte
export async function chargerMarche(db, { force = false, maintenant = new Date(), departement = departementMarche(), metiers = METIERS_HISTORIQUES, perso = [] } = {}) {
  if (!scopeMarche()) return { actif: false, metiers: [] };
  if (!metiers.length) return { actif: true, departement, territoire: '', metiers: [], sans_metiers: true };
  const avecRome = romes(metiers, perso);
  const sansRome = metiers.filter(c => !avecRome.some(([k]) => k === c));
  const extra = sansRome.length ? { sans_rome: sansRome } : {};
  if (!avecRome.length) return { actif: true, departement, territoire: '', metiers: [], ...extra };
  const cles = avecRome.map(([c]) => c);
  const sig = avecRome.map(([c, r]) => `${c}:${r}`).join(',');
  const garde = lireCache(db);
  const memes = g => g.departement === departement && (g.sig ?? (g.cles ?? METIERS_HISTORIQUES).map(c => `${c}:${metierDe(c)?.rome}`).join(',')) === sig;
  if (!force && garde && garde.jour === jourDe(maintenant) && memes(garde)) return { actif: true, ...garde, ...extra };
  try {
    // NOTE: une demande en cours pour d'autres métiers n'est pas partagée
    const cle = `${departement}|${sig}`;
    if (enCours?.cle !== cle) enCours = { cle, p: interrogerMarche(departement, cles, perso).finally(() => { if (enCours?.cle === cle) enCours = null; }) };
    const frais = { version: VERSION_CACHE, jour: jourDe(maintenant), cles, sig, ...(await enCours.p) };
    db.prepare('INSERT INTO kv (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(cleKv(db), JSON.stringify(frais));
    return { actif: true, ...frais, ...extra };
  } catch (e) {
    if (e instanceof ErreurSync && garde && memes(garde)) return { actif: true, ...garde, ...extra, obsolete: true, erreur: e.message };
    throw e;
  }
}
