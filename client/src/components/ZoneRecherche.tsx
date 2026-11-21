import { MapPin, Save, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ZoneRecherche as Zone } from '../../../types';
import { chargerZone, enregistrerZone } from '../api.ts';
import { DEPARTEMENTS } from '../departements.ts';
import { oublierZone } from '../geo.ts';
import { useHauteur } from '../useHauteur.ts';
import AideModale from './AideModale.tsx';
import MotsEditables from './MotsEditables.tsx';
import Select from './Select.tsx';
import { SqCarte } from './Squelettes.tsx';
import type { PointDepart } from './Trajets.tsx';

const POINT = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;
const CODE_DEP = /^(\d{2,3}|2A|2B)\b/i;
const AUTRE = '__autre';
const nomDep = (code: string) => DEPARTEMENTS[code] as string | undefined;
const coord = (d: PointDepart) => `${d.lat},${d.lon}`;
// NOTE: un point « latitude,longitude » correspond à un point de départ à environ 500 m près (coordonnées arrondies à la saisie)
const meme = (v: string, d: PointDepart) => { const [la, lo] = v.split(',').map(Number); return Math.abs(la - d.lat) < 0.005 && Math.abs(lo - d.lon) < 0.005; };

// ANCHOR: zone de recherche du profil (réglage « zone », v32) : zone « proche » (département et villes), points de départ du score, départements des distances, lieu bonus
// NOTE: affichée dans Profil > Trajets et revenu entre les points de départ et le coût du trajet ; departs = points de départ enregistrés, proposés dans les listes
export default function ZoneRecherche({ departs = [] }: { departs?: PointDepart[] }) {
  const [enregistre, setEnregistre] = useState<Zone | null>(null);
  const [brouillon, setBrouillon] = useState<Zone | null>(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [bonusLibre, setBonusLibre] = useState(false);
  useEffect(() => { chargerZone().then(d => { setEnregistre(d.reglage); setBrouillon(d.reglage); }).catch(e => setErreur(e.message)); }, []);
  // NOTE: hauteur réelle mémorisée, reprise par le squelette pour que rien ne bouge à l'arrivée de la zone
  const { ref, hauteur } = useHauteur('profil.zone', 520, Boolean(brouillon));
  const titre = <h3 className="carte-titre"><MapPin size={17} aria-hidden="true" />Zone de recherche<AideModale titre="Zone de recherche">
    <p>La zone sert au score des offres, propre à chaque profil :</p>
    <ul>
      <li>Département et villes proches : une offre située dans une de ces villes du département est marquée « proche » et gagne des points.</li>
      <li>Points de départ du score : la distance de chaque offre est calculée depuis le plus proche (à vol d'oiseau, majorée de 30 %).</li>
      <li>Départements des distances : communes chargées pour situer les offres ; vide, seul le département proche est chargé.</li>
      <li>Lieu bonus : facultatif, donne un petit bonus aux offres situées à 15 km ou moins.</li>
    </ul>
    <p>Les points de départ enregistrés plus haut se choisissent dans les listes. Un autre point s'écrit « latitude,longitude » (clic droit sur une carte en ligne pour le copier).</p>
  </AideModale></h3>;
  if (!brouillon || !enregistre) return erreur ? <div className="carte">{titre}<p className="muted small">{erreur}</p></div> : <div className="sq-hauteur" style={{ minHeight: hauteur }}><SqCarte lignes={3} label="Chargement de la zone" /></div>;

  const modifie = JSON.stringify(brouillon) !== JSON.stringify(enregistre);
  const maj = (f: (z: Zone) => Zone) => { setBrouillon(z => (z ? f(z) : z)); setMessage(''); setErreur(''); };
  const ajouter = (cle: 'villes_proches' | 'origines' | 'departements_distance', v: string) => maj(z => (z[cle].includes(v) ? z : { ...z, [cle]: [...z[cle], v] }));
  const retirer = (cle: 'villes_proches' | 'origines' | 'departements_distance') => (v: string) => maj(z => ({ ...z, [cle]: z[cle].filter(x => x !== v) }));
  const departDe = (v: string) => departs.find(d => meme(v, d))?.nom;
  // NOTE: département proche choisi dans la liste des départements ; un code saisi avant la liste reste proposé
  const optionsDep: [string, string][] = Object.entries(DEPARTEMENTS).map(([c, n]) => [c, `${c} ${n}`]);
  const depProche: [string, string][] = [['', 'Aucun'], ...(brouillon.departement_proche && !nomDep(brouillon.departement_proche) ? [[brouillon.departement_proche, brouillon.departement_proche] as [string, string]] : []), ...optionsDep];
  // NOTE: lieu bonus : aucun, un point de départ, ou un autre point saisi
  const bonusDepart = departs.find(d => meme(brouillon.lieu_bonus, d));
  const bonusChoix = bonusLibre || (brouillon.lieu_bonus && !bonusDepart) ? AUTRE : bonusDepart ? coord(bonusDepart) : '';
  const bonusOptions: [string, string][] = [['', 'Aucun'], ...departs.map(d => [coord(d), d.nom || coord(d)] as [string, string]), [AUTRE, 'Autre point (latitude,longitude)']];
  const manquants = departs.filter(d => !brouillon.origines.some(o => meme(o, d)));
  const sauver = async () => {
    setOccupe(true); setErreur(''); setMessage('');
    try {
      const r = await enregistrerZone(brouillon);
      oublierZone();
      setEnregistre(r.reglage); setBrouillon(r.reglage); setBonusLibre(false);
      setMessage(`Zone enregistrée${r.proches_modifiees ? ` : ${r.proches_modifiees} offre(s) changent de zone « proche », visibles au prochain rechargement des offres` : ''}.`);
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  return (
    <div className="carte zone-carte" ref={ref}>
      {titre}
      <h4 className="admin-sous-titre">Zone proche</h4>
      <div className="trajets-champs">
        <div className="field">Département proche
          <Select value={brouillon.departement_proche} onChange={e => maj(z => ({ ...z, departement_proche: e.target.value }))} options={depProche} aria-label="Département proche" />
        </div>
      </div>
      <div className="zone-liste">
        <span className="zone-liste-titre">Villes proches</span>
        <MotsEditables valeurs={brouillon.villes_proches} label="Ajouter une ville proche" placeholder="Ville" vide="Aucune ville proche."
          onAjout={t => ajouter('villes_proches', t.trim())} onRetrait={retirer('villes_proches')} />
      </div>
      <h4 className="admin-sous-titre">Distances</h4>
      <div className="zone-liste">
        <span className="zone-liste-titre">Points de départ du score</span>
        <MotsEditables valeurs={brouillon.origines} label="Ajouter un point de départ du score" placeholder="Choisir un point de départ ou saisir latitude,longitude" vide="Aucun point : la distance n'est pas calculée."
          options={departs.map(d => d.nom).filter(Boolean)} libelle={departDe}
          onAjout={t => {
            const d = departs.find(x => x.nom === t.trim());
            const v = d ? coord(d) : t.trim();
            if (!POINT.test(v)) { setErreur('Choisissez un point de départ de la liste, ou écrivez latitude,longitude (ex. 47.2184,-1.5536).'); return; }
            ajouter('origines', v);
          }} onRetrait={retirer('origines')} />
        {manquants.length > 0 && (
          <div className="admin-actions">
            <button type="button" className="btn btn-ghost small" onClick={() => maj(z => ({ ...z, origines: [...z.origines, ...manquants.map(coord)] }))}>Ajouter {manquants.length > 1 ? `les ${manquants.length} points de départ` : `« ${manquants[0].nom || 'le point de départ'} »`}</button>
          </div>
        )}
      </div>
      <div className="zone-liste">
        <span className="zone-liste-titre">Départements des distances</span>
        <MotsEditables valeurs={brouillon.departements_distance} label="Ajouter un département" placeholder="Choisir un département" vide="Aucun : seul le département proche est chargé."
          options={optionsDep.map(([, l]) => l)} libelle={nomDep}
          onAjout={t => {
            const code = CODE_DEP.exec(t.trim())?.[1]?.toUpperCase() ?? Object.entries(DEPARTEMENTS).find(([, n]) => String(n).toLowerCase() === t.trim().toLowerCase())?.[0];
            if (!code) { setErreur('Département attendu : choisissez-le dans la liste ou écrivez son code (ex. 44, 2A).'); return; }
            ajouter('departements_distance', code);
          }} onRetrait={retirer('departements_distance')} />
      </div>
      <div className="trajets-champs">
        <div className="field">Lieu bonus (facultatif)
          <Select value={bonusChoix} aria-label="Lieu bonus" options={bonusOptions}
            onChange={e => { const v = e.target.value; setBonusLibre(v === AUTRE); maj(z => ({ ...z, lieu_bonus: v === AUTRE ? (bonusDepart ? '' : z.lieu_bonus) : v })); }} />
        </div>
        {bonusChoix === AUTRE && (
          <label className="field">Coordonnées du lieu bonus
            <input className="input" placeholder="latitude,longitude" value={brouillon.lieu_bonus} onChange={e => maj(z => ({ ...z, lieu_bonus: e.target.value.trim() }))} />
          </label>
        )}
      </div>
      {erreur && <p className="alert" role="alert">{erreur}</p>}
      {message && <p className="small" role="status">{message}</p>}
      <div className="admin-actions">
        <button type="button" className="btn btn-primary small" onClick={sauver} disabled={!modifie || occupe}><Save size={15} />Enregistrer</button>
        <button type="button" className="btn btn-ghost small" onClick={() => { setBrouillon(enregistre); setBonusLibre(false); setErreur(''); setMessage('Modifications annulées.'); }} disabled={!modifie || occupe}><Undo2 size={15} />Annuler</button>
      </div>
    </div>
  );
}
