import { RefreshCw } from 'lucide-react';
import EtatTraitements from './EtatTraitements.tsx';
import { useTraitements } from '../useTraitements.ts';

// ANCHOR: barre de l'accueil : bouton Actualiser, puis résumé repliable de la synchro et de l'analyse IA, avec la date ou le résultat de la dernière synchro
export default function BarreTraitements({ recharger }: { recharger: () => unknown }) {
  const { synchro, analyse, resultat, actualiser, enCours } = useTraitements(recharger);
  return (
    <div className="barre-traitements">
      {/* NOTE: pas de libellé ni de spinner « Actualisation... » ici : la pastille « Offres en cours » du résumé indique déjà le traitement, le bouton est seulement désactivé */}
      <button type="button" className="btn btn-ghost small" onClick={actualiser} disabled={enCours} aria-busy={enCours}>
        <RefreshCw size={15} aria-hidden="true" />Actualiser
      </button>
      <EtatTraitements repliable synchro={synchro} enCoursSynchro={enCours} analyse={analyse}
        info={enCours ? 'Récupération des offres...' : resultat || (synchro.dernier?.ok ? `Synchro ${new Date(synchro.dernier.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : '')} />
    </div>
  );
}
