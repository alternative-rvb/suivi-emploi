import { useEffect, useState } from 'react';
import { ecranLarge, useMemoire } from '../utils.ts';

// ANCHOR: bloc repliable de la fiche candidature. Le choix ouvert ou fermé est mémorisé par bloc (suivi.fiche.<id>), valable pour toutes les candidatures ;
// tant qu'aucun choix n'a été fait, le défaut s'applique (à l'écran étroit, seul le bloc prioritaire reste ouvert par défaut)
// NOTE: memoire change le préfixe de la clé mémorisée (Admin : admin.<id>) ; avec ouvert et surBascule, le bloc est piloté par le parent et rien n'est mémorisé
export default function BlocRepliable({ id, titre, Icone, resume, pastille, defaut = false, prioritaire = false, memoire = 'fiche', className = '', style = undefined, ouvert: pilote = undefined, surBascule = undefined, children }: any) {
  const [choix, setChoix] = useMemoire(memoire + '.' + id, null);
  const ouvert = pilote ?? choix ?? (defaut && (prioritaire || ecranLarge()));
  const basculer = (open: boolean) => (pilote === undefined ? setChoix(open) : surBascule?.(open));

  return (
    <details className={'bloc-rep' + (className ? ' ' + className : '')} style={style} open={ouvert} onToggle={e => { if (e.currentTarget.open !== ouvert) basculer(e.currentTarget.open); }}>
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

// ANCHOR: cartes générique et sur mesure de CV/LM : la carte active est dépliée au chargement et à chaque changement de carte active, l'autre repliée ; chacune reste dépliable ou repliable à la main
export function useDepliage(actif: 'generique' | 'sur_mesure') {
  const [ouverts, setOuverts] = useState({ generique: actif === 'generique', sur_mesure: actif === 'sur_mesure' });
  useEffect(() => { setOuverts({ generique: actif === 'generique', sur_mesure: actif === 'sur_mesure' }); }, [actif]);
  return (k: 'generique' | 'sur_mesure') => ({ ouvert: ouverts[k], surBascule: (o: boolean) => setOuverts(v => ({ ...v, [k]: o })) });
}
