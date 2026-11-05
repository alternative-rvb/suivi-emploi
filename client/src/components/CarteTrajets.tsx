import L from 'leaflet';
import { CENTRE_MARSEILLE, creerCarte } from '../carte.ts';
import 'leaflet/dist/leaflet.css';
import { Maximize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// ANCHOR: une couleur par point de départ (palette Material), reprise dans la légende du tableau
export const COULEURS_DEPART = ['#1976d2', '#e65100', '#7b1fa2', '#00796b', '#c2185b', '#455a64'];

function Carte({ departs, lieux, traces, grande }: any) {
  const el = useRef<any>(null);

  useEffect(() => {
    // NOTE: mêmes options que CarteLieu : petite carte figée (un clic ouvre la grande), grande carte manipulable
    const carte = creerCarte(el.current, grande);
    carte.setView(CENTRE_MARSEILLE, 9);

    const points: [number, number][] = [];
    departs.forEach((d, i) => {
      const p: [number, number] = [d.lat, d.lon];
      points.push(p);
      L.circleMarker(p, { radius: 7, color: '#fff', weight: 2, fillColor: COULEURS_DEPART[i % COULEURS_DEPART.length], fillOpacity: 1 }).bindTooltip(d.nom).addTo(carte);
    });
    lieux.filter(l => l.lat != null).forEach(l => {
      const p: [number, number] = [l.lat, l.lon];
      points.push(p);
      L.circleMarker(p, { radius: 9, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1 }).bindTooltip(l.nom, { permanent: grande, direction: 'top' }).addTo(carte);
    });
    for (const { depart, lieu, res } of traces) {
      const i = departs.findIndex(d => d.nom === depart);
      const couleur = COULEURS_DEPART[i % COULEURS_DEPART.length];
      const l = lieux.find(x => x.id === lieu);
      // NOTE: sans tracé (service d'itinéraire indisponible), un trait pointillé relie les deux points
      const ligne = res?.trace || (l && departs[i] ? [[departs[i].lat, departs[i].lon], [l.lat, l.lon]] : null);
      if (ligne) L.polyline(ligne, { color: couleur, weight: 4, opacity: 0.8, dashArray: res?.trace ? undefined : '6 8' }).addTo(carte);
    }
    if (points.length) carte.fitBounds(L.latLngBounds(points).pad(0.25));

    const suivi = new ResizeObserver(() => carte.invalidateSize());
    suivi.observe(el.current);
    return () => { suivi.disconnect(); carte.remove(); };
  }, [departs, lieux, traces, grande]);

  return <div ref={el} className={grande ? 'carte-leaflet carte-grande' : 'carte-leaflet'} />;
}

function CarteModal({ onClose, ...props }) {
  const ref = useRef<any>(null);
  const [pret, setPret] = useState(false);
  // NOTE: la carte n'est créée qu'une fois la fenêtre affichée, sinon Leaflet mesure un conteneur de taille nulle
  useEffect(() => { ref.current.showModal(); setPret(true); }, []);
  return (
    <dialog ref={ref} className="dialog dialog-carte" onClose={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
      <header className="dialog-head">
        <h2>Trajets</h2>
        <button type="button" className="btn btn-ghost icon" onClick={onClose} aria-label="Fermer" title="Fermer"><X size={16} /></button>
      </header>
      {pret && <Carte {...props} grande />}
    </dialog>
  );
}

// Carte des trajets : points de départ, lieux de travail et itinéraires (un trait par départ et par lieu)
export default function CarteTrajets({ departs, lieux, traces }) {
  const [ouverte, setOuverte] = useState(false);
  if (!lieux.some(l => l.lat != null)) return null;
  return (
    <div className="carte-lieu">
      <div className="carte-petite">
        <Carte departs={departs} lieux={lieux} traces={traces} />
        <button type="button" className="carte-agrandir" onClick={() => setOuverte(true)} aria-label="Agrandir la carte" title="Agrandir la carte"><Maximize2 size={14} /></button>
      </div>
      {ouverte && <CarteModal departs={departs} lieux={lieux} traces={traces} onClose={() => setOuverte(false)} />}
    </div>
  );
}
