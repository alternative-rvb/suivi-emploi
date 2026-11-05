import { Check, Pencil } from 'lucide-react';
import { useState } from 'react';
import Markdown from './Markdown.tsx';

// ANCHOR: bloc de texte Markdown repliable et modifiable (to-do et veille du Profil), ouvert par défaut quand on le demande
export default function NoteMarkdown({ titre, valeur, onChange, ouvert = false }: { titre: string; valeur: string; onChange: (v: string) => void; ouvert?: boolean }) {
  const [edition, setEdition] = useState(false);
  return (
    <details className="note-block" open={ouvert}>
      <summary>
        <span className="note-title">{titre}</span>
        <span className="chev" aria-hidden="true" />
      </summary>
      <div className="note-body">
        {edition ? (
          <>
            <textarea
              className="input md-edit"
              value={valeur}
              onChange={e => onChange(e.target.value)}
              rows={Math.min(24, Math.max(8, valeur.split('\n').length + 2))}
              aria-label={`Modifier ${titre}`}
            />
            <div className="row-end">
              <button type="button" className="btn btn-primary" onClick={() => setEdition(false)}><Check size={15} />Terminer</button>
            </div>
          </>
        ) : (
          <>
            {valeur ? <Markdown>{valeur}</Markdown> : <p className="muted">Rien pour l'instant.</p>}
            <div className="row-end">
              <button type="button" className="btn btn-ghost" onClick={() => setEdition(true)}><Pencil size={15} />Modifier</button>
            </div>
          </>
        )}
      </div>
    </details>
  );
}
