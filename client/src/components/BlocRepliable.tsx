import { ecranLarge, useMemoire } from '../utils.ts';

// ANCHOR: bloc repliable de la fiche candidature. Le choix ouvert ou fermé est mémorisé par bloc (suivi.fiche.<id>), valable pour toutes les candidatures ;
// tant qu'aucun choix n'a été fait, le défaut s'applique (à l'écran étroit, seul le bloc prioritaire reste ouvert par défaut)
// NOTE: memoire change le préfixe de la clé mémorisée (Admin : admin.<id>)
export default function BlocRepliable({ id, titre, Icone, resume, pastille, defaut = false, prioritaire = false, memoire = 'fiche', className = '', style = undefined, children }: any) {
  const [choix, setChoix] = useMemoire(memoire + '.' + id, null);
  const ouvert = choix ?? (defaut && (prioritaire || ecranLarge()));

  return (
    <details className={'bloc-rep' + (className ? ' ' + className : '')} style={style} open={ouvert} onToggle={e => { if (e.currentTarget.open !== ouvert) setChoix(e.currentTarget.open); }}>
      <summary>
        {Icone && <Icone size={16} aria-hidden="true" />}
        <span className="bloc-rep-titre">{titre}</span>
        {pastille}
        {resume && <span className="bloc-rep-resume">{resume}</span>}
        <span className="chev" aria-hidden="true" />
      </summary>
      <div className="bloc-rep-corps">{children}</div>
    </details>
  );
}
