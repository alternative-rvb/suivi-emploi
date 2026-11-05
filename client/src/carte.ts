import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { arrondissementMarseille } from './geo.ts';

// ANCHOR: briques communes des cartes Leaflet (fond OpenStreetMap, carte figée ou libre, comptes par arrondissement)
export const CENTRE_MARSEILLE: [number, number] = [43.2965, 5.3698];

export const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

// NOTE: la politique d'usage des tuiles OSM exige un Referer et une attribution visible, sinon les tuiles reviennent en 403 « Access blocked » ;
// la page est en no-referrer (server.mjs), seules les tuiles envoient l'origine (jamais le chemin)
export function fondCarte(carte: L.Map) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'strict-origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(carte);
  return carte;
}

// NOTE: la petite carte est figée (un clic ouvre la grande), la grande se manipule librement
export function creerCarte(el: HTMLElement, grande: boolean) {
  if (grande) return fondCarte(L.map(el, { scrollWheelZoom: true }));
  // NOTE: attribution en bas à gauche, le bouton d'agrandissement occupe le coin droit
  const carte = L.map(el, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, attributionControl: false });
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(carte);
  return fondCarte(carte);
}

// Nombre d'offres actives par arrondissement de Marseille, pour teinter la couche
export function comptesArrondissements(offres: any[] | null) {
  const c = new Map<number, number>();
  for (const o of offres || []) {
    if (o.ignoree) continue;
    const n = arrondissementMarseille(o.ville);
    if (n) c.set(n, (c.get(n) || 0) + 1);
  }
  return c;
}
