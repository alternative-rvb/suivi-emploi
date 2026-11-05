import { CANAUX, MODES_ENVOI, SENT, STATUTS } from './constants.ts';
import { rapprocher } from './doublons.ts';
import { classer } from '../../lib/classement.mjs';

const ENVOYEES = new Set(['en_cours', 'entretien', 'sans_reponse', 'refuse', 'accepte']);

// ANCHOR: actions menées pour la recherche d'emploi (ligne 99), tirées du journal : une phrase par événement utile, partagée par le journal du jour de l'accueil et le bilan du Profil
export const RUBRIQUES = {
  candidature: 'Candidatures',
  echange: 'Échanges',
  tache: 'Tâches',
  offre: 'Offres',
  cv: 'CV et lettres',
  contact: 'Contacts',
  rendez_vous: 'Rendez-vous',
  profil: 'Profil',
};
export type Rubrique = keyof typeof RUBRIQUES;

export type Action = { id: number; ts: string; jour: string; rubrique: Rubrique; texte: string; libelle: string; candidature_id: string | null; offre_id: string | null; detail: string };

const PROFIL = { experience: 'Parcours mis à jour', formation: 'Diplômes ou titres enseignés mis à jour', competence: 'Compétences mises à jour', projet: 'Projets mis à jour' };

// NOTE: le libellé journalisé d'un échange vaut « canal sens » (email envoye, telephone recu)
// NOTE: un appel se passe, un message LinkedIn ou WhatsApp s'envoie, un message par une plateforme ou un autre canal reste un message
const SUJETS_ECHANGE = { telephone: ['Appel passé à', 'Appel reçu de'], whatsapp: ['Message WhatsApp envoyé à', 'Message WhatsApp reçu de'], linkedin: ['Message LinkedIn envoyé à', 'Message LinkedIn reçu de'], autre: ['Message envoyé à', 'Message reçu de'] };
export function phraseEchange(libelle: string) {
  const [canal, sens] = String(libelle ?? '').split(' ');
  const nom = CANAUX[canal] ?? 'Échange';
  if (canal === 'entretien') return 'Entretien';
  if (canal === 'plateforme' && (sens === 'envoye' || sens === 'recu')) return sens === 'envoye' ? "Message envoyé à l'employeur par la plateforme" : "Message reçu de l'employeur par la plateforme";
  const [envoye, recu] = SUJETS_ECHANGE[canal] ?? [`${nom} envoyé à`, `${nom} reçu de`];
  if (sens === 'envoye') return `${envoye} l'employeur`;
  if (sens === 'recu') return `${recu} l'employeur`;
  return canal === 'entretien' ? 'Entretien' : `Échange avec l'employeur (${nom.toLowerCase()})`;
}

// Phrase et rubrique d'un événement, ou null pour ce qui n'est pas une action de recherche (suppressions, champs techniques)
// NOTE: cand sert aux créations antérieures au statut journalisé : envoyée si elle l'est aujourd'hui et datée du jour de création
export function phraseAction(e, cand: any = null): { rubrique: Rubrique; texte: string } | null {
  if (e.action === 'suppression') return null;
  if (e.entite in PROFIL) return { rubrique: 'profil', texte: PROFIL[e.entite] };
  if (e.entite === 'cv') return e.action === 'creation' ? { rubrique: 'cv', texte: 'CV généré' } : null;
  if (e.entite === 'cv_reference') return e.action === 'creation' ? { rubrique: 'cv', texte: 'CV de référence importé' } : null;
  // NOTE: lettre de motivation (ligne 178) : commencée puis exportée ; les réécritures successives ne sont pas des actions de plus
  if (e.entite === 'lettre') return e.action === 'creation' ? { rubrique: 'cv', texte: 'Lettre de motivation commencée' } : null;
  if (e.entite === 'lettre_version') return e.action === 'creation' ? { rubrique: 'cv', texte: 'Lettre de motivation exportée' } : null;
  // NOTE: rendez-vous (ligne 121) : l'ajout et un report (date ou heure) comptent comme actions de recherche
  if (e.entite === 'rendez_vous') {
    if (e.action === 'creation') return { rubrique: 'rendez_vous', texte: 'Rendez-vous ajouté' };
    return e.champ === 'debut' ? { rubrique: 'rendez_vous', texte: 'Rendez-vous déplacé' } : null;
  }
  // NOTE: contacts (ligne 119) : seuls l'ajout et une offre ou une candidature reliée comptent comme une action de recherche
  if (e.entite === 'contact') {
    if (e.action === 'creation') return { rubrique: 'contact', texte: 'Contact ajouté' };
    if (e.champ !== 'offres' && e.champ !== 'candidatures') return null;
    const compte = v => String(v ?? '').split(', ').filter(Boolean).length;
    return compte(e.apres) > compte(e.avant) ? { rubrique: 'contact', texte: e.champ === 'offres' ? 'Contact relié à une offre' : 'Contact relié à une candidature' } : null;
  }
  if (e.entite === 'echange') return e.action === 'creation' ? { rubrique: 'echange', texte: phraseEchange(e.libelle) } : null;
  if (e.entite === 'tache') {
    if (e.action === 'creation') return { rubrique: 'tache', texte: 'Tâche prévue' };
    return e.champ === 'faite' && e.apres === '1' ? { rubrique: 'tache', texte: 'Tâche faite' } : null;
  }
  if (e.entite === 'offre') {
    if (e.action === 'creation') return { rubrique: 'offre', texte: 'Offre saisie à la main' };
    const texte = { vue: e.apres === '1' && 'Offre consultée', ignoree: e.apres === '1' && 'Offre écartée', expiree: e.apres === '1' && 'Offre signalée expirée', description: e.apres && 'Notes sur une offre' }[e.champ];
    return texte ? { rubrique: 'offre', texte } : null;
  }
  if (e.entite === 'candidature') {
    if (e.action === 'consultation') return { rubrique: 'candidature', texte: 'Candidature consultée' };
    if (e.action === 'creation') {
      const envoyee = e.champ === 'statut' ? ENVOYEES.has(e.apres) : Boolean(cand && ENVOYEES.has(cand.statut) && cand.date === e.jour);
      return { rubrique: 'candidature', texte: envoyee ? 'Candidature envoyée' : 'Candidature créée' };
    }
    if (e.champ === 'statut' && e.apres === 'en_cours' && !ENVOYEES.has(e.avant)) return { rubrique: 'candidature', texte: 'Candidature envoyée' };
    const texte = {
      statut: `Statut : ${STATUTS[e.apres]?.label ?? e.apres}`,
      lettre: e.apres === '1' ? 'Lettre de motivation préparée' : '',
      mode_envoi: e.apres ? `Envoi : ${e.apres}` : '',
      plateforme: e.apres ? `Plateforme : ${e.apres}` : '',
      cv: e.apres ? 'CV joint à la candidature' : '',
      offre_id: e.apres ? 'Offre liée à la candidature' : '',
      lieux: 'Trajets étudiés',
      lien: e.apres ? 'Lien de candidature noté' : '',
      raison_echec: e.apres ? 'Motif de refus noté' : '',
    }[e.champ] ?? 'Candidature mise à jour';
    return texte ? { rubrique: 'candidature', texte } : null;
  }
  return null;
}

// ANCHOR: événements du journal (du plus récent au plus ancien) en actions, une seule par jour pour une même phrase sur un même élément (le profil compte une fois par jour et par partie)
export function actionsMenees(evenements: any[], { candidatures = [], taches = [], echanges = [] }: { candidatures?: any[]; taches?: any[]; echanges?: any[] } = {}): Action[] {
  const cands = new Map(candidatures.map(c => [String(c.id), c]));
  const candDe = new Map<string, string>([...taches, ...echanges].filter(x => x.candidature_id).map(x => [`${'canal' in x ? 'echange' : 'tache'}|${x.id}`, String(x.candidature_id)]));
  const parOffre = new Map<string, string>(candidatures.filter(c => c.offre_id).map(c => [String(c.offre_id), String(c.id)]));
  const vues = new Set<string>();
  const liste: Action[] = [];
  for (const e of evenements) {
    // NOTE: une action sur une offre suivie rejoint sa candidature, pour que l'historique d'une offre soit complet
    const cid = e.entite === 'candidature' ? String(e.entite_id) : e.entite === 'offre' ? parOffre.get(String(e.entite_id)) ?? null : candDe.get(`${e.entite}|${e.entite_id}`) ?? null;
    const cand = cid ? cands.get(cid) : null;
    const p = phraseAction(e, cand);
    if (!p) continue;
    const cle = `${e.jour}|${p.rubrique === 'profil' ? '' : `${e.entite}|${e.entite_id}`}|${p.texte}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    const offre_id = e.entite === 'offre' ? String(e.entite_id) : cand?.offre_id ? String(cand.offre_id) : null;
    // NOTE: une tâche garde son titre, un échange prend le nom de la candidature (son libellé ne dit que le canal)
    const libelle = p.rubrique === 'profil' ? ''
      : e.entite === 'echange' ? (cand ? [cand.entreprise, cand.poste].filter(Boolean).join(', ') : '')
      : e.entite === 'tache' && cand ? `${e.libelle} (${cand.entreprise})`
      : e.libelle ?? '';
    liste.push({ id: e.id, ts: e.ts, jour: e.jour, rubrique: p.rubrique, texte: p.texte, libelle, candidature_id: cand ? cid : null, offre_id, detail: e.entite === 'tache' ? e.libelle ?? '' : '' });
  }
  return liste;
}

// NOTE: résumé court d'un intitulé : texte avant la coupure (parenthèse, virgule), sans guillemet orphelin
const court = (t, coupe: string) => {
  const r = String(t ?? '').split(coupe)[0].trim();
  return (r.match(/"/g) ?? []).length % 2 ? r.replace(/"/g, '') : r;
};
// NOTE: plateforme en clair, texte libre réduit à son premier mot-clé (« Glassdoor (candidature facile) » donne « Glassdoor »)
const plateformeCourte = (t: string) => court(String(t ?? '').split(',')[0], ' (');

// NOTE: n° d'offre : offre liée ou retrouvée (hors saisie manuelle), sinon numéro écrit dans la candidature (« offre n° 7898699 », « réf. 215FLRD ») pour une annonce absente de la base
const RE_NUMERO = /(?:n°|numéro|num\.?|réf\.?|référence|offre)\s*[:#]?\s*([A-Z0-9]{6,10})\b/i;
function numeroOffre(c, offre) {
  const id = String(offre?.id_offre ?? c.offre_id ?? '');
  if (id && !id.startsWith('man-')) return id;
  const m = [c.poste, c.description, c.notes, c.plateforme].join(' ').match(RE_NUMERO);
  return m && /\d/.test(m[1]) ? m[1].toUpperCase() : '';
}

const TYPES_RDV = { telephone: 'téléphone', visio: 'visio', sur_place: 'sur place', autre: 'autre' };

export type LigneRecherche = { date: string; texte: string; resultat: string; periode: boolean };
export type BlocRecherche = {
  id: string; date: string; employeur: string; poste: string; numero: string; plateforme: string;
  lieu: string; contrat: string; envoi: string; statut: string; metier: string; lignes: LigneRecherche[];
  anterieure: boolean; entretien: boolean;
  reponse: boolean; echanges: number; delai: number | null;
};

// NOTE: statuts qui sont une réponse de l'employeur (Sans réponse n'en est pas une)
const REPONSES = new Set(['entretien', 'refuse', 'accepte']);
const JOUR_MS = 86400000;

// ANCHOR: recherche d'emploi (Profil > Bilan) : ce qui a été fait pour chaque employeur, à quel moment et avec quel résultat
// NOTE: candidatures envoyées dont la date tombe dans [du, au], de la plus récente à la plus ancienne ; chaque bloc liste toutes ses actions datées, même postérieures à la période
// NOTE: une candidature envoyée avant la période y figure aussi (anterieure) dès qu'une action tombe dans [du, au], même écartée ensuite si son historique montre l'envoi
// NOTE: le suivi vient des échanges et rendez-vous en base (antérieurs au journal compris) ; le journal ne fournit que l'historique des statuts, qui donne le résultat à chaque date
export function rechercheEmploi(etat: any, offres: any[], evenements: any[], du: string, au: string): BlocRecherche[] {
  const offs = new Map((offres ?? []).map(o => [String(o.id_offre), o]));
  // NOTE: offre d'une candidature sans lien explicite : numéro écrit dans la candidature et retrouvé en base (rapprocher, niveaux lien et numero seulement)
  const { parCandidature } = rapprocher(offres ?? [], etat.candidatures ?? []);
  const statutLabel = (s: string) => STATUTS[s]?.label ?? s ?? '';
  const dans = (d: string) => d >= du && d <= au;
  return (etat.candidatures ?? [])
    .filter(c => c.date && c.date <= au)
    .map(c => {
      const id = String(c.id);
      // NOTE: historique des statuts du journal, du plus ancien au plus récent
      const statuts = evenements
        .filter(e => e.entite === 'candidature' && String(e.entite_id) === id && e.champ === 'statut' && e.apres)
        .sort((a, b) => a.ts.localeCompare(b.ts));
      return { c, statuts };
    })
    .filter(({ c, statuts }) => {
      if (c.date >= du) return SENT.includes(c.statut);
      const envoyee = SENT.includes(c.statut) || statuts.some(e => ENVOYEES.has(e.apres));
      const id = String(c.id);
      const active = (etat.echanges ?? []).some(x => String(x.candidature_id) === id && x.date && dans(x.date))
        || (etat.rendez_vous ?? []).some(x => String(x.candidature_id) === id && x.debut && dans(x.debut.slice(0, 10)))
        || statuts.some(e => dans(e.jour));
      return envoyee && active;
    })
    .sort((a, b) => b.c.date.localeCompare(a.c.date) || String(a.c.entreprise).localeCompare(String(b.c.entreprise)))
    .map(({ c, statuts }) => {
      const id = String(c.id);
      const offre = (c.offre_id ? offs.get(String(c.offre_id)) : null) ?? parCandidature.get(c.id) ?? null;
      const statutAu = (jour: string) => {
        const avant = statuts.filter(e => e.jour <= jour);
        // NOTE: la candidature est envoyée dès sa date : un « À faire » journalisé avant le passage à En cours ne vaut pas résultat
        if (avant.length) return avant[avant.length - 1].apres === 'a_faire' && jour >= c.date ? 'en_cours' : avant[avant.length - 1].apres;
        // NOTE: avant le premier changement journalisé, la candidature est simplement envoyée ; sans aucun historique, seul le statut actuel est connu
        return statuts.length ? 'en_cours' : c.statut;
      };
      const envoi = MODES_ENVOI[c.mode_envoi] ?? '';
      const siens = (etat.echanges ?? []).filter(x => String(x.candidature_id) === id && x.date);
      // NOTE: première réponse : échange reçu, entretien, rendez-vous ou passage à Entretien, Refusé ou Accepté ; délai en jours depuis l'envoi
      const reponses = [
        ...siens.filter(x => x.sens === 'recu' || x.canal === 'entretien').map(x => x.date),
        ...(etat.rendez_vous ?? []).filter(x => String(x.candidature_id) === id && x.debut).map(x => x.debut.slice(0, 10)),
        ...statuts.filter(e => REPONSES.has(e.apres)).map(e => e.jour),
      ].filter(d => d >= c.date).sort();
      const delai = reponses.length ? Math.round((Date.parse(reponses[0]) - Date.parse(c.date)) / JOUR_MS) : null;
      // NOTE: un entretien ou un rendez-vous a pour résultat l'entretien, même si le statut n'est passé à Entretien que le lendemain
      const lignes: (Omit<LigneRecherche, 'periode'> & { ordre: string; rdv?: boolean })[] = [
        { date: c.date, ordre: `${c.date}T00`, texte: envoi ? `Candidature envoyée (${envoi.toLowerCase()})` : 'Candidature envoyée', resultat: '' },
        ...siens
          .map(x => ({ date: x.date, ordre: `${x.date}T${x.heure || '12:00'}`, texte: phraseEchange(`${x.canal} ${x.sens}`), resultat: '', rdv: x.canal === 'entretien' })),
        ...(etat.rendez_vous ?? []).filter(x => String(x.candidature_id) === id && x.debut)
          .map(x => ({ date: x.debut.slice(0, 10), ordre: x.debut, texte: `Rendez-vous${TYPES_RDV[x.type] ? ` (${TYPES_RDV[x.type]})` : ''}`, resultat: '', rdv: true })),
        // NOTE: le passage à En cours est l'envoi lui-même, déjà en première ligne
        ...statuts.filter(e => e.apres !== 'en_cours' && e.apres !== 'a_faire')
          .map(e => ({ date: e.jour, ordre: `${e.jour}T${e.ts.slice(11, 16)}`, texte: `Statut : ${statutLabel(e.apres)}`, resultat: '' })),
      ];
      return {
        id,
        date: c.date,
        employeur: offre ? court(offre.entreprise, ' (') : court(c.entreprise, ' ('),
        poste: offre ? court(offre.titre, ' (') : court(court(c.poste, ' ('), ','),
        numero: numeroOffre(c, offre),
        plateforme: plateformeCourte(c.plateforme || offre?.source || ''),
        lieu: offre ? String(offre.ville || offre.lieu || '') : '',
        contrat: offre ? String(offre.contrat || '') : '',
        envoi,
        statut: statutLabel(c.statut),
        // NOTE: métier de l'offre liée ou retrouvée, sinon déduit de l'intitulé du poste (même classement que la synchro)
        metier: String(offre?.categorie || classer(c.poste)),
        lignes: lignes.sort((a, b) => a.ordre.localeCompare(b.ordre)).map(({ date, texte, rdv }) => {
          const s = statutAu(date);
          return { date, texte, resultat: statutLabel(rdv && (s === 'en_cours' || s === 'a_faire') ? 'entretien' : s), periode: dans(date) };
        }),
        anterieure: c.date < du,
        // NOTE: entretien obtenu sur la période : entretien ou rendez-vous daté dans [du, au], ou passage au statut Entretien
        entretien: lignes.some(l => l.rdv && dans(l.date)) || statuts.some(e => e.apres === 'entretien' && dans(e.jour)),
        reponse: reponses.length > 0 || REPONSES.has(c.statut),
        echanges: siens.length,
        delai,
      };
    });
}

// ANCHOR: statistiques par métier du bilan (ligne 222) : réponses, entretiens, échanges moyens et délai moyen de première réponse ; dernière ligne = total (metier vide)
export type StatMetier = { metier: string; candidatures: number; reponses: number; entretiens: number; echanges: number; delai: number | null };
export function statsMetier(blocs: BlocRecherche[]): StatMetier[] {
  const calcul = (metier: string, liste: BlocRecherche[]): StatMetier => {
    const delais = liste.map(b => b.delai).filter((d): d is number => d !== null);
    return {
      metier,
      candidatures: liste.length,
      reponses: liste.filter(b => b.reponse).length,
      entretiens: liste.filter(b => b.entretien).length,
      echanges: liste.reduce((n, b) => n + b.echanges, 0) / (liste.length || 1),
      delai: delais.length ? delais.reduce((n, d) => n + d, 0) / delais.length : null,
    };
  };
  const parMetier = new Map<string, BlocRecherche[]>();
  for (const b of blocs) parMetier.set(b.metier, [...(parMetier.get(b.metier) ?? []), b]);
  const lignes = [...parMetier].map(([m, l]) => calcul(m, l)).sort((a, b) => b.candidatures - a.candidatures || a.metier.localeCompare(b.metier));
  return blocs.length ? [...lignes, calcul('', blocs)] : [];
}
// NOTE: valeurs affichées, communes au PDF et à l'écran : taux en %, moyenne à une décimale, délai en jours (tiret si aucune réponse)
const taux = (n: number, sur: number) => `${Math.round((n / (sur || 1)) * 100)} %`;
export const COLONNES_STATS = ['Candidatures', 'Réponses', 'Taux de réponse', 'Entretiens', "Taux d'entretien", 'Échanges par candidature', 'Délai de 1re réponse'];
export const valeursStat = (s: StatMetier) => [
  String(s.candidatures), String(s.reponses), taux(s.reponses, s.candidatures), String(s.entretiens), taux(s.entretiens, s.candidatures),
  s.echanges.toFixed(1).replace('.', ','), s.delai === null ? '-' : `${Math.round(s.delai)} j`,
];

// ANCHOR: journal complet (Profil > Bilan) : chaque ligne du journal, sans exclusion ni dédoublonnage, avec une phrase lisible quand elle existe
const RUBRIQUES_JOURNAL = {
  candidature: 'Candidatures', offre: 'Offres', tache: 'Tâches', echange: 'Échanges', contact: 'Contacts', rendez_vous: 'Rendez-vous',
  cv: 'CV et lettres', cv_reference: 'CV et lettres', lettre: 'CV et lettres', lettre_version: 'CV et lettres',
  experience: 'Profil', formation: 'Profil', competence: 'Profil', projet: 'Profil',
  reglage: 'Réglages', signature: 'Réglages', competence_ignoree: 'Réglages', profil: 'Réglages',
};
const ACTIONS_JOURNAL = { creation: 'Création', modification: 'Modification', suppression: 'Suppression', consultation: 'Consultation' };

export type LigneJournal = { id: number; ts: string; jour: string; rubrique: string; element: string; action: string; avant: string; apres: string };

export function lignesJournal(evenements: any[]): LigneJournal[] {
  return evenements.map(e => {
    const phrase = phraseAction(e)?.texte;
    const base = ACTIONS_JOURNAL[e.action] ?? e.action;
    return {
      id: e.id,
      ts: e.ts,
      jour: e.jour,
      rubrique: RUBRIQUES_JOURNAL[e.entite] ?? 'Autres',
      element: e.libelle ?? '',
      action: phrase ?? (e.champ ? `${base} : ${e.champ}` : base),
      avant: e.avant ?? '',
      apres: e.apres ?? '',
    };
  });
}
