import { useEffect, useState } from 'react';

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// NOTE: jour local (en-CA donne AAAA-MM-JJ), toISOString renverrait la date UTC, encore la veille après minuit
export const aujourdhui = () => new Date().toLocaleDateString('en-CA');
export const maintenant = () => new Date().toTimeString().slice(0, 5);

export function nouvelId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// NOTE: minuscules sans accents, définie une seule fois dans lib/texte.mjs
export { norm } from '../../lib/texte.mjs';

// Ligne de détail d'une offre : entreprise, ville, contrat, salaire, date
export const detailOffre = o => [o.entreprise || 'Employeur non indiqué', o.ville && `${o.ville} (${o.departement})`, o.contrat, formaterSalaire(o.salaire), fmtDate(o.date_detection)]
  .filter(Boolean).join(' · ');

export function formaterSalaire(s) {
  if (!s) return '';
  // La base contient souvent un montant brut annuel sans unité (ex. 35000)
  return /^\d+(\.\d+)?$/.test(s) ? Number(s).toLocaleString('fr-FR') + ' € / an' : s;
}

// ANCHOR: sécurité, n'ouvre jamais qu'une adresse http(s) (un lien javascript: ou data: devient vide)
// ANCHOR: lien de recherche Google Maps d'une adresse ou d'un lieu (ouvert dans un nouvel onglet), vide si le texte est vide
export const lienMaps = (lieu?: string | null) => {
  // NOTE: les précisions entre parenthèses (accès piéton, étage...) gênent la recherche, elles sont retirées de la requête
  const q = (lieu ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
};

export const lienSur = (lien?: string | null) => (typeof lien === 'string' && /^https?:\/\/\S+$/i.test(lien.trim()) ? lien.trim() : '');

// Date ISO décalée de n jours
export function ajouterJours(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Valeurs distinctes non vides, triées, pour alimenter une liste de suggestions
export const distinctes = (liste: any[], cle: string, extra: string[] = []) => [...new Set([...extra, ...liste.map(x => x[cle]).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'fr'));

// Nombre de jours entre deux dates ISO (positif si b est après a)
export const joursEntre = (a, b) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 864e5);

// NOTE: écran assez large pour afficher liste et détail côte à côte (même seuil que style.css)
export const ecranLarge = () => window.matchMedia('(min-width: 961px)').matches;

// ANCHOR: état mémorisé dans le navigateur (filtres, élément ouvert) pour retrouver chaque onglet tel qu'on l'a laissé
export function useMemoire(cle, defaut) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem('suivi.' + cle); return s === null ? defaut : JSON.parse(s); } catch { return defaut; }
  });
  useEffect(() => { try { localStorage.setItem('suivi.' + cle, JSON.stringify(v)); } catch { /* stockage indisponible : rien à mémoriser */ } }, [cle, v]);
  return [v, setV];
}
