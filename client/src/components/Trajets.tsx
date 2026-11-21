import { Home, Plus, Route, Save, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { chargerTrajets, enregistrerTrajets } from '../api.ts';
import { geocoderAdresse } from '../geo.ts';
import { useHauteur } from '../useHauteur.ts';
import CarteZone from './CarteZone.tsx';
import Select from './Select.tsx';
import { SqCarte } from './Squelettes.tsx';

// NOTE: le message nomme ce qui a réellement changé (points de départ, coût du trajet, attentes de revenu)
const PARTIES_TRAJETS: [string, string[]][] = [
  ['points de départ', ['departs']],
  ['coût du trajet', ['carburant', 'prix_litre', 'conso_100', 'peage_km', 'jours_defaut']],
  ['attentes de revenu', ['attente_annuelle', 'tjm']],
];
const CARBURANTS = ['Gazole', 'SP95-E10', 'SP95', 'SP98', 'E85', 'GPL', 'Électrique'];

export type PointDepart = { nom: string; adresse: string; trouve: string; lat: number; lon: number };

// ANCHOR: partie Trajets et revenu du Profil (carte fusionnée, ligne 269) : points de départ et leur carte, puis la zone de recherche (milieu, qui reçoit les points enregistrés), puis coût du trajet et revenu attendu
// NOTE: un seul brouillon pour les deux cartes (kv trajets, serveur inchangé) : chaque carte a ses boutons, qui enregistrent tout ce qui a changé
export default function Trajets({ milieu }: { milieu?: (departs: PointDepart[]) => ReactNode }) {
  const [enregistre, setEnregistre] = useState<any>(null);
  const [brouillon, setBrouillon] = useState<any>(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [ou, setOu] = useState<'departs' | 'cout'>('departs');
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { chargerTrajets().then(d => { setEnregistre(d.trajets); setBrouillon(d.trajets); }).catch(e => setErreur(e.message)); }, []);
  // NOTE: hauteurs réelles des deux cartes mémorisées, reprises par leurs squelettes pour que rien ne bouge à l'arrivée des réglages
  const departsH = useHauteur('profil.trajets.departs', 720, Boolean(brouillon));
  const coutH = useHauteur('profil.trajets.cout', 420, Boolean(brouillon));
  const centre = milieu?.(enregistre?.departs ?? []);
  if (!brouillon) {
    if (erreur) return <div className="carte"><h3 className="carte-titre"><Route size={17} aria-hidden="true" />Trajets et revenu attendu</h3><p className="muted small">{erreur}</p></div>;
    return (
      <>
        <div className="sq-hauteur" style={{ minHeight: departsH.hauteur }}><SqCarte lignes={3} label="Chargement des trajets" /></div>
        {centre}
        <div className="sq-hauteur" style={{ minHeight: coutH.hauteur }}><SqCarte lignes={3} label="" /></div>
      </>
    );
  }

  const modifie = JSON.stringify(brouillon) !== JSON.stringify(enregistre);
  const maj = f => { setBrouillon(b => f(b)); setMessage(''); setErreur(''); };
  const changees = PARTIES_TRAJETS.filter(([, cles]) => cles.some(k => JSON.stringify(brouillon[k] ?? null) !== JSON.stringify(enregistre[k] ?? null))).map(([nom]) => nom);
  const sauver = async (depuis: 'departs' | 'cout') => {
    const quoi = changees.length ? changees.join(', ') : 'réglages';
    setOu(depuis); setOccupe(true); setErreur(''); setMessage('');
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
  const annuler = (depuis: 'departs' | 'cout') => { setOu(depuis); setBrouillon(enregistre); setErreur(''); setMessage('Modifications annulées.'); };
  const nombre = (cle: string, libelle: string, attributs: Record<string, string>, defaut?: number) => (
    <label className="field">{libelle}
      <input className="input" type="number" {...attributs} value={brouillon[cle] ?? defaut ?? ''} onChange={e => maj(b => ({ ...b, [cle]: e.target.value }))} />
    </label>
  );
  // NOTE: carburant choisi dans une liste ; une valeur saisie avant la liste reste proposée
  const carburants = brouillon.carburant && !CARBURANTS.includes(brouillon.carburant) ? [brouillon.carburant, ...CARBURANTS] : CARBURANTS;
  const actions = (depuis: 'departs' | 'cout') => (
    <>
      {ou === depuis && erreur && <p className="alert" role="alert">{erreur}</p>}
      {ou === depuis && message && <p className="small" role="status">{message}</p>}
      <div className="admin-actions">
        <button type="button" className="btn btn-primary small" onClick={() => sauver(depuis)} disabled={!modifie || occupe}><Save size={15} />Enregistrer</button>
        <button type="button" className="btn btn-ghost small" onClick={() => annuler(depuis)} disabled={!modifie || occupe}><Undo2 size={15} />Annuler</button>
        {modifie && <span className="warn small">Modifications non enregistrées : {changees.join(', ')}</span>}
      </div>
    </>
  );
  return (
    <>
      <div className="carte trajets-carte" ref={departsH.ref}>
        <h3 className="carte-titre"><Home size={17} aria-hidden="true" />Points de départ</h3>
        <p className="muted small">Vos lieux de départ (domicile, maison de famille). La fiche d'une offre affiche, depuis chacun, la distance par la route, la durée et le coût d'un aller-retour. Ils servent aussi de points de départ au score, dans la zone de recherche ci-dessous.</p>
        <div className="trajets-liste">
          {brouillon.departs.map((d, i) => (
            <div className="trajets-ligne" key={i}>
              <label className="field">Nom
                <input className="input" placeholder="Domicile" value={d.nom} onChange={e => maj(b => ({ ...b, departs: b.departs.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)) }))} />
              </label>
              <label className="field trajets-adresse">Adresse
                <input className="input" placeholder="12 rue des Lilas, 13001 Marseille" value={d.adresse} onChange={e => maj(b => ({ ...b, departs: b.departs.map((x, j) => (j === i ? { ...x, adresse: e.target.value } : x)) }))} />
                {d.trouve && d.adresse === enregistre.departs[i]?.adresse && <span className="muted small trajets-trouve">Trouvée : {d.trouve}</span>}
              </label>
              <button type="button" className="btn btn-ghost icon trajets-retirer" aria-label={`Retirer ${d.nom || 'ce point'}`} title="Retirer" onClick={() => maj(b => ({ ...b, departs: b.departs.filter((_, j) => j !== i) }))}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <div className="admin-actions">
          <button type="button" className="btn btn-ghost small" onClick={() => maj(b => ({ ...b, departs: [...b.departs, { nom: '', adresse: '', trouve: '', lon: 0, lat: 0 }] }))}><Plus size={15} />Ajouter un point de départ</button>
        </div>
        {actions('departs')}
        <CarteZone points={enregistre.departs.filter(d => d.lat || d.lon)} />
      </div>
      {centre}
      <div className="carte trajets-carte" ref={coutH.ref}>
        <h3 className="carte-titre"><Route size={17} aria-hidden="true" />Coût du trajet et revenu attendu</h3>
        <h4 className="admin-sous-titre">Coût du trajet</h4>
        <div className="trajets-champs">
          <div className="field">Carburant
            <Select value={brouillon.carburant} onChange={e => maj(b => ({ ...b, carburant: e.target.value }))} options={carburants.map(c => [c, c])} aria-label="Carburant" />
          </div>
          {nombre('prix_litre', 'Prix du litre (€)', { min: '0', max: '10', step: '0.01' })}
          {nombre('conso_100', 'Consommation (L/100 km)', { min: '0', max: '40', step: '0.1' })}
          {nombre('peage_km', 'Péage estimé (€ par km à péage)', { min: '0', max: '2', step: '0.01' }, 0.1)}
          {nombre('jours_defaut', 'Jours sur place par défaut', { min: '0', max: '400' }, 0)}
        </div>
        <p className="muted small">Le péage est estimé automatiquement : kilomètres d'autoroute à péage du trajet (calculés via Valhalla) × ce tarif. Sur une candidature, saisir un péage réel (Mappy, Vinci) pour un lieu remplace l'estimation. Les jours sur place préremplissent chaque nouveau lieu.</p>
        <h4 className="admin-sous-titre">Attentes de revenu</h4>
        <div className="trajets-champs">
          {nombre('attente_annuelle', 'Salaire brut annuel (€)', { min: '0', max: '1000000', step: '500' }, 0)}
          {nombre('tjm', 'TJM (€ par jour)', { min: '0', max: '10000', step: '10' }, 0)}
        </div>
        <p className="muted small">L'écart avec le salaire ou le TJM de chaque offre s'affiche à côté du salaire, du rouge (20 % en dessous ou plus) au vert (10 % au dessus ou plus). 0 désactive la comparaison.</p>
        {actions('cout')}
      </div>
    </>
  );
}
