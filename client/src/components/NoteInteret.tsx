import { Heart } from 'lucide-react';
import { useState } from 'react';
import { INTERETS } from '../constants.ts';

// ANCHOR: intérêt noté en un clic, façon avis à cœurs (1 faible à 4 important). Un second clic sur le niveau choisi l'efface.
const NIVEAUX = ['faible', 'moyen', 'fort', 'important'];

export default function NoteInteret({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const rang = NIVEAUX.indexOf(value);
  const affiche = survol ?? rang;
  const niveau = NIVEAUX[affiche];
  return (
    <div className="note-interet" role="radiogroup" aria-label="Intérêt" onMouseLeave={() => setSurvol(null)}>
      <div className="note-coeurs">
        {NIVEAUX.map((k, i) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} aria-label={INTERETS[k]} title={value === k ? `${INTERETS[k]} (cliquer pour effacer)` : INTERETS[k]}
            className={'note-coeur' + (i <= affiche ? ' plein ' + niveau : '')}
            onMouseEnter={() => setSurvol(i)} onFocus={() => setSurvol(i)} onBlur={() => setSurvol(null)}
            onClick={() => onChange(value === k ? '' : k)}>
            <Heart size={20} fill={i <= affiche ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
      <span className="note-libelle">{niveau ? INTERETS[niveau] : 'Non renseigné'}</span>
    </div>
  );
}
