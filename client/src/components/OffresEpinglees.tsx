import { Bookmark, BookmarkMinus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { SqCarte } from './Squelettes.tsx';
import { useMemoire } from '../utils.ts';
import { majOffre } from '../api.ts';

const delai = j => (j <= 1 ? "Dernier jour" : `${j} jours pour agir`);

// ANCHOR: offres épinglées (14 jours à partir de l'épinglage), les plus urgentes en tête. Sans action (candidature, offre écartée) l'épingle tombe seule côté serveur.
// NOTE: le bloc disparaît quand rien n'est épinglé, désépingler passe par l'API comme dans l'onglet Offres
export default function OffresEpinglees({ offres, chargees, ouvrirOffre, setOffres }) {
  const epinglees = useMemo(() => offres
    .filter(o => o.epinglee && !o.ignoree)
    .sort((a, b) => (a.jours_epingle ?? 0) - (b.jours_epingle ?? 0) || (b.date_detection || '').localeCompare(a.date_detection || '')), [offres]);

  // NOTE: le nombre d'offres épinglées est mémorisé : tant que les offres chargent, un squelette tient la place de la carte (et de la colonne qu'elle occupe à côté de l'agenda) si la dernière visite en avait
  const [memo, setMemo] = useMemoire('auj.epinglees', 1);
  useEffect(() => { if (chargees && epinglees.length !== memo) setMemo(epinglees.length); }, [chargees, epinglees.length]);
  if (!chargees) return memo > 0 ? <SqCarte lignes={Math.min(8, memo * 3)} label="Chargement des offres épinglées" /> : null;
  if (epinglees.length === 0) return null;

  const retirer = o => {
    setOffres(l => l.map(x => (x.id_offre === o.id_offre ? { ...x, epinglee: false, jours_epingle: null } : x)));
    majOffre(o.id_offre, { epinglee: false }).catch(e => alert(e.message));
  };

  return (
    <div className="carte auj-epinglees">
      <h3 className="carte-titre"><Bookmark size={17} fill="currentColor" className="epingle-marque" aria-hidden="true" />Offres épinglées <span className="count">{epinglees.length}</span></h3>
      <ul className="auj-liste">
        {epinglees.map(o => (
          <li key={o.id_offre} className="auj-epinglee">
            <button type="button" className="auj-postuler-ligne" onClick={() => ouvrirOffre(o.id_offre)}>
              <span className={'auj-epinglee-delai' + (o.jours_epingle <= 3 ? ' urgent' : '')} title="Sans action, l'épingle tombe et l'offre retombe dans la purge normale">{delai(o.jours_epingle)}</span>
              <span className="auj-postuler-corps">
                <span className="auj-postuler-titre">{o.titre}</span>
                <span className="small muted">{[o.entreprise, o.ville || o.lieu].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
            <button type="button" className="btn btn-ghost small" onClick={() => retirer(o)} aria-label={`Désépingler ${o.titre}`} title="Désépingler"><BookmarkMinus size={14} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
