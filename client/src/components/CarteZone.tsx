import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { chargerOffres } from '../api.ts';
import { MARSEILLE_ARRONDISSEMENTS } from '../marseille.ts';
import { comptesArrondissements, fondCarte, ordinal } from '../carte.ts';

type Point = { nom: string; lat: number; lon: number };

// ANCHOR: carte interactive de la zone de recherche (Profil > Trajets et revenu), arrondissements de Marseille et points de départ enregistrés
export default function CarteZone({ points = [] }: { points?: Point[] }) {
  const el = useRef<any>(null);
  const [offres, setOffres] = useState<any>(null);

  useEffect(() => { chargerOffres().then(setOffres).catch(() => setOffres([])); }, []);

  // NOTE: clé stable des points, pour ne redessiner la carte que s'ils changent vraiment
  const clePoints = JSON.stringify(points.map(p => [p.nom, p.lat, p.lon]));
  useEffect(() => {
    if (offres === null) return undefined;
    const comptes = comptesArrondissements(offres);
    const max = Math.max(1, ...comptes.values());
    const carte = fondCarte(L.map(el.current, { scrollWheelZoom: true }));
    // NOTE: cadre autour des points de départ, sinon cadre large par défaut ; l'utilisateur zoome ensuite à volonté
    const pts: Point[] = JSON.parse(clePoints).map(([nom, lat, lon]) => ({ nom, lat, lon }));
    // NOTE: chaque point de départ est marqué et nommé en permanence ; le cadre s'étend pour les contenir
    for (const p of pts) L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#e65100', fillOpacity: 1 }).bindTooltip(p.nom || 'Point de départ', { permanent: true, direction: 'top', offset: [0, -8] }).addTo(carte);
    if (pts.length) carte.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon] as [number, number])).pad(0.6), { maxZoom: 11 });
    else carte.fitBounds([[43.10, 5.20], [43.75, 7.35]]);
    const couche = L.geoJSON(MARSEILLE_ARRONDISSEMENTS as any, {
      style: (f: any) => {
        const n = f.properties.n;
        return { color: '#00796b', weight: 1.2, fillColor: '#00796b', fillOpacity: comptes.get(n) ? 0.1 + 0.4 * ((comptes.get(n) ?? 0) / max) : 0.04 };
      },
      onEachFeature: (f, l) => l.bindTooltip(`Marseille ${ordinal(f.properties.n)} : ${comptes.get(f.properties.n) || 0} offre(s)`, { sticky: true }),
    }).addTo(carte);
    L.control.layers(undefined, { Arrondissements: couche }, { collapsed: false }).addTo(carte);
    return () => { carte.remove(); };
  }, [offres, clePoints]);

  return (
    <div className="carte-zone">
      <div ref={el} className="carte-leaflet carte-zone-carte" />
      <p className="carte-note">{points.length ? 'Points orange : vos points de départ. ' : ''}Les arrondissements de Marseille sont teintés selon le nombre d'offres actives. Molette ou boutons pour zoomer, glisser pour déplacer.</p>
    </div>
  );
}
