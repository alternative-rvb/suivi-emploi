import { Clock, Fuel, House, Route } from 'lucide-react';
import { useEffect, useState } from 'react';
import { KM_LONG_TRAJET } from '../constants.ts';
import { centreArrondissement, centreCommune, itineraire, kmPeage } from '../geo.ts';
import { arrondissementMarseille } from '../geo.ts';
import { duree } from '../format.ts';
import { coutCarburant, peageEstime } from '../trajets.ts';

// ANCHOR: distance par la route, durée et coût carburant d'un aller-retour par jour depuis un point de départ (sans péage)
export default function TrajetOffre({ offre, depart, coutKm, tarifPeage = 0 }: any) {
  const [res, setRes] = useState<any>(undefined);
  useEffect(() => {
    let ok = true;
    setRes(undefined);
    const arr = arrondissementMarseille(offre.ville);
    (arr ? Promise.resolve(centreArrondissement(arr)) : centreCommune(offre.ville, offre.departement))
      .then(dest => (dest ? Promise.all([itineraire([depart.lon, depart.lat], dest), kmPeage([depart.lon, depart.lat], dest)]) : null))
      .then(r => { if (ok) setRes(r ? { ...r[0], kmPeage: r[1] } : null); });
    return () => { ok = false; };
  }, [offre.ville, offre.departement, depart.lon, depart.lat]);
  const peage = peageEstime(res?.kmPeage, tarifPeage);
  return (
    <div className="meta-trajet">
      <dt><House size={12} />Depuis {depart.nom}</dt>
      <dd>
        {res === undefined ? <span className="muted">Calcul...</span> : res === null ? <span className="muted">Indisponible</span> : (
          <span className={'trajet-valeurs' + (res.km > KM_LONG_TRAJET ? ' long' : '')} title={res.estime ? 'Service d\'itinéraire indisponible: distance à vol d\'oiseau majorée de 30%' : 'Itinéraire par la route (OSRM)'}>
            <span><Route size={13} />{res.estime ? '~' : ''}{Math.round(res.km)} km</span>
            {res.min != null && <span><Clock size={13} />{duree(res.min)}</span>}
            <span title={peage > 0 ? `Carburant ${Math.round(coutCarburant(res.km, coutKm))} € + péage estimé ${Math.round(peage)} € (${Math.round(res.kmPeage)} km à péage), aller-retour sur une journée` : 'Carburant, aller-retour sur une journée (aucun péage détecté)'}><Fuel size={13} />{peage > 0 ? '~' : ''}{Math.round(res.km * 2 * coutKm + peage)}€ par jour</span>
          </span>
        )}
      </dd>
    </div>
  );
}
