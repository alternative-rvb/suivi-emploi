import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// ANCHOR: pastille de score (icône, note, libellé) qui ouvre le détail dans une fenêtre modale ; la légende est dans l'infobulle
export default function ModalScore({ icone: Icone, note, niveau, libelle, legende, children }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button type="button" className={'pourquoi score-bouton ' + niveau} title={legende} aria-haspopup="dialog" onClick={() => setOuvert(true)}>
        <Icone size={15} /><span className="score">{note}</span> {libelle}
      </button>
      {ouvert && <Fenetre titre={libelle} note={note} icone={Icone} onClose={() => setOuvert(false)}>{children}</Fenetre>}
    </>
  );
}

function Fenetre({ titre, note, icone: Icone, onClose, children }) {
  const ref = useRef<any>(null);
  useEffect(() => { ref.current.showModal(); }, []);
  return (
    <dialog ref={ref} className="dialog dialog-score" onClose={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
      <header className="dialog-head">
        <h2><Icone size={17} /> {titre} : {note}</h2>
        <button type="button" className="btn btn-ghost icon" onClick={onClose} aria-label="Fermer" title="Fermer"><X size={16} /></button>
      </header>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
