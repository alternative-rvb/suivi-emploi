import { Plus, Route, Save, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { chargerTrajets, enregistrerTrajets } from '../api.ts';
import { geocoderAdresse } from '../geo.ts';
import { useHauteur } from '../useHauteur.ts';
import { SqCarte } from './Squelettes.tsx';

// NOTE: le message nomme ce qui a réellement changé (points de départ, coût du trajet, attentes de revenu)
const PARTIES_TRAJETS: [string, string[]][] = [
  ['points de départ', ['departs']],
  ['coût du trajet', ['carburant', 'prix_litre', 'conso_100', 'peage_km', 'jours_defaut']],
  ['attentes de revenu', ['attente_annuelle', 'tjm']],
];

// ANCHOR: partie Trajets et revenu du Profil (avant dans Admin) : points de départ, coût du kilomètre et revenu attendu, propres à l'utilisateur (kv trajets, serveur inchangé)
export default function Trajets() {
  const [enregistre, setEnregistre] = useState<any>(null);
  const [brouillon, setBrouillon] = useState<any>(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { chargerTrajets().then(d => { setEnregistre(d.trajets); setBrouillon(d.trajets); }).catch(e => setErreur(e.message)); }, []);
  // NOTE: hauteur réelle mémorisée, reprise par le squelette pour que rien ne bouge à l'arrivée des réglages
  const { ref, hauteur } = useHauteur('profil.trajets', 640, Boolean(brouillon));
  if (!brouillon) return erreur ? <div className="carte"><h3 className="carte-titre"><Route size={17} aria-hidden="true" />Trajets et revenu attendu</h3><p className="muted small">{erreur}</p></div> : <div className="sq-hauteur" style={{ minHeight: hauteur }}><SqCarte lignes={3} label="Chargement des trajets" /></div>;

  const modifie = JSON.stringify(brouillon) !== JSON.stringify(enregistre);
  const maj = f => { setBrouillon(b => f(b)); setMessage(''); setErreur(''); };
  const changees = PARTIES_TRAJETS.filter(([, cles]) => cles.some(k => JSON.stringify(brouillon[k] ?? null) !== JSON.stringify(enregistre[k] ?? null))).map(([nom]) => nom);
  const sauver = async () => {
    const quoi = changees.length ? changees.join(', ') : 'réglages';
    setOccupe(true); setErreur(''); setMessage('');
    try {
      // NOTE: les coordonnées sont retrouvées à partir de la commune quand elle a changé
      const departs: any[] = [];
      for (const d of brouillon.departs) {
        const avant = enregistre.departs.find(e => e.nom === d.nom && e.adresse === d.adresse);
        if (avant) { departs.push(avant); continue; }
        const c = await geocoderAdresse(d.adresse);
        if (!c) throw new Error(`Adresse introuvable : ${d.adresse}. Précisez la rue, le code postal et la ville.`);
        departs.push({ ...d, trouve: c.label, lon: c.lon, lat: c.lat });
      }
      // NOTE: le péage est estimé automatiquement, plus de valeur par défaut à saisir (peage_jour à 0)
      const r = await enregistrerTrajets({ departs, carburant: brouillon.carburant, prix_litre: Number(brouillon.prix_litre), conso_100: Number(brouillon.conso_100), peage_km: Number(brouillon.peage_km ?? 0.1),
        attente_annuelle: Number(brouillon.attente_annuelle ?? 0), tjm: Number(brouillon.tjm ?? 0), peage_jour: 0, jours_defaut: Number(brouillon.jours_defaut) || 0 });
      setEnregistre(r.trajets); setBrouillon(r.trajets); setMessage(`Enregistré : ${quoi.charAt(0).toUpperCase() + quoi.slice(1)}.`);
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  const nombre = (cle: string, libelle: string, attributs: Record<string, string>, defaut?: number) => (
    <label className="field trajets-cout">{libelle}
      <input className="input" type="number" {...attributs} value={brouillon[cle] ?? defaut ?? ''} onChange={e => maj(b => ({ ...b, [cle]: e.target.value }))} />
    </label>
  );
  return (
    <div className="carte" ref={ref}>
      <h3 className="carte-titre"><Route size={17} aria-hidden="true" />Trajets et revenu attendu</h3>
      <h4 className="admin-sous-titre">Points de départ</h4>
      <p className="muted small">La fiche d'une offre affiche, depuis chaque point de départ, la distance par la route, la durée et le coût d'un aller-retour par jour de présence (carburant : consommation × prix du litre, plus un péage estimé, sans usure). Le trajet part de l'adresse saisie et arrive au centre de la commune de l'offre.</p>
      <div className="trajets-liste">
        {brouillon.departs.map((d, i) => (
          <div className="trajets-ligne" key={i}>
            <input className="input" aria-label="Nom du point de départ" placeholder="Nom (Domicile)" value={d.nom} onChange={e => maj(b => ({ ...b, departs: b.departs.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)) }))} />
            <span className="trajets-adresse">
              <input className="input" aria-label="Adresse" placeholder="Adresse (12 rue des Lilas, 13001 Marseille)" value={d.adresse} onChange={e => maj(b => ({ ...b, departs: b.departs.map((x, j) => (j === i ? { ...x, adresse: e.target.value } : x)) }))} />
              {d.trouve && d.adresse === enregistre.departs[i]?.adresse && <span className="muted small">Trouvée : {d.trouve}</span>}
            </span>
            <button type="button" className="btn btn-ghost icon" aria-label={`Retirer ${d.nom || 'ce point'}`} title="Retirer" onClick={() => maj(b => ({ ...b, departs: b.departs.filter((_, j) => j !== i) }))}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="admin-actions">
        <button type="button" className="btn btn-ghost small" onClick={() => maj(b => ({ ...b, departs: [...b.departs, { nom: '', adresse: '', trouve: '', lon: 0, lat: 0 }] }))}><Plus size={15} />Ajouter un point de départ</button>
      </div>
      <h4 className="admin-sous-titre">Coût du trajet</h4>
      <div className="admin-actions trajets-carburant">
        <label className="field trajets-cout">Carburant
          <input className="input" value={brouillon.carburant} onChange={e => maj(b => ({ ...b, carburant: e.target.value }))} />
        </label>
        {nombre('prix_litre', 'Prix du litre (€)', { min: '0', max: '10', step: '0.01' })}
        {nombre('conso_100', 'Consommation (L/100 km)', { min: '0', max: '40', step: '0.1' })}
        {nombre('peage_km', 'Péage estimé (€ par km à péage)', { min: '0', max: '2', step: '0.01' }, 0.1)}
        {nombre('jours_defaut', 'Jours sur place par défaut', { min: '0', max: '400' }, 0)}
      </div>
      <p className="muted small">Le péage est estimé automatiquement : kilomètres d'autoroute à péage du trajet (calculés via Valhalla) × ce tarif. Sur une candidature, saisir un péage réel (Mappy, Vinci) pour un lieu remplace l'estimation. Les jours sur place préremplissent chaque nouveau lieu.</p>

      <h4 className="admin-sous-titre">Attentes de revenu</h4>
      <div className="admin-actions trajets-carburant">
        {nombre('attente_annuelle', 'Salaire brut annuel (€)', { min: '0', max: '1000000', step: '500' }, 0)}
        {nombre('tjm', 'TJM (€ par jour)', { min: '0', max: '10000', step: '10' }, 0)}
      </div>
      <p className="muted small">L'écart avec le salaire ou le TJM de chaque offre s'affiche à côté du salaire, du rouge (20 % en dessous ou plus) au vert (10 % au dessus ou plus). 0 désactive la comparaison.</p>
      {erreur && <p className="alert" role="alert">{erreur}</p>}
      {message && <p className="small" role="status">{message}</p>}
      <div className="admin-actions">
        <button type="button" className="btn btn-primary small" onClick={sauver} disabled={!modifie || occupe}><Save size={15} />Enregistrer</button>
        <button type="button" className="btn btn-ghost small" onClick={() => { setBrouillon(enregistre); setErreur(''); setMessage('Modifications annulées.'); }} disabled={!modifie || occupe}><Undo2 size={15} />Annuler</button>
      </div>
    </div>
  );
}
