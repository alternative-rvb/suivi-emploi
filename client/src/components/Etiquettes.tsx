import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import Suggestions from './Suggestions.tsx';

export type Etiquette = { cle: string; contenu: ReactNode; libelle: string; titre?: string; classe?: string };

// ANCHOR: sélection multiple en étiquettes (ligne 116) : un champ de suggestions pour ajouter, puis une étiquette retirable par valeur ;
// partagée par les compétences d'une expérience (Parcours), les compétences enseignées et les organismes d'un titre (Formations)
// NOTE: le texte du champ reste piloté par l'appelant, qui peut lier une saisie non validée à l'enregistrement
export default function Etiquettes({ items, retirer, texte, setTexte, ajouter, options, placeholder, label, className = '', champ = '' }: {
  items: Etiquette[];
  retirer: (cle: string) => void;
  texte: string;
  setTexte: (v: string) => void;
  ajouter: (v: string) => void;
  options: string[];
  placeholder: string;
  label?: string;
  className?: string;
  champ?: string;
}) {
  return (
    <div className={'etiquettes ' + className}>
      <Suggestions className={champ} placeholder={placeholder} value={texte} onChange={e => setTexte(e.target.value)} onCommit={ajouter} options={options} aria-label={label} />
      {items.length > 0 && (
        <div className="parcours-competences">
          {items.map(e => (
            <span key={e.cle} className={'tag parcours-comp' + (e.classe ? ' ' + e.classe : '')} title={e.titre}>
              {e.contenu}
              <button type="button" className="btn-lien" onClick={() => retirer(e.cle)} aria-label={`Retirer ${e.libelle}`}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
