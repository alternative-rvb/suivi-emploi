import { useEffect, useId, useRef, useState } from 'react';
import { norm } from '../utils.ts';

// ANCHOR: liste déroulante maison : options [valeur, libellé, couleur?], clavier (flèches, Entrée, Échap, première lettre)
// NOTE: onChange reçoit un objet { target: { value } } pour rester compatible avec les gestionnaires écrits pour <select>
// NOTE: le clic sur une option annule son action par défaut : dans un <label>, il serait relayé au bouton et rouvrirait la liste
export default function Select({ value, onChange, options, className = '', placeholder = 'Choisir', ...aria }: any) {
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const racine = useRef<any>(null);
  const liste = useRef<any>(null);
  const id = useId();
  const choisie = options.find(([v]) => v === value);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = e => { if (!racine.current?.contains(e.target)) setOuvert(false); };
    document.addEventListener('pointerdown', dehors);
    return () => document.removeEventListener('pointerdown', dehors);
  }, [ouvert]);

  useEffect(() => {
    if (ouvert) liste.current?.children[actif]?.scrollIntoView({ block: 'nearest' });
  }, [ouvert, actif]);

  const ouvrir = () => { setActif(Math.max(0, options.findIndex(([v]) => v === value))); setOuvert(true); };
  const choisir = i => { setOuvert(false); if (options[i] && options[i][0] !== value) onChange({ target: { value: options[i][0] } }); };

  const touche = e => {
    if (e.key === 'Escape' && ouvert) { e.preventDefault(); e.stopPropagation(); setOuvert(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!ouvert) return ouvrir();
      setActif(i => Math.max(0, Math.min(options.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Home' || e.key === 'End') {
      if (!ouvert) return;
      e.preventDefault();
      setActif(e.key === 'Home' ? 0 : options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (ouvert) choisir(actif); else ouvrir();
    } else if (e.key === 'Tab') {
      setOuvert(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      // NOTE: la première lettre saute à l'option suivante qui commence par elle
      const l = norm(e.key);
      const depart = ouvert ? actif : options.findIndex(([v]) => v === value);
      for (let k = 1; k <= options.length; k++) {
        const i = (depart + k) % options.length;
        if (norm(String(options[i][1])).startsWith(l)) { if (ouvert) setActif(i); else choisir(i); break; }
      }
    }
  };

  return (
    <div className={'select ' + className} ref={racine}>
      <button type="button" className="input select-bouton" role="combobox" aria-haspopup="listbox" aria-expanded={ouvert} aria-controls={id}
        aria-activedescendant={ouvert ? `${id}-${actif}` : undefined} onClick={() => (ouvert ? setOuvert(false) : ouvrir())} onKeyDown={touche} {...aria}>
        {choisie?.[2] && <span className="dot" style={{ '--c': choisie[2] }} />}
        <span className="select-valeur" title={choisie ? String(choisie[1]) : undefined}>{choisie ? choisie[1] : placeholder}</span>
      </button>
      {ouvert && (
        <ul className="select-liste" role="listbox" id={id} ref={liste}>
          {options.map(([v, l, c], i) => (
            <li key={String(v)} id={`${id}-${i}`} role="option" aria-selected={v === value}
              className={'select-option' + (i === actif ? ' actif' : '') + (v === value ? ' choisie' : '')}
              onPointerEnter={() => setActif(i)} onPointerDown={e => e.preventDefault()} onClick={e => { e.preventDefault(); choisir(i); }}>
              {c && <span className="dot" style={{ '--c': c }} />}
              <span>{l}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
