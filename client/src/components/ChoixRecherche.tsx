import { useId, useMemo, useRef, useState } from 'react';
import { norm } from '../utils.ts';

// NOTE: au-delà, la liste est trop longue à parcourir : la frappe affine
const MAX_AFFICHEES = 50;

// ANCHOR: choix d'un élément parmi beaucoup (offres, candidatures) avec recherche pendant la frappe
// NOTE: options [valeur, libellé] comme Select, onChange reçoit { target: { value } } ; l'option de valeur '' sert de choix « aucun » proposé en tête quand rien n'est tapé
export default function ChoixRecherche({ value, onChange, options, placeholder = 'Rechercher...', ...aria }: any) {
  const [saisie, setSaisie] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const id = useId();
  const liste = useRef<any>(null);
  const choisie = options.find(([v]) => v === value);

  const filtrees = useMemo(() => {
    const q = norm(saisie ?? '').trim();
    if (!q) return options;
    return options.filter(([v, l]) => v !== '' && norm(String(l)).includes(q));
  }, [options, saisie]);

  const fermer = () => { setOuvert(false); setSaisie(null); };
  const choisir = i => { const o = filtrees[i]; fermer(); if (o && o[0] !== value) onChange({ target: { value: o[0] } }); };

  const touche = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOuvert(true);
      setActif(i => Math.max(0, Math.min(filtrees.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Enter' && ouvert) {
      e.preventDefault();
      choisir(actif);
    } else if (e.key === 'Escape' && ouvert) {
      e.preventDefault();
      e.stopPropagation();
      fermer();
    }
  };

  const surligner = l => {
    const q = norm(saisie ?? '').trim();
    const i = q ? norm(l).indexOf(q) : -1;
    return i < 0 ? l : <>{l.slice(0, i)}<mark>{l.slice(i, i + q.length)}</mark>{l.slice(i + q.length)}</>;
  };

  return (
    <div className="select suggestions">
      <input className="input" value={saisie ?? (choisie && choisie[0] !== '' ? choisie[1] : '')} placeholder={choisie && choisie[0] === '' ? choisie[1] : placeholder}
        autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={ouvert && filtrees.length > 0} aria-controls={id}
        aria-activedescendant={ouvert ? `${id}-${actif}` : undefined}
        onChange={e => { setSaisie(e.target.value); setOuvert(true); setActif(0); }}
        onFocus={e => { setOuvert(true); setActif(0); e.target.select(); }} onClick={() => setOuvert(true)}
        onBlur={fermer} onKeyDown={touche} {...aria} />
      {ouvert && filtrees.length > 0 && (
        <ul className="select-liste" role="listbox" id={id} ref={liste}>
          {filtrees.slice(0, MAX_AFFICHEES).map(([v, l], i) => (
            <li key={String(v)} id={`${id}-${i}`} role="option" aria-selected={v === value}
              className={'select-option' + (i === actif ? ' actif' : '') + (v === value ? ' choisie' : '')}
              onPointerEnter={() => setActif(i)} onPointerDown={e => e.preventDefault()} onClick={() => choisir(i)}>
              <span>{surligner(String(l))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
