// ANCHOR: brouillon de lettre de motivation rédigé par le modèle local depuis l'annonce, la matrice de l'utilisateur et les faits du Profil.
// NOTE: le brouillon n'est qu'un point de départ : il s'affiche dans un textarea modifiable, passe par le contrôle (faits et méthode) et Claude peut le réécrire via l'API.
import { ErreurSync } from '../erreurs.mjs';
import { BLOCS_LETTRE, CLICHES, HUMILITE, STYLE_DEFAUT, anglesDuMetier, validerMatrice, validerStyle } from '../lettre.mjs';
import { fournisseurActif } from './index.mjs';
import { enFile } from './competences.mjs';
import { construireMessage } from './questions.mjs';
import { NIVEAU_MIN } from './assemblage.mjs';

const LONGUEUR_MIN = 300;
// NOTE: rédiger 300 mots prend plus de temps qu'un choix d'identifiants : délai plus long que l'assemblage du CV
const delaiMs = () => Number(process.env.LETTRE_DELAI_MS ?? 180_000);
const TTL_MS = 10 * 60_000;
const memo = new Map();
const enVol = new Map();

// NOTE: style lu dans le kv par la rédaction elle-même, pour que le serveur, le CLI et les tests partagent la même source
function lireJsonKv(db, cle) {
  try { return JSON.parse(String(/** @type {any} */ (db.prepare('SELECT valeur FROM kv WHERE cle = ?').get(cle))?.valeur ?? '')); } catch { return {}; }
}
const TONS = { sobre: 'sobre et professionnel', chaleureux: 'chaleureux mais professionnel', dynamique: 'dynamique et direct' };
const ROLES = {
  vous: "Vous : une à deux phrases à la première personne, qui partent d'un fait précis de l'annonce (projet, besoin, contexte, outil, public) et le relient au candidat. Ne recopie ni ne paraphrase la liste des missions du poste, n'écris pas « [entreprise] recherche » ni « votre rôle sera », ne commence pas par le nom de l'entreprise. Jamais « Je me permets » ni « Suite à votre annonce ». Choisis UN type d'accroche selon l'annonce et varie d'une lettre à l'autre (types donnés plus bas). Les faits viennent toujours de l'annonce réelle et des faits du candidat.",
  moi: "Moi : les preuves du candidat qui répondent à ce besoin, une réalisation concrète tirée des faits fournis, avec les mots-clés de l'annonce repris tels quels.",
  faible: "Point faible assumé : l'écart avec l'annonce présenté comme un atout (double compétence, regard neuf, mobilité), en deux phrases au plus, sans s'excuser. Aucune information personnelle (âge, santé, famille, période sans emploi).",
  nous: "Nous : ce que la collaboration apportera concrètement à l'entreprise, au futur, en lien avec ses enjeux.",
  conclusion: "Conclusion : proposition d'un échange (entretien, appel), puis une formule de politesse courte (par exemple « Je vous prie d'agréer, Madame, Monsieur, mes salutations distinguées. »).",
};

// NOTE: mois d'une période AAAA-MM (fin vide = en cours) : une mission de 12 mois au plus est résumée en une ligne, comme dans le CV
const moisDe = m => (/^\d{4}-\d{2}$/.test(m ?? '') ? Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 : null);
const dureeMois = x => (moisDe(x.fin) ?? moisDe(new Date().toISOString().slice(0, 7)) ?? 0) - (moisDe(x.debut) ?? 0) + 1;
// NOTE: phrases de méthode répétées dans chaque mission de formation : elles ne prouvent rien de précis et mangent le contexte du modèle
const REPETITIONS = /apprentissage par la pratique|formation continue pour adultes/i;
const sansRepetitions = t => String(t ?? '').split(/(?<=[.!?])\s+/).filter(p => !REPETITIONS.test(p)).join(' ');
// NOTE: mots trop courants pour départager les projets (le mot « développement » figure dans presque toutes les annonces et descriptions)
const MOTS_COURANTS = new Set(['developpement', 'developper', 'application', 'applications', 'outils', 'site', 'sites', 'avec', 'dans', 'pour', 'plus', 'entre', 'vous', 'votre', 'nous', 'leurs', 'les', 'des', 'une', 'aux', 'sont', 'etre', 'ainsi', 'fonctionnalites']);
const motsDe = t => new Set(String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9+#]+/).filter(m => m.length >= 4 && !MOTS_COURANTS.has(m)));

/** Faits du Profil autorisés dans la lettre, bornés pour tenir dans le contexte du modèle : expériences longues détaillées, missions courtes en une ligne, projets les plus proches de l'annonce @param {any} db @param {string[]} ids @param {string} [annonce] */
export function faitsProfil(db, ids = [], annonce = '') {
  const ligne = /** @type {any} */ (db.prepare("SELECT valeur FROM kv WHERE cle = 'profil'").get());
  /** @type {any} */
  let p = {};
  try { p = ligne ? JSON.parse(String(ligne.valeur)) : {}; } catch { p = {}; }
  const court = (t, n) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const toutesExp = /** @type {any[]} */ (db.prepare('SELECT poste, employeur, lieu, debut, fin, description FROM experiences').all());
  const recentes = (a, b) => (b.fin === '' ? 1 : 0) - (a.fin === '' ? 1 : 0) || String(b.fin).localeCompare(String(a.fin)) || String(b.debut).localeCompare(String(a.debut));
  const longues = toutesExp.filter(x => dureeMois(x) > 12).sort(recentes).slice(0, 8);
  const missions = toutesExp.filter(x => dureeMois(x) <= 12).sort(recentes).slice(0, 10);
  const mots = motsDe(annonce);
  // NOTE: un mot de l'annonce dans les technologies ou le nom d'un projet compte triple, dans sa description simple
  const commun = t => [...motsDe(t)].filter(m => mots.has(m)).length;
  const pertinence = x => 3 * commun(`${x.nom} ${x.technologies}`) + commun(x.description);
  const projets = /** @type {any[]} */ (db.prepare('SELECT nom, technologies, description, debut FROM projets ORDER BY ordre, id').all())
    .map(x => ({ ...x, score: pertinence(x) })).sort((a, b) => b.score - a.score || String(b.debut).localeCompare(String(a.debut))).slice(0, 8);
  const toutes = /** @type {any[]} */ (db.prepare('SELECT id, domaine, competence, enseigner, executer FROM competences ORDER BY ordre, id').all());
  const admises = toutes.filter(c => Math.max(Number(c.enseigner) || 0, Number(c.executer) || 0) >= NIVEAU_MIN);
  const choisies = ids.length ? admises.filter(c => ids.includes(c.id)) : [];
  return {
    choisies: choisies.map(c => c.competence),
    texte: [
      p.resume && `Résumé : ${court(p.resume, 600)}`,
      'Expériences :',
      ...longues.map(x => `- ${x.poste}${x.employeur ? `, ${x.employeur}${x.lieu ? ` à ${x.lieu}` : ''}` : ''} (${x.debut.slice(0, 4)} à ${x.fin ? x.fin.slice(0, 4) : "aujourd'hui"}) : ${court(sansRepetitions(x.description), 700)}`),
      missions.length && 'Missions courtes récentes :',
      ...missions.map(x => `- ${x.employeur ? `${x.employeur}${x.lieu ? ` (${x.lieu})` : ''}, ` : ''}${court(x.poste, 70)} (${x.debut.slice(0, 4)})${court(sansRepetitions(x.description), 160) ? ` : ${court(sansRepetitions(x.description), 160)}` : ''}`),
      projets.length && 'Projets :',
      ...projets.map(x => `- ${x.nom}${x.technologies ? ` (${court(x.technologies, 80)})` : ''} : ${court(x.description, 200)}`),
      `Compétences de niveau confirmé : ${admises.slice(0, 40).map(c => c.competence).join(', ')}`,
    ].filter(Boolean).join('\n'),
  };
}

/** @param {ReturnType<typeof validerMatrice>} matrice @param {{ texte: string, choisies: string[] }} faits @param {ReturnType<typeof validerStyle>} [style] @param {string} [metier] */
export function consigneLettre(matrice, faits, style = validerStyle(STYLE_DEFAUT), metier = '') {
  const angles = anglesDuMetier(style, metier);
  // NOTE: les formules intégrées (CLICHES, HUMILITE) sont normalisées sans accents ; elles restent lisibles pour le modèle
  const interdites = [...new Set([...style.eviter, ...CLICHES, ...HUMILITE])];
  const blocs = BLOCS_LETTRE.filter(b => matrice.blocs[b].actif);
  return `Tu rédiges en français la lettre de motivation d'un candidat expérimenté pour l'annonce fournie. Tu écris comme un expert du recrutement en 2026 : lettre courte, concrète, centrée sur le besoin du recruteur.
Règles :
- Environ ${matrice.mots} mots au total, ton ${TONS[matrice.ton]}, à la première personne.
- Un paragraphe par bloc, dans cet ordre : ${blocs.join(', ')}.
${blocs.map(b => `- ${ROLES[b]}${b === 'vous' && angles.length ? `\n${angles.map((a, i) => `  (${i + 1}) ${a.nom} : ${a.consigne}`).join('\n')}` : ''}${matrice.blocs[b].consigne ? ` Consigne du candidat : ${matrice.blocs[b].consigne}` : ''}`).join('\n')}
- Posture d'expert : verbes d'action, affirmations sobres, aucune formule d'humilité (« je pense pouvoir », « même si je n'ai pas »), aucun cliché ni formule creuse. Formules interdites : ${interdites.join(' ; ')}.
- N'utilise que les faits ci-dessous : n'invente aucun employeur, chiffre, diplôme, logiciel ni réalisation. Un chiffre n'apparaît que s'il figure dans les faits.
- Les missions décrites par l'annonce sont celles du poste, pas l'expérience du candidat : ne les présente jamais comme déjà faites. Seules les expériences et projets listés dans les faits sont vrais.
- N'adresse jamais le poste au recruteur à la troisième personne (« Votre rôle sera de... », « vous recherchez un développeur capable de... ») : la lettre parle du candidat et de ce qu'il apporte.
- N'écris aucune durée d'expérience (« 2 ans d'expérience ») : les années des expériences suffisent.
${faits.choisies.length ? `- Compétences à mettre en avant : ${faits.choisies.join(', ')}.\n` : ''}- Ponctuation simple : pas de tiret long, pas d'emoji. N'écris ni l'en-tête, ni « Madame, Monsieur, » en ouverture, ni la signature.
- objet : l'objet de la lettre (candidature au poste, avec la référence de l'annonce si elle est connue), une ligne.
Faits du candidat :
${faits.texte}`;
}

export const schemaBlocsLettre = blocs => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    objet: { type: 'string' },
    paragraphes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { bloc: { type: 'string', enum: blocs }, texte: { type: 'string' } }, required: ['bloc', 'texte'] } },
  },
  required: ['objet', 'paragraphes'],
});

const SALUTATION = /^(madame|monsieur)[^.]{0,40},?$/i;
// NOTE: le petit modèle glisse parfois tirets longs et guillemets courbes : ramenés à la ponctuation du clavier
const nettoyer = t => String(t ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/\p{Extended_Pictographic}/gu, '').replace(/[ \t]+/g, ' ').trim();

/**
 * Réponse du modèle contrôlée : blocs connus et actifs, un paragraphe par bloc dans l'ordre de la matrice, point faible jamais en premier ni en dernier
 * @param {any} brut @param {ReturnType<typeof validerMatrice>} matrice
 */
export function validerBrouillon(brut, matrice) {
  if (!brut || typeof brut !== 'object' || !Array.isArray(brut.paragraphes)) throw new ErreurSync('format', 'Réponse du modèle illisible (paragraphes attendus).');
  const actifs = BLOCS_LETTRE.filter(b => matrice.blocs[b].actif);
  const parBloc = new Map();
  for (const p of brut.paragraphes) {
    if (!p || !actifs.includes(p.bloc) || typeof p.texte !== 'string') continue;
    const texte = nettoyer(p.texte).slice(0, 1500);
    if (!texte || SALUTATION.test(texte)) continue;
    parBloc.set(p.bloc, [parBloc.get(p.bloc), texte].filter(Boolean).join(' '));
  }
  let ordre = actifs.filter(b => parBloc.has(b));
  if (!ordre.length) throw new ErreurSync('format', 'Le modèle n\'a rendu aucun paragraphe exploitable.');
  if (ordre.length > 2 && (ordre[0] === 'faible' || ordre.at(-1) === 'faible')) ordre = [ordre.filter(b => b !== 'faible')[0], 'faible', ...ordre.filter(b => b !== 'faible').slice(1)];
  else if (ordre.length <= 2) ordre = ordre.filter(b => b !== 'faible');
  const paragraphes = ordre.map(bloc => ({ bloc, texte: parBloc.get(bloc) }));
  return { objet: nettoyer(brut.objet).slice(0, 300), paragraphes, texte: ['Madame, Monsieur,', ...paragraphes.map(p => p.texte)].join('\n\n') };
}

/**
 * Rédige le brouillon d'une offre. Lève une ErreurSync (config, introuvable, courte, reseau, format, delai).
 * Résultat gardé 10 minutes par offre et matrice, une demande identique en cours est partagée ; force relance le modèle.
 * @param {any} db @param {string} idOffre @param {any} matriceBrute @param {{ fournisseur?: any, force?: boolean, style?: any }} [options]
 */
export async function redigerLettre(db, idOffre, matriceBrute, { fournisseur, force = false, style: style_ } = {}) {
  const o = db.prepare('SELECT id_offre, titre, entreprise, lieu, contrat, annonce, categorie FROM offres WHERE id_offre = ?').get(idOffre);
  if (!o) throw new ErreurSync('introuvable', `Offre ${idOffre} introuvable.`);
  if (String(o.annonce ?? '').length < LONGUEUR_MIN) throw new ErreurSync('courte', 'Annonce trop courte pour rédiger une lettre : écrivez-la dans le champ de texte.');
  const f = fournisseur ?? fournisseurActif();
  if (!f) throw new ErreurSync('config', 'Rédaction par le modèle désactivée : renseigner ANALYSE_PROVIDER dans le .env.');
  const matrice = validerMatrice(matriceBrute);
  const faits = faitsProfil(db, matrice.competences, o.annonce);
  const style = validerStyle(style_ ?? lireJsonKv(db, 'lettre_style'));
  const consigne = consigneLettre(matrice, faits, style, String(o.categorie ?? ''));
  const cle = `${idOffre}|${f.modele}|${o.annonce.length}|${consigne}|${JSON.stringify(matrice)}`;
  const maintenant = Date.now();
  for (const [k, v] of memo) if (maintenant - v.at >= TTL_MS) memo.delete(k);
  if (force) memo.delete(cle);
  const garde = memo.get(cle);
  if (garde) return structuredClone(garde.resultat);
  if (enVol.has(cle)) return structuredClone(await enVol.get(cle));
  const travail = enFile(`lettre:${idOffre}`, async () => {
    const t0 = Date.now();
    const calcul = (async () => {
      await f.preparer();
      const brut = await f.repondre({ consigne, message: construireMessage(o), schema: schemaBlocsLettre(BLOCS_LETTRE.filter(b => matrice.blocs[b].actif)) });
      return { ...validerBrouillon(brut, matrice), matrice, modele: f.modele, duree_ms: Date.now() - t0 };
    })();
    calcul.then(resultat => { if ((memo.get(cle)?.debut ?? 0) <= t0) memo.set(cle, { at: Date.now(), debut: t0, resultat }); }, () => {});
    // ANCHOR: même garde que l'assemblage du CV : le délai libère la file d'extraction si le modèle ne répond plus
    let minuteur;
    const delai = new Promise((_, rejeter) => { minuteur = setTimeout(() => rejeter(new ErreurSync('delai', 'Le modèle met trop de temps à répondre : réessayez ou écrivez la lettre dans le champ de texte.')), delaiMs()); });
    try { return await Promise.race([calcul, delai]); } finally { clearTimeout(minuteur); }
  }).finally(() => { if (enVol.get(cle) === travail) enVol.delete(cle); });
  enVol.set(cle, travail);
  return structuredClone(await travail);
}

/** Vide le cache de rédaction (tests) */
export function viderMemoLettre() { memo.clear(); enVol.clear(); }
