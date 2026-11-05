import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Select from './Select.tsx';

// ANCHOR: variantes nommées d'un texte du CV (titre, accroche ou résumé) pour une cible : liste déroulante, enregistrement du texte actuel, suppression
// NOTE: choisir une variante recopie son texte dans le champ (le champ reste modifiable) ; la variante affichée est celle dont le texte est identique au champ
export default function VariantesTexte({ texte, variantes, onChoisir, onListe }: { texte: string; variantes: { nom: string; texte: string }[]; onChoisir: (t: string) => void; onListe: (l: { nom: string; texte: string }[]) => void }) {
  const [nom, setNom] = useState('');
  const index = variantes.findIndex(v => v.texte === texte);
  const options = [['', index < 0 ? 'Texte actuel (non enregistré)' : 'Choisir une variante'], ...variantes.map((v, i) => [String(i), v.nom])];
  const enregistrer = () => {
    const n = nom.trim();
    if (!n || !texte.trim()) return;
    onListe([...variantes.filter(v => v.nom !== n), { nom: n, texte }]);
    setNom('');
  };
  return (
    <div className="cv-variantes">
      {variantes.length > 0 && (
        <Select value={index < 0 ? '' : String(index)} onChange={e => { if (e.target.value !== '') onChoisir(variantes[Number(e.target.value)].texte); }} options={options} aria-label="Variantes enregistrées" />
      )}
      {index >= 0
        ? <button type="button" className="btn btn-ghost small" onClick={() => onListe(variantes.filter((_, i) => i !== index))}><Trash2 size={14} />Supprimer la variante</button>
        : texte.trim() && (
          <span className="cv-variante-nouvelle">
            <input className="input" value={nom} maxLength={60} placeholder="Nom de la variante" aria-label="Nom de la variante" onChange={e => setNom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enregistrer(); } }} />
            <button type="button" className="btn btn-ghost small" onClick={enregistrer} disabled={!nom.trim()}><Plus size={14} />Enregistrer</button>
          </span>
        )}
    </div>
  );
}
