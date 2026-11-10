import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import Suggestions from './Suggestions.tsx';

// ANCHOR: liste de mots en pastilles avec un champ d'ajout (Entrée ou bouton) et un bouton de retrait par pastille.
// Commun à Profil > Recherche d'offres et aux plateformes à compte obligatoire d'Admin ; le dédoublonnage et l'enregistrement restent à l'appelant.
export default function MotsEditables({ valeurs, onAjout, onRetrait, options = [], placeholder, label, couleur = undefined, libelle = undefined, Icone = undefined, vide = 'Aucun.' }: {
  valeurs: string[]; onAjout: (texte: string) => void; onRetrait: (valeur: string) => void; options?: string[]; placeholder: string; label: string;
  couleur?: string; libelle?: (valeur: string) => string | undefined; Icone?: any; vide?: string;
}) {
  const [saisie, setSaisie] = useState('');
  const ajouter = (texte: string) => { if (!texte.trim()) return; onAjout(texte); setSaisie(''); };
  return (
    <>
      <div className="ajout-ligne ajout-groupe" onKeyDown={e => { if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); ajouter(saisie); } }}>
        <Suggestions value={saisie} onChange={e => setSaisie(e.target.value)} onCommit={ajouter} options={options} placeholder={placeholder} aria-label={label} />
        <button type="button" className="btn btn-primary" onClick={() => ajouter(saisie)} disabled={!saisie.trim()} title="Ajouter à la liste"><Plus size={16} />Ajouter</button>
      </div>
      {valeurs.length > 0 ? (
        <ul className="mots">
          {valeurs.map(v => (
            <li key={v} className="badge" style={couleur ? { '--c': couleur } as any : undefined} title={libelle?.(v) || undefined}>
              {Icone && <Icone size={13} aria-hidden="true" />}{v}{libelle?.(v) && <span className="muted"> {libelle(v)}</span>}
              <button type="button" className="badge-retrait" aria-label={`Retirer ${v}`} onClick={() => onRetrait(v)} title={`Retirer ${v}`}><X size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">{vide}</p>}
    </>
  );
}
