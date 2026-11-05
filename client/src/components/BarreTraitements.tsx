import { RefreshCw } from 'lucide-react';
import EtatTraitements from './EtatTraitements.tsx';
import { useTraitements } from '../useTraitements.ts';

// ANCHOR: barre de l'accueil : bouton Actualiser, puis résumé repliable de la synchro et de l'analyse IA, avec la date ou le résultat de la dernière synchro
export default function BarreTraitements({ recharger }: { recharger: () => unknown }) {
  const { synchro, analyse, resultat, actualiser, enCours } = useTraitements(recharger);
  return (
    <div className="barre-traitements">
      <button type="button" className="btn btn-ghost small" onClick={actualiser} disabled={enCours} aria-busy={enCours}>
        {enCours ? <span className="spinner" aria-hidden="true" /> : <RefreshCw size={15} />}{enCours ? 'Actualisation...' : 'Actualiser'}
      </button>
      <EtatTraitements repliable synchro={synchro} enCoursSynchro={enCours} analyse={analyse}
        info={enCours ? 'Récupération des offres...' : resultat || (synchro.dernier?.ok ? `Synchro ${new Date(synchro.dernier.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : '')} />
    </div>
  );
}
