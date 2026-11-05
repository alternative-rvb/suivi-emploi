// ANCHOR: CV sur mesure assemblé par le modèle local : il choisit parmi des briques déjà écrites par l'utilisateur, sans rien rédiger.
// NOTE: le modèle ne rend que des identifiants (métier visé par le CV, compétences du Profil à mettre en avant, dans l'ordre) et un motif court.
// Le code ignore tout identifiant inconnu, ne propose que des compétences de niveau suffisant (jamais de niveau inventé ni de compétence ajoutée)
// et le CV est ensuite composé et contrôlé comme les autres, avec aperçu et validation avant export.
import { ErreurSync } from '../erreurs.mjs';
import { METIERS_CV, LIBELLES_METIER } from '../cv.mjs';
import { fournisseurActif } from './index.mjs';
import { enFile } from './competences.mjs';
import { construireMessage } from './questions.mjs';

const LONGUEUR_MIN = 300;
const MAX_COMPETENCES = 14;
// NOTE: l'assemblage passe par la file d'extraction (une demande à la fois) : sans délai, une file bloquée laisserait l'interface en attente indéfiniment
const delaiMs = () => Number(process.env.ASSEMBLAGE_DELAI_MS ?? 120_000);
// NOTE: résultat gardé quelques minutes par offre (même annonce) pour ne pas relancer le modèle à chaque retour sur la même offre
const TTL_MS = 10 * 60_000;
const memo = new Map();
const enVol = new Map();
// NOTE: même seuil que composerCv (niveau 3 sur 5 au moins, enseigner ou exécuter) : en dessous, une compétence n'est jamais présentée comme acquise
export const NIVEAU_MIN = 3;
export const CHOIX_METIERS = ['general', ...METIERS_CV];
const LIBELLES_CHOIX = { general: 'Général (profil polyvalent)', ...LIBELLES_METIER };

export const schemaAssemblage = ids => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    metier: { type: 'string', enum: CHOIX_METIERS },
    competences: { type: 'array', items: { type: 'string', enum: ids } },
    motif: { type: 'string' },
  },
  required: ['metier', 'competences', 'motif'],
});

export const consigneAssemblage = (competences) => `Tu aides à préparer un CV sur mesure pour une annonce d'emploi. Tu ne rédiges rien : tu choisis, en JSON, parmi des éléments déjà écrits.

Règles :
- metier : le métier visé par le CV, le plus adapté à l'annonce, parmi ${CHOIX_METIERS.map(a => `${a} (${LIBELLES_CHOIX[a]})`).join(', ')}. Choisis le métier qui correspond au poste (comptabilite pour un poste de comptable, formateur_digital pour un poste de formateur...) ; general seulement si le poste ne relève d'aucun de ces métiers.
- competences : les identifiants des compétences de la liste ci-dessous à mettre en avant pour cette annonce, de la plus importante à la moins importante, ${MAX_COMPETENCES} au plus. Ne retiens que celles dont l'annonce a réellement besoin. N'ajoute rien qui ne soit pas dans la liste.
- motif : une phrase courte en français qui dit ce que l'annonce demande et pourquoi ce métier convient. N'affirme jamais que le candidat maîtrise un logiciel ou une compétence, et ne cite aucun outil qui ne figure pas dans la liste.

Compétences disponibles (identifiant : domaine, compétence) :
${competences.map(c => `${c.id} : ${c.domaine}, ${c.competence}`).join('\n')}`;

const norm = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const mots = t => norm(t).split(/[^a-z0-9+#]+/).filter(Boolean);
// NOTE: logiciels et langages que le modèle pourrait citer à tort ; seuls des noms sans sens courant en français (pas « vue », « notion », « ciel », « sap », « word »)
const OUTILS_CONNUS = ['sage', 'ebp', 'quickbooks', 'cegid', 'odoo', 'pennylane', 'dolibarr', 'excel', 'powerpoint', 'photoshop', 'illustrator', 'indesign', 'figma', 'canva', 'wordpress', 'salesforce', 'hubspot', 'jira', 'python', 'php', 'react', 'angular', 'docker'];
// NOTE: comparaison par mots entiers, contre tous les noms de compétences du Profil quel que soit leur niveau (un outil connu mais faible n'est pas une invention)
function citeOutilAbsent(motif, outils) {
  const dansMotif = new Set(mots(motif));
  const dansProfil = new Set(outils.flatMap(mots));
  return OUTILS_CONNUS.some(o => dansMotif.has(o) && !dansProfil.has(o));
}

/**
 * Contrôle la réponse du modèle : métier connu (sinon repli), identifiants existants et sans doublon, motif court
 * @param {any} brut
 * @param {{ ids: string[], repli?: string, outils?: string[] }} contexte  outils : noms de toutes les compétences du Profil, le motif qui cite un outil connu hors de cette liste est écarté
 */
export function validerAssemblage(brut, { ids, repli = 'general', outils = [] }) {
  if (!brut || typeof brut !== 'object' || !Array.isArray(brut.competences)) throw new ErreurSync('format', 'Réponse du modèle illisible (métier et compétences attendus).');
  const connus = new Set(ids);
  const vus = new Set();
  const competences = [];
  for (const id of brut.competences) {
    if (typeof id !== 'string' || !connus.has(id) || vus.has(id)) continue;
    vus.add(id);
    competences.push(id);
    if (competences.length >= MAX_COMPETENCES) break;
  }
  const metier = CHOIX_METIERS.includes(brut.metier) ? brut.metier : repli;
  let motif = typeof brut.motif === 'string' ? brut.motif.trim().slice(0, 400) : '';
  // NOTE: texte libre du modèle : jamais affiché s'il évoque un logiciel que le Profil ne contient pas (il pourrait laisser croire à une maîtrise inventée)
  if (motif && citeOutilAbsent(motif, outils)) motif = '';
  return { metier, competences, motif };
}

/**
 * Assemble le CV d'une offre : renvoie le métier, les compétences choisies (ordre du modèle) et le motif. Lève une ErreurSync (config, reseau, format, delai...).
 * Résultat gardé 10 minutes par offre et annonce, une demande identique en cours est partagée ; force relance le modèle.
 * @param {any} db
 * @param {string} idOffre
 * @param {{ fournisseur?: any, force?: boolean }} [options]
 */
export async function assemblerCv(db, idOffre, { fournisseur, force = false } = {}) {
  const o = db.prepare('SELECT id_offre, titre, entreprise, lieu, contrat, categorie, annonce FROM offres WHERE id_offre = ?').get(idOffre);
  if (!o) throw new ErreurSync('introuvable', `Offre ${idOffre} introuvable.`);
  if (String(o.annonce ?? '').length < LONGUEUR_MIN) throw new ErreurSync('courte', 'Annonce trop courte pour assembler un CV : composition classique à la place.');
  const f = fournisseur ?? fournisseurActif();
  if (!f) throw new ErreurSync('config', 'Assemblage par le modèle désactivé : renseigner ANALYSE_PROVIDER dans le .env.');
  const toutes = /** @type {any[]} */ (db.prepare('SELECT id, domaine, competence, enseigner, executer FROM competences ORDER BY ordre, id').all());
  const competences = toutes.filter(c => Math.max(Number(c.enseigner) || 0, Number(c.executer) || 0) >= NIVEAU_MIN);
  if (!competences.length) throw new ErreurSync('config', 'Aucune compétence de niveau suffisant au Profil.');
  const cle = `${idOffre}|${f.modele}|${o.annonce.length}|${competences.map(c => c.id).join(',')}`;
  const maintenant = Date.now();
  for (const [k, v] of memo) if (maintenant - v.at >= TTL_MS) memo.delete(k);
  if (force) memo.delete(cle);
  const garde = memo.get(cle);
  if (garde) return structuredClone(garde.resultat);
  // NOTE: une demande identique déjà en cours est partagée, même avec force : un seul appel au modèle par offre à la fois
  if (enVol.has(cle)) return structuredClone(await enVol.get(cle));
  const travail = enFile(`cv:${idOffre}`, async () => {
    const t0 = Date.now();
    const calcul = (async () => {
      await f.preparer();
      const ids = competences.map(c => c.id);
      const brut = await f.repondre({ consigne: consigneAssemblage(competences), message: construireMessage(o), schema: schemaAssemblage(ids) });
      const r = validerAssemblage(brut, { ids, repli: METIERS_CV.includes(o.categorie) ? o.categorie : 'general', outils: toutes.map(c => c.competence) });
      // NOTE: le classement de l'offre par mots-clés est plus fiable que le choix d'un petit modèle : il ne tranche le métier que pour une offre hors des quatre métiers
      if (METIERS_CV.includes(o.categorie)) r.metier = o.categorie;
      return { ...r, modele: f.modele, duree_ms: Date.now() - t0, competences_noms: r.competences.map(id => competences.find(c => c.id === id)?.competence ?? id) };
    })();
    // NOTE: un résultat qui arrive après le délai est tout de même gardé (sans écraser une réponse plus récente), la demande suivante le trouvera
    calcul.then(resultat => { if ((memo.get(cle)?.debut ?? 0) <= t0) memo.set(cle, { at: Date.now(), debut: t0, resultat }); }, () => {});
    // ANCHOR: le délai libère le créneau de la file d'extraction : un modèle bloqué ne retient plus les demandes suivantes
    let minuteur;
    const delai = new Promise((_, rejeter) => { minuteur = setTimeout(() => rejeter(new ErreurSync('delai', 'Le modèle met trop de temps à répondre : composition classique à la place.')), delaiMs()); });
    try { return await Promise.race([calcul, delai]); } finally { clearTimeout(minuteur); }
  }).finally(() => { if (enVol.get(cle) === travail) enVol.delete(cle); });
  enVol.set(cle, travail);
  return structuredClone(await travail);
}

/** Vide le cache d'assemblage (tests) */
export function viderMemoAssemblage() { memo.clear(); enVol.clear(); }
