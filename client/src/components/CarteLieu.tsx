import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Maximize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { arrondissementMarseille, centreCommune } from '../geo.ts';
import { CENTRE_MARSEILLE, comptesArrondissements, creerCarte, ordinal } from '../carte.ts';
import { MARSEILLE_ARRONDISSEMENTS } from '../marseille.ts';

// ANCHOR: numéro d'arrondissement d'une ville "Marseille 7e Arrondissement" ou "MARSEILLE 07" (0 = Marseille sans précision, null = autre ville)
function Carte({ ville, dep, arr, offres, grande }: any) {
  const el = useRef<any>(null);
  const [indispo, setIndispo] = useState(false);

  useEffect(() => {
    let ok = true;
    const carte = creerCarte(el.current, grande);
    carte.setView(CENTRE_MARSEILLE, 11);

    if (arr !== null) {
      const comptes = comptesArrondissements(offres);
      const max = Math.max(1, ...comptes.values());
      const couche = L.geoJSON(MARSEILLE_ARRONDISSEMENTS as any, {
        style: (f: any) => {
          const n = f.properties.n;
          const actif = n === arr;
          return { color: actif ? '#111' : '#00796b', weight: actif ? 3 : 1.2, fillColor: '#00796b', fillOpacity: actif ? 0.55 : comptes.get(n) ? 0.08 + 0.3 * ((comptes.get(n) ?? 0) / max) : 0.03 };
        },
        onEachFeature: (f, l) => {
          const n = f.properties.n;
          l.bindTooltip(`Marseille ${ordinal(n)}: ${comptes.get(n) || 0} offre(s)`, { sticky: true });
        },
      }).addTo(carte);
      if (grande) L.control.layers(undefined, { Arrondissements: couche }, { collapsed: false }).addTo(carte);
      // NOTE: cadrage sur le plus grand morceau de l'arrondissement (le 7e inclut des îles du Frioul), sinon sur la ville sans les îles
      const feature = MARSEILLE_ARRONDISSEMENTS.features.find(f => f.properties.n === arr);
      const aire = r => Math.abs(r.reduce((t, q, i) => t + q[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * q[1], 0));
      const principal = (feature?.geometry.coordinates || []).map(p => p[0]).sort((u, v) => aire(v) - aire(u))[0];
      const plusGrand = principal && L.latLngBounds(principal.map(([x, y]) => [y, x]));
      carte.fitBounds(plusGrand ? plusGrand.pad(grande ? 1 : 0.9) : [[43.19, 5.28], [43.39, 5.54]]);
    } else {
      centreCommune(ville, dep).then(c => {
        if (!ok) return;
        if (!c) { setIndispo(true); return; }
        const pt: [number, number] = [c[1], c[0]];
        carte.setView(pt, 11);
        L.circleMarker(pt, { radius: 9, color: '#fff', weight: 2, fillColor: '#00796b', fillOpacity: 1 }).bindTooltip(ville).addTo(carte);
      });
    }
    // NOTE: la petite carte épouse la hauteur de la colonne de droite, qui change quand les trajets arrivent
    const suivi = new ResizeObserver(() => carte.invalidateSize());
    suivi.observe(el.current);
    return () => { ok = false; suivi.disconnect(); carte.remove(); };
  }, [ville, dep, arr, offres, grande]);

  return (
    <>
      <div ref={el} className={grande ? 'carte-leaflet carte-grande' : 'carte-leaflet'} hidden={indispo} />
      {arr === 0 && <p className="carte-note">Arrondissement non précisé dans l'annonce.</p>}
    </>
  );
}

function CarteModal({ ville, dep, arr, offres, onClose }) {
  const ref = useRef<any>(null);
  const [pret, setPret] = useState(false);
  // NOTE: la carte n'est créée qu'une fois la fenêtre affichée, sinon Leaflet mesure un conteneur de taille nulle
  useEffect(() => { ref.current.showModal(); setPret(true); }, []);
  return (
    <dialog ref={ref} className="dialog dialog-carte" onClose={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
      <header className="dialog-head">
        <h2>{ville}{arr ? ` (arrondissement ${arr})` : ''}</h2>
        <button type="button" className="btn btn-ghost icon" onClick={onClose} aria-label="Fermer" title="Fermer"><X size={16} /></button>
      </header>
      {pret && <Carte ville={ville} dep={dep} arr={arr} offres={offres} grande />}
    </dialog>
  );
}

// ANCHOR: petite carte de la fiche offre (colonne gauche du bloc de métadonnées dans Offres.tsx)
// petite carte de la fiche offre (Leaflet), grande carte en fenêtre au clic, couche des arrondissements pour Marseille
export default function CarteLieu({ offre, offres }) {
  const [ouverte, setOuverte] = useState(false);
  const ville = (offre.ville || '').trim();
  if (!ville) return null;
  const arr = arrondissementMarseille(ville);
  const requete = encodeURIComponent(`${ville} ${offre.departement || ''} France`.trim());
  return (
    <div className="carte-lieu">
      <div className="carte-petite">
        <Carte ville={ville} dep={offre.departement} arr={arr} offres={offres} />
        <button type="button" className="carte-agrandir" onClick={() => setOuverte(true)} aria-label="Agrandir la carte" title="Agrandir la carte"><Maximize2 size={14} /></button>
      </div>
      <a className="small" href={`https://www.openstreetmap.org/search?query=${requete}`} target="_blank" rel="noopener noreferrer">Ouvrir dans OpenStreetMap</a>
      {ouverte && <CarteModal ville={ville} dep={offre.departement} arr={arr} offres={offres} onClose={() => setOuverte(false)} />}
    </div>
  );
}
