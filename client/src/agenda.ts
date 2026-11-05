import type { EvenementAgenda, RendezVous } from '../../types.js';
import { heureParis } from '../../lib/fuseau.mjs';
import { ajouterJours } from './utils.ts';

export { heureParis };

// ANCHOR: logique pure de l'agenda (ligne 121) : éléments affichables, jours des vues, placement des chevauchements. Testée dans tests/agenda-grille.test.mjs
// NOTE: heures en heure de Paris, AAAA-MM-JJTHH:MM ; un RDV de 1440 minutes à 00:00 vaut une journée entière (événement de journée rattaché)

export type ElementAgenda = {
  cle: string;
  rdv: RendezVous | null;
  externe: EvenementAgenda | null;
  titre: string;
  jour: string;
  debut: string;
  fin: string;
  minutesDebut: number;
  minutesFin: number;
  journee: boolean;
  lieu: string;
  visio: string;
  lien: string;
};

// ANCHOR: élément terminé (jour passé, ou aujourd'hui avec une heure de fin dépassée) : estompé dans l'Agenda et le mini-calendrier
// NOTE: maintenant au format HH:MM, heure locale ; un événement sur la journée entière n'est passé qu'à partir du lendemain
export const estPasse = (e: Pick<ElementAgenda, 'jour' | 'fin' | 'journee'>, auj: string, maintenant: string) => e.jour < auj || (e.jour === auj && !e.journee && e.fin < maintenant);

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function elementDeRdv(r: RendezVous): ElementAgenda {
  const jour = r.debut.slice(0, 10);
  const debut = r.debut.slice(11, 16);
  const journee = debut === '00:00' && r.duree >= 1440;
  const finMinutes = minutes(debut) + r.duree;
  return {
    cle: 'r:' + r.id, rdv: r, externe: null, titre: r.titre || 'Rendez-vous', jour, debut, fin: hhmm(finMinutes), minutesDebut: minutes(debut), minutesFin: Math.min(finMinutes, 1440),
    journee, lieu: r.lieu, visio: r.lien_visio, lien: '',
  };
}

export function elementExterne(e: EvenementAgenda): ElementAgenda {
  if (e.journee) {
    return { cle: 'g:' + e.id, rdv: null, externe: e, titre: e.titre, jour: e.debut.slice(0, 10), debut: '00:00', fin: '23:59', minutesDebut: 0, minutesFin: 1440, journee: true, lieu: e.lieu, visio: e.visio, lien: e.lien };
  }
  const d = heureParis(e.debut);
  const f = heureParis(e.fin);
  const jour = d.slice(0, 10);
  // NOTE: un événement qui finit un autre jour est coupé à minuit dans la grille
  const fin = f.slice(0, 10) === jour ? f.slice(11, 16) : '23:59';
  return { cle: 'g:' + e.id, rdv: null, externe: e, titre: e.titre, jour, debut: d.slice(11, 16), fin, minutesDebut: minutes(d.slice(11, 16)), minutesFin: f.slice(0, 10) === jour ? Math.max(minutes(fin), minutes(d.slice(11, 16)) + 5) : 1440, journee: false, lieu: e.lieu, visio: e.visio, lien: e.lien };
}

// ANCHOR: tout ce qui s'affiche : les RDV locaux (annulés écartés), puis les événements Google non rattachés
export function elementsAgenda(rdvs: RendezVous[], evenements: EvenementAgenda[] = []): ElementAgenda[] {
  const locaux = rdvs.filter(r => r.synchro !== 'annule').map(elementDeRdv);
  const externes = evenements.filter(e => !e.rdv).map(elementExterne);
  return [...locaux, ...externes].sort((a, b) => a.jour.localeCompare(b.jour) || Number(b.journee) - Number(a.journee) || a.minutesDebut - b.minutesDebut || a.titre.localeCompare(b.titre));
}

export function parJour(elements: ElementAgenda[]) {
  const m = new Map<string, ElementAgenda[]>();
  for (const e of elements) m.set(e.jour, [...(m.get(e.jour) ?? []), e]);
  return m;
}

// --- Jours des vues ---
const jourDeSemaine = (jour: string) => (new Date(jour + 'T12:00:00').getDay() + 6) % 7; // 0 = lundi

export const lundi = (jour: string) => ajouterJours(jour, -jourDeSemaine(jour));
export const joursSemaine = (jour: string) => Array.from({ length: 7 }, (_, i) => ajouterJours(lundi(jour), i));

// NOTE: grille du mois, toujours six semaines complètes (42 jours) pour que la hauteur ne saute pas d'un mois à l'autre
export function joursMois(jour: string) {
  const premier = jour.slice(0, 8) + '01';
  return Array.from({ length: 42 }, (_, i) => ajouterJours(lundi(premier), i));
}
export const memeMois = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

export function decaler(vue: 'jour' | 'semaine' | 'mois', jour: string, sens: -1 | 1) {
  if (vue === 'jour') return ajouterJours(jour, sens);
  if (vue === 'semaine') return ajouterJours(jour, 7 * sens);
  // NOTE: le jour du mois est conservé (ramené à la fin du mois si besoin) pour que le passage Mois vers Semaine ou Jour reste sur la même période
  const [a, m, j] = jour.split('-').map(Number);
  const dernier = new Date(Date.UTC(a, m + sens, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + sens, Math.min(j, dernier))).toISOString().slice(0, 10);
}

// Période à demander à Google pour une vue : [du, au] inclus
export function periode(vue: 'jour' | 'semaine' | 'mois', jour: string): [string, string] {
  if (vue === 'jour') return [jour, jour];
  if (vue === 'semaine') { const j = joursSemaine(jour); return [j[0], j[6]]; }
  const j = joursMois(jour);
  return [j[0], j[41]];
}

// ANCHOR: placement des chevauchements d'une journée : chaque élément reçoit une colonne et le nombre de colonnes de son groupe de chevauchement (largeur = 1 / colonnes)
export function placer(elements: ElementAgenda[]) {
  const tries = elements.filter(e => !e.journee).sort((a, b) => a.minutesDebut - b.minutesDebut || b.minutesFin - a.minutesFin);
  const resultat: { element: ElementAgenda; colonne: number; colonnes: number }[] = [];
  let groupe: typeof resultat = [];
  let finGroupe = -1;
  const fermer = () => { for (const g of groupe) g.colonnes = Math.max(...groupe.map(x => x.colonne)) + 1; resultat.push(...groupe); groupe = []; };
  const finsColonnes: number[] = [];
  for (const e of tries) {
    if (groupe.length && e.minutesDebut >= finGroupe) { fermer(); finsColonnes.length = 0; finGroupe = -1; }
    let c = finsColonnes.findIndex(f => f <= e.minutesDebut);
    if (c === -1) c = finsColonnes.length;
    finsColonnes[c] = e.minutesFin;
    groupe.push({ element: e, colonne: c, colonnes: 1 });
    finGroupe = Math.max(finGroupe, e.minutesFin);
  }
  fermer();
  return resultat;
}

// NOTE: heures affichées par les grilles Jour et Semaine : 8 h à 20 h par défaut, élargies si un élément sort de cette plage
export function plageHeures(elements: ElementAgenda[], defaut: [number, number] = [8, 20]): [number, number] {
  let [h0, h1] = defaut;
  for (const e of elements) {
    if (e.journee) continue;
    h0 = Math.min(h0, Math.floor(e.minutesDebut / 60));
    h1 = Math.max(h1, Math.ceil(e.minutesFin / 60));
  }
  return [h0, Math.min(h1, 24)];
}
