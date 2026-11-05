import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { chargerOffres } from '../api.ts';
import { MARSEILLE_ARRONDISSEMENTS } from '../marseille.ts';
import { comptesArrondissements, fondCarte, ordinal } from '../carte.ts';

// ANCHOR: carte interactive de la zone de recherche (onglet Profil), arrondissements de Marseille
export default function CarteZone() {
  const el = useRef<any>(null);
  const [offres, setOffres] = useState<any>(null);

  useEffect(() => { chargerOffres().then(setOffres).catch(() => setOffres([])); }, []);

  useEffect(() => {
    if (offres === null) return undefined;
    let ok = true;
    const comptes = comptesArrondissements(offres);
    const max = Math.max(1, ...comptes.values());
    const carte = fondCarte(L.map(el.current, { scrollWheelZoom: true }));
    // NOTE: cadre large de Marseille à Nice, l'utilisateur zoome ensuite à volonté
    carte.fitBounds([[43.10, 5.20], [43.75, 7.35]]);
    const couche = L.geoJSON(MARSEILLE_ARRONDISSEMENTS as any, {
      style: (f: any) => {
        const n = f.properties.n;
        return { color: '#00796b', weight: 1.2, fillColor: '#00796b', fillOpacity: comptes.get(n) ? 0.1 + 0.4 * ((comptes.get(n) ?? 0) / max) : 0.04 };
      },
      onEachFeature: (f, l) => l.bindTooltip(`Marseille ${ordinal(f.properties.n)} : ${comptes.get(f.properties.n) || 0} offre(s)`, { sticky: true }),
    }).addTo(carte);
    L.control.layers(undefined, { Arrondissements: couche }, { collapsed: false }).addTo(carte);
    return () => { ok = false; carte.remove(); };
  }, [offres]);

  return (
    <div className="carte-zone">
      <div ref={el} className="carte-leaflet carte-zone-carte" />
      <p className="carte-note">Les arrondissements sont teintés selon le nombre d'offres actives. Molette ou boutons pour zoomer, glisser pour déplacer.</p>
    </div>
  );
}
