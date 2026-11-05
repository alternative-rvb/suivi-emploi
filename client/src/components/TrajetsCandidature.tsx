import { ExternalLink, MapPin, Plus, Route, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { chargerTrajets } from '../api.ts';
import { KM_LONG_TRAJET } from '../constants.ts';
import { centreArrondissement, centreCommune, geocoderAdresse, itineraireTrace, kmPeage } from '../geo.ts';
import { lienMaps, nouvelId } from '../utils.ts';
import { duree, eur } from '../format.ts';
import { coutCarburant, coutKm as coutKmDe, peageEstime } from '../trajets.ts';
import BlocRepliable from './BlocRepliable.tsx';
import { arrondissementMarseille } from '../geo.ts';
import TrajetOffre from './TrajetOffre.tsx';
import CarteTrajets, { COULEURS_DEPART } from './CarteTrajets.tsx';


// ANCHOR: trajets d'une candidature vers un ou plusieurs lieux de travail libres (champ lieux). Départs, prix du litre et consommation viennent de /api/trajets, comme pour les offres.
// Coût par jour = (km aller-retour × consommation ÷ 100 × prix du litre) + péage saisi ; total = jours × coût par jour
export default function TrajetsCandidature({ c, majC, offre }) {
  const lieux = useMemo(() => c.lieux ?? [], [c.lieux]);
  const [trajets, setTrajets] = useState<any>(null);
  const [resultats, setResultats] = useState<Record<string, any>>({});
  const [messages, setMessages] = useState<Record<string, any>>({});

  useEffect(() => { chargerTrajets().then(d => setTrajets(d.trajets)).catch(() => {}); }, []); // NOTE: facultatif, sans réponse le tableau reste vide
  const departs = useMemo(() => trajets?.departs ?? [], [trajets]);
  const coutKm = coutKmDe(trajets);

  // NOTE: le calcul ne repart que si un point (départ ou lieu) change, pas à chaque frappe dans un autre champ
  const signature = departs.map(d => `${d.nom}:${d.lon},${d.lat}`).join(';') + '|' + lieux.map(l => `${l.id}:${l.lon},${l.lat}`).join(';');
  useEffect(() => {
    let ok = true;
    const paires = departs.flatMap(d => lieux.filter(l => l.lat != null).map(l => ({ d, l })));
    Promise.all(paires.map(({ d, l }) => Promise.all([itineraireTrace([d.lon, d.lat], [l.lon, l.lat]), kmPeage([d.lon, d.lat], [l.lon, l.lat])]).then(([res, kp]) => [`${l.id}|${d.nom}`, { ...res, kmPeage: kp }])))
      .then(r => { if (ok) setResultats(Object.fromEntries(r)); });
    return () => { ok = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la signature résume departs et lieux
  }, [signature]);

  const majLieux = f => majC({ lieux: f(lieux) });
  const majLieu = (id, champs) => majLieux(l => l.map(x => (x.id === id ? { ...x, ...champs } : x)));

  const localiser = async (l, adresse) => {
    setMessages(m => ({ ...m, [l.id]: 'Recherche de l\'adresse...' }));
    try {
      const r = adresse ? await geocoderAdresse(adresse) : null;
      majLieu(l.id, r ? { adresse, lon: r.lon, lat: r.lat } : { adresse, lon: null, lat: null });
      setMessages(m => ({ ...m, [l.id]: adresse ? (r ? `Trouvé : ${r.label}` : 'Adresse introuvable, précisez la rue et la ville.') : '' }));
    } catch (e) {
      setMessages(m => ({ ...m, [l.id]: e.message }));
    }
  };

  const ajouterVide = () => majLieux(l => [...l, { id: nouvelId(), nom: 'Nouveau lieu', adresse: '', lon: null, lat: null, jours: trajets?.jours_defaut ?? 0, peage: trajets?.peage_jour ?? 0 }]);
  const ajouterOffre = async () => {
    const arr = arrondissementMarseille(offre.ville);
    const centre = arr ? centreArrondissement(arr) : await centreCommune(offre.ville, offre.departement);
    majLieux(l => [...l, { id: nouvelId(), nom: offre.ville, adresse: offre.ville, lon: centre?.[0] ?? null, lat: centre?.[1] ?? null, jours: trajets?.jours_defaut ?? 0, peage: trajets?.peage_jour ?? 0 }]);
  };

  const lignes = useMemo(() => {
    const l = lieux.filter(x => x.lat != null).flatMap(lieu => departs.map(depart => {
      const res = resultats[`${lieu.id}|${depart.nom}`];
      if (!res) return { lieu, depart, res: null };
      const carburant = coutCarburant(res.km, coutKm);
      // NOTE: un péage saisi à la main (> 0) prime, sinon estimation : km à péage aller-retour × tarif au km (Admin)
      const estime = !(lieu.peage > 0) && res.kmPeage != null;
      const peage = lieu.peage > 0 ? lieu.peage : peageEstime(res.kmPeage, trajets?.peage_km ?? 0);
      const parJour = carburant + peage;
      return { lieu, depart, res, carburant, peage, peageEstime: estime && peage > 0, parJour, total: lieu.jours * parJour };
    }));
    // NOTE: le moins cher se juge sur le total quand des jours sont saisis, sinon sur le coût par jour
    const mesure = x => (x.lieu.jours > 0 ? x.total : x.parJour);
    const pret = l.filter(x => x.res);
    const meilleur = pret.length > 1 ? pret.reduce((a, b) => (mesure(b) < mesure(a) ? b : a)) : null;
    return l.map(x => ({ ...x, meilleur: x === meilleur }));
  }, [lieux, departs, resultats, coutKm]);

  const traces = useMemo(() => lignes.filter(x => x.res).map(x => ({ depart: x.depart.nom, lieu: x.lieu.id, res: x.res })), [lignes]);
  const choisi = lignes.find(x => x.meilleur) || lignes.find(x => x.res);
  const resume = !lieux.length ? 'Aucun lieu'
    : choisi ? `${choisi.lieu.nom} depuis ${choisi.depart.nom} · ${choisi.lieu.jours > 0 ? `${eur(choisi.total)} au total` : `${eur(choisi.parJour)} par jour`}${choisi.meilleur ? ' (le moins cher)' : ''}`
      : '';

  return (
    <BlocRepliable id="trajets" titre="Trajets" Icone={Route} pastille={lieux.length > 0 && <span className="count">{lieux.length}</span>} resume={resume}>
      <p className="muted small">Ajoutez les lieux où se déroulerait la mission : le coût du trajet est calculé depuis chaque point de départ. Sans lieu, le trajet vers la ville de l'offre liée est affiché.</p>

      {lieux.length > 0 && (
        <ul className="lieux">
          {lieux.map(l => (
            <li key={l.id} className="lieu">
              <div className="lieu-tete">
                <MapPin size={15} aria-hidden="true" />
                <input className="input input-nu" defaultValue={l.nom} aria-label="Nom du lieu" onBlur={e => { const v = e.target.value.trim(); if (!v) e.target.value = l.nom; else if (v !== l.nom) majLieu(l.id, { nom: v }); }} />
                <button type="button" className="btn btn-ghost small icon" onClick={() => majLieux(x => x.filter(y => y.id !== l.id))} aria-label={`Supprimer ${l.nom}`} title="Supprimer ce lieu"><Trash2 size={14} /></button>
              </div>
              <div className="ajout-ligne">
                <input className="input" defaultValue={l.adresse} placeholder="Adresse ou commune (la carte et les trajets en dépendent)" aria-label={`Adresse de ${l.nom}`}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== l.adresse || (v && l.lat == null)) localiser(l, v); }} />
                {(l.adresse || l.nom) && <a className="btn btn-ghost small icon" href={lienMaps(l.adresse || l.nom)} target="_blank" rel="noopener noreferrer" title="Voir sur Google Maps" aria-label={`Voir ${l.nom} sur Google Maps`}><ExternalLink size={14} /></a>}
              </div>
              <div className="lieu-nombres">
                <label className="field">Jours sur place
                  <input className="input cell" type="number" min="0" max="400" defaultValue={l.jours} onBlur={e => { const v = Math.min(400, Math.max(0, Number(e.target.value) || 0)); e.target.value = String(v); if (v !== l.jours) majLieu(l.id, { jours: v }); }} />
                </label>
                <label className="field">Péage aller-retour par jour (€), 0 pour l'estimation automatique
                  <input className="input cell" type="number" min="0" max="500" step="0.1" defaultValue={l.peage} onBlur={e => { const v = Math.min(500, Math.max(0, Number(e.target.value) || 0)); e.target.value = String(v); if (v !== l.peage) majLieu(l.id, { peage: v }); }} />
                </label>
              </div>
              {messages[l.id] && <p className="muted small" role="status">{messages[l.id]}</p>}
              {l.lat == null && !messages[l.id] && <p className="warn small">Lieu non localisé : saisissez une adresse.</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="ajout-ligne">
        <button type="button" className="btn btn-ghost small" onClick={ajouterVide}><Plus size={14} />Ajouter un lieu</button>
        {offre?.ville && !lieux.some(l => l.nom === offre.ville) && <button type="button" className="btn btn-ghost small" onClick={ajouterOffre}><Plus size={14} />Ville de l'offre : {offre.ville}</button>}
      </div>

      {offre?.ville && lieux.length === 0 && departs.length > 0 && (
        <dl className="meta-offre">
          <div className="meta-trajets">
            {departs.map(d => <TrajetOffre key={d.nom} offre={offre} depart={d} coutKm={coutKm} tarifPeage={trajets?.peage_km ?? 0} />)}
          </div>
        </dl>
      )}

      {lignes.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table table-trajets">
              <thead>
                <tr><th>Lieu</th><th>Depuis</th><th>Distance</th><th>Durée</th><th>Carburant</th><th>Péage</th><th>Par jour</th><th>Total</th></tr>
              </thead>
              <tbody>
                {lignes.map(({ lieu, depart, res, carburant, peage, peageEstime, parJour, total, meilleur }) => (
                  <tr key={lieu.id + depart.nom} className={meilleur ? 'meilleur' : ''}>
                    <td>{lieu.nom}</td>
                    <td><span className="pastille-depart" style={{ background: COULEURS_DEPART[departs.indexOf(depart) % COULEURS_DEPART.length] }} aria-hidden="true" />{depart.nom}</td>
                    {res ? (
                      <>
                        <td className={res.km > KM_LONG_TRAJET ? 'long' : ''} title={res.km > KM_LONG_TRAJET ? `Plus de ${KM_LONG_TRAJET} km à l'aller` : res.estime ? 'Service d\'itinéraire indisponible : distance à vol d\'oiseau majorée de 30 %' : 'Itinéraire par la route (OSRM)'}>{res.estime ? '~' : ''}{Math.round(res.km)} km</td>
                        <td>{duree(res.min) || '-'}</td>
                        <td>{eur(carburant)}</td>
                        <td title={peageEstime ? `Estimation : ${Math.round(res.kmPeage)} km à péage × 2 × ${String(trajets.peage_km).replace('.', ',')} €/km` : lieu.peage > 0 ? 'Saisi à la main' : 'Aucun péage détecté'}>{peageEstime ? '~' : ''}{eur(peage)}</td>
                        <td>{eur(parJour)}</td>
                        <td><b>{lieu.jours > 0 ? eur(total) : '-'}</b></td>
                      </>
                    ) : <td colSpan={6} className="muted">Calcul...</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            {lignes.some(x => x.meilleur) && 'La ligne en vert est le trajet le moins cher. '}Par jour = (km aller-retour × consommation ÷ 100 × prix du litre) + péage, avec {trajets.prix_litre.toString().replace('.', ',')} € le litre et {trajets.conso_100} L aux 100 km (réglables dans Admin). L'usure du véhicule et les autres frais ne sont pas inclus.
          </p>
          <CarteTrajets departs={departs} lieux={lieux} traces={traces} />
        </>
      )}
    </BlocRepliable>
  );
}
