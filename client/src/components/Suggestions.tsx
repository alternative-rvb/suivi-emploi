import { useId, useMemo, useRef, useState } from 'react';
import { norm } from '../utils.ts';

// NOTE: au-delà, la liste est trop longue à parcourir : la frappe affine
const MAX_AFFICHEES = 50;

// ANCHOR: champ texte libre avec suggestions filtrées pendant la frappe (remplace <datalist>)
// NOTE: onChange reçoit { target: { value } } comme un <input> ; onCommit est appelé à la sortie du champ ou au choix d'une suggestion
export default function Suggestions({ value, defaultValue, onChange, onCommit, options, className = '', ...props }: any) {
  const controle = value !== undefined;
  const [interne, setInterne] = useState(defaultValue ?? '');
  const texte = controle ? value ?? '' : interne;
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const champ = useRef<any>(null);
  const id = useId();

  const filtrees = useMemo(() => {
    const q = norm(texte).trim();
    const uniques: string[] = [...new Set<string>(options.filter(Boolean))];
    // NOTE: tant que le texte est une suggestion exacte, toutes restent proposées pour pouvoir en changer
    if (!q || uniques.some(o => norm(o) === q)) return uniques;
    return uniques.filter(o => norm(o).includes(q)).sort((a, b) => norm(a).indexOf(q) - norm(b).indexOf(q));
  }, [texte, options]);

  const changer = v => { if (!controle) setInterne(v); onChange?.({ target: { value: v } }); };
  const choisir = v => { changer(v); setOuvert(false); setActif(-1); onCommit?.(v); };

  const touche = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOuvert(true);
      setActif(i => Math.max(-1, Math.min(filtrees.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Enter' && ouvert && actif >= 0) {
      e.preventDefault();
      choisir(filtrees[actif]);
    } else if (e.key === 'Escape' && ouvert) {
      e.preventDefault();
      e.stopPropagation();
      setOuvert(false);
    }
  };

  // Met en évidence la partie du texte qui correspond à la saisie
  const surligner = o => {
    const q = norm(texte).trim();
    const i = q ? norm(o).indexOf(q) : -1;
    if (i < 0) return o;
    return <>{o.slice(0, i)}<mark>{o.slice(i, i + q.length)}</mark>{o.slice(i + q.length)}</>;
  };

  return (
    <div className="select suggestions">
      <input ref={champ} className={'input ' + className} value={texte} autoComplete="off" role="combobox" aria-autocomplete="list"
        aria-expanded={ouvert && filtrees.length > 0} aria-controls={id} aria-activedescendant={actif >= 0 ? `${id}-${actif}` : undefined}
        onChange={e => { changer(e.target.value); setOuvert(true); setActif(-1); }}
        onFocus={() => setOuvert(true)} onClick={() => setOuvert(true)}
        onBlur={() => { setOuvert(false); onCommit?.(texte); }} onKeyDown={touche} {...props} />
      {ouvert && filtrees.length > 0 && (
        <ul className="select-liste" role="listbox" id={id}>
          {filtrees.slice(0, MAX_AFFICHEES).map((o, i) => (
            <li key={o} id={`${id}-${i}`} role="option" aria-selected={o === texte} className={'select-option' + (i === actif ? ' actif' : '') + (o === texte ? ' choisie' : '')}
              onPointerEnter={() => setActif(i)} onPointerDown={e => e.preventDefault()} onClick={() => choisir(o)}>
              <span>{surligner(o)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
