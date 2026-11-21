import { CircleAlert, CircleCheck, CircleX, CloudDownload, Sparkles } from 'lucide-react';
import { dateHeure as heure, dureeMs } from '../format.ts';

const ICONES = { ok: CircleCheck, warn: CircleAlert, ko: CircleX };

// ANCHOR: lecture d'un état de traitement en un niveau (ok, warn, ko, run, off), un titre et un détail. Même vocabulaire pour la synchro des offres et l'analyse IA.
// NOTE: durée de la dernière synchro et moyenne des dernières réussies (jusqu'à 10), pour estimer le temps d'une récupération
const dureesSynchro = d => [
  d?.duree_ms ? `Durée : ${dureeMs(d.duree_ms)}` : '',
  d?.moyenne_ms && d.durees?.length > 1 ? `moyenne ${dureeMs(d.moyenne_ms)} sur ${d.durees.length} synchros` : '',
].filter(Boolean).join(', ');

export function lireSynchro(synchro, enCours) {
  const d = synchro?.dernier;
  if (enCours) return { niveau: 'run', titre: 'Récupération des offres en cours', detail: d?.moyenne_ms ? `Habituellement environ ${dureeMs(d.moyenne_ms)}.` : undefined };
  if (!d) return { niveau: 'off', titre: 'Offres : pas encore de synchro', detail: 'Aucune récupération depuis le démarrage du serveur.' };
  const temps = dureesSynchro(d);
  if (!d.ok) return { niveau: 'ko', titre: 'Récupération des offres en échec', detail: d.erreur, lignes: temps ? [temps] : undefined, quand: d.date };
  const sources = d.providers?.map(p => p.nom).join(', ');
  if (d.echecs?.length) return { niveau: 'warn', titre: 'Récupération partielle', detail: d.echecs.map(e => `${e.nom} : ${e.erreur}`).join(' '), lignes: temps ? [temps] : undefined, quand: d.date };
  return { niveau: 'ok', titre: 'Offres récupérées', detail: [sources && `via ${sources}`, d.enBase != null && `${d.enBase} en base`, d.stats?.nouvelles ? `${d.stats.nouvelles} nouvelle(s)` : ''].filter(Boolean).join(', '), lignes: temps ? [temps] : undefined, quand: d.date };
}

// ANCHOR: récit du passage d'analyse en cours (ligne 255) : étape, offre lue et depuis quand, résultat de la précédente, temps restant estimé
const DECLENCHEURS = { synchro: 'après la synchro', bouton: 'à votre demande', 'démarrage': 'au démarrage du serveur' };
function recitAnalyse(a, modele: string) {
  const pourquoi = DECLENCHEURS[a.declencheur] ? `Lancée ${DECLENCHEURS[a.declencheur]}${a.debut ? `, il y a ${dureeMs(Date.now() - Date.parse(a.debut))}` : ''}.` : '';
  const o = a.offre;
  if (a.etape !== 'lecture' || !o) {
    return { niveau: 'run', titre: `Analyse IA : démarrage du modèle${modele}`, lignes: [`Vérification que le modèle local répond${a.total ? `, ${a.total} offre(s) à lire` : ''}.`, pourquoi], progression: 0 };
  }
  const ecoule = Math.max(0, Date.now() - Date.parse(o.depuis));
  const p = a.precedente;
  // NOTE: tant qu'aucune offre n'est terminée, la durée habituelle des dernières analyses sert d'estimation
  const moyenne = a.duree_moyenne_ms || a.historique?.moyenne_ms;
  const reste = moyenne ? (a.total - o.rang) * moyenne + Math.max(0, moyenne - ecoule) : 0;
  return {
    niveau: 'run',
    titre: `Analyse IA : offre ${o.rang} sur ${a.total}${modele}`,
    lignes: [
      `Lecture de « ${o.titre} »${o.entreprise ? ` (${o.entreprise})` : ''} depuis ${dureeMs(ecoule)} : le modèle répond aux questions fermées en citant l'annonce${o.rang === 1 && !p ? ', première réponse plus lente le temps de charger le modèle en mémoire' : ''}.`,
      p && (p.ok ? `Précédente : « ${p.titre} », citations vérifiées et réponses enregistrées en ${dureeMs(p.duree_ms)}.` : `Précédente : « ${p.titre} », réponse illisible, ignorée (${p.erreur}).`),
      [`${a.faits} analysée(s)${a.echecs ? `, ${a.echecs} illisible(s)` : ''}`, moyenne && `environ ${dureeMs(moyenne)} par offre`, reste && `reste environ ${dureeMs(reste)}`].filter(Boolean).join(', ') + '.',
      pourquoi,
    ].filter(Boolean),
    progression: a.total ? (o.rang - 1) / a.total : 0,
  };
}

// ANCHOR: durées de l'analyse hors passage en cours : dernier passage (durée et temps par offre), moyenne des 50 dernières analyses du modèle, temps estimé pour les offres en attente
function lignesDurees(a): string[] | undefined {
  const d = a.dernier;
  const h = a.historique;
  const lignes = [
    d?.duree_ms && d.faits ? `Dernier passage : ${d.faits} offre(s) en ${dureeMs(d.duree_ms)}${d.moyenne_ms ? `, environ ${dureeMs(d.moyenne_ms)} par offre` : ''}.` : d?.duree_ms ? `Dernier passage arrêté après ${dureeMs(d.duree_ms)}.` : '',
    h ? `Moyenne : ${dureeMs(h.moyenne_ms)} par offre sur ${h.nombre > 1 ? `les ${h.nombre} dernières analyses` : 'la dernière analyse'}${a.restantes ? `, soit environ ${dureeMs(h.moyenne_ms * a.restantes)} pour les ${a.restantes} en attente` : ''}.` : '',
  ].filter(Boolean);
  return lignes.length ? lignes : undefined;
}

export function lireAnalyse(a) {
  if (!a) return null;
  const modele = a.modele ? ` (${a.modele})` : '';
  if (!a.actif) {
    return a.erreur
      ? { niveau: 'ko', titre: 'Analyse IA mal configurée', detail: a.erreur }
      : { niveau: 'off', titre: 'Analyse IA désactivée', detail: 'Ajouter ANALYSE_PROVIDER dans le .env pour l\'activer.' };
  }
  if (a.enCours) return recitAnalyse(a, modele);
  const d = a.dernier;
  const lignes = lignesDurees(a);
  if (d && !d.ok) return { niveau: 'ko', titre: `Analyse IA en échec${modele}`, detail: `${d.erreur}${d.faits ? ` ${d.faits} offre(s) analysée(s) avant l'arrêt.` : ''}`, lignes, quand: d.date };
  if (d?.echecs > 0) return { niveau: 'warn', titre: `Analyse IA partielle${modele}`, detail: `${d.echecs} réponse(s) illisible(s) sur ${d.total}, ${a.analysees} offre(s) analysée(s) au total`, lignes, quand: d.date };
  const titre = a.restantes ? `Analyse IA : ${a.restantes} offre(s) en attente${modele}` : `Analyse IA à jour${modele}`;
  return { niveau: 'ok', titre, detail: `${a.analysees} offre(s) analysée(s)`, lignes, quand: d?.date };
}

function Etat({ e, Icone }) {
  const Ico = ICONES[e.niveau] ?? Icone;
  return (
    <li className={'etat etat-' + e.niveau} role={e.niveau === 'ko' ? 'alert' : 'status'}>
      <span className="etat-icone" aria-hidden="true">{e.niveau === 'run' ? <span className="spinner" /> : <Ico size={16} />}</span>
      <span className="etat-texte">
        <span className="etat-titre"><b>{e.titre}</b>{e.quand && <span className="etat-quand">{heure(e.quand)}</span>}</span>
        {e.detail && <span className="etat-detail" title={e.detail}>{e.detail}</span>}
        {e.lignes?.map((l: string, i: number) => <span key={i} className="etat-detail" title={l}>{l}</span>)}
        {e.progression != null && <span className="etat-barre" aria-hidden="true"><span style={{ width: `${Math.round(e.progression * 100)}%` }} /></span>}
      </span>
    </li>
  );
}

const GRAVITE = { ko: 4, warn: 3, run: 2, ok: 1, off: 0 };
const COURT = { ok: 'à jour', warn: 'partielle', ko: 'en échec', run: 'en cours', off: 'inactive' };

// Pastille du résumé repliable : icône colorée et mot court
function Pastille({ e, Icone, nom }) {
  const Ico = ICONES[e.niveau] ?? Icone;
  return (
    <span className={'etat-pastille etat-' + e.niveau}>
      {e.niveau === 'run' ? <span className="spinner" /> : <Ico size={14} />}{nom} {COURT[e.niveau]}
    </span>
  );
}

// Deux lignes d'état : récupération des offres et analyse IA, chacune avec sa couleur (vert réussi, orange partiel, rouge échec, bleu en cours, gris inactif)
// `repliable` : un résumé d'une ligne, le détail s'ouvre au clic (le résumé prend la couleur du pire état) ; `info` s'ajoute en fin de résumé
export default function EtatTraitements({ synchro, enCoursSynchro, analyse, sansSynchro = false, repliable = false, info = '' }: any) {
  const a = lireAnalyse(analyse);
  const s = sansSynchro ? null : lireSynchro(synchro, enCoursSynchro);
  const liste = (
    <ul className="etats" aria-label="État des traitements">
      {s && <Etat e={s} Icone={CloudDownload} />}
      {a && <Etat e={a} Icone={Sparkles} />}
    </ul>
  );
  if (!repliable) return liste;
  const pire = ([s, a].filter(Boolean) as any[]).sort((x, y) => GRAVITE[y.niveau] - GRAVITE[x.niveau])[0];
  return (
    <details className={'etats-repli etat-' + (pire?.niveau ?? 'off')}>
      <summary title="Afficher le détail de la synchro et de l'analyse">
        {s && <Pastille e={s} Icone={CloudDownload} nom="Offres" />}
        {a && <Pastille e={a} Icone={Sparkles} nom="Analyse IA" />}
        {info && <span className="etats-info" role="status">{info}</span>}
      </summary>
      {liste}
    </details>
  );
}
