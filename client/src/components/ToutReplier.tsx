import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

// ANCHOR: ouvre ou ferme d'un clic tous les blocs repliables d'un conteneur (ligne 91)
// NOTE: passe par l'attribut open des <details> : l'événement toggle qui suit laisse BlocRepliable mémoriser le choix de chaque bloc
export default function ToutReplier({ cible, selecteur = 'details', className = '' }: { cible: React.RefObject<HTMLElement | null>; selecteur?: string; className?: string }) {
  const basculer = (ouvert: boolean) => {
    cible.current?.querySelectorAll<HTMLDetailsElement>(selecteur).forEach(d => { d.open = ouvert; });
  };
  return (
    <span className={'btn-group tout-replier ' + className}>
      <button type="button" className="btn btn-ghost small icon" onClick={() => basculer(true)} title="Tout déplier" aria-label="Tout déplier"><ChevronsUpDown size={15} /></button>
      <button type="button" className="btn btn-ghost small icon" onClick={() => basculer(false)} title="Tout replier" aria-label="Tout replier"><ChevronsDownUp size={15} /></button>
    </span>
  );
}
