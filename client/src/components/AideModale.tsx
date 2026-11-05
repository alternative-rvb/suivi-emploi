import { CircleHelp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// ANCHOR: bouton « ? » qui ouvre une fenêtre modale d'explication, à placer à côté du titre d'une fonctionnalité à documenter pour l'utilisateur
// NOTE: titre = nom de la fonctionnalité (sert aussi au libellé accessible du bouton), children = explication (paragraphes, listes, h3.carte-titre pour les parties)
export default function AideModale({ titre, children }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<any>(null);
  useEffect(() => { if (ouvert) ref.current?.showModal(); }, [ouvert]);
  const fermer = () => setOuvert(false);
  return (
    <>
      <button type="button" className="btn btn-ghost small icon aide-bouton" onClick={() => setOuvert(true)} aria-haspopup="dialog" aria-label={`Aide : ${titre}`} title="Comment ça marche ?"><CircleHelp size={15} aria-hidden="true" /></button>
      {ouvert && (
        <dialog ref={ref} className="dialog dialog-score aide-modale" onClose={fermer} onClick={e => { if (e.target === ref.current) fermer(); }}>
          <header className="dialog-head">
            <h2><CircleHelp size={17} aria-hidden="true" /> {titre}</h2>
            <button type="button" className="btn btn-ghost icon" onClick={fermer} aria-label="Fermer" title="Fermer"><X size={16} /></button>
          </header>
          <div className="dialog-body aide-corps">{children}</div>
        </dialog>
      )}
    </>
  );
}
