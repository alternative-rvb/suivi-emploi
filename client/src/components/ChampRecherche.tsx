import { Search, X } from 'lucide-react';

// ANCHOR: champ de recherche avec loupe et croix de réinitialisation (visible seulement quand le champ est rempli)
// NOTE: la croix remet la valeur à vide via onChange, Échap fait de même
export default function ChampRecherche({ value, onChange, onKeyDown, className = '', ...props }: any) {
  const vider = () => onChange({ target: { value: '' } });
  return (
    <div className={`champ-recherche ${className}`}>
      <Search className="champ-recherche-loupe" size={16} aria-hidden="true" />
      <input
        type="text"
        inputMode="search"
        className="input"
        value={value}
        onChange={onChange}
        onKeyDown={e => { if (e.key === 'Escape' && value) { e.preventDefault(); vider(); } onKeyDown?.(e); }}
        {...props}
      />
      {value && (
        <button type="button" className="champ-recherche-croix" onClick={vider} title="Effacer la recherche" aria-label="Effacer la recherche">
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
