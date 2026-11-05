import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

// ANCHOR: badge du numéro d'offre. Cliquable pour copier le numéro (petite icône), sauf dans un bouton (liste, propositions) où il reste un simple badge.
// NOTE: les offres saisies à la main (id interne man-...) n'ont pas de numéro

export default function NumeroOffre({ offre, copiable = true, repli = '' }: { offre?: { id_offre?: string | null } | null; copiable?: boolean; repli?: string }) {
  const id = offre?.id_offre;
  const [copie, setCopie] = useState(false);
  useEffect(() => {
    if (!copie) return undefined;
    const t = setTimeout(() => setCopie(false), 1600);
    return () => clearTimeout(t);
  }, [copie]);
  if (!id || id.startsWith('man-')) return repli ? <span className="badge num-badge num-repli" title="Pas de numéro d'offre"><span className="num-repli-texte">{repli}</span></span> : null;

  if (!copiable) return <span className="badge num-badge" title="Numéro de l'offre">n° {id}</span>;

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      // NOTE: repli hors contexte sécurisé
      const zone = document.createElement('textarea');
      zone.value = id;
      document.body.appendChild(zone);
      zone.select();
      document.execCommand('copy');
      zone.remove();
    }
    setCopie(true);
  };

  return (
    <button type="button" className={'badge num-badge num-copiable' + (copie ? ' copie' : '')} onClick={copier} title={copie ? 'Numéro copié' : "Copier le numéro de l'offre"} aria-label={`Copier le numéro de l'offre ${id}`}>
      n° {id}<span className="num-action" aria-hidden="true">{copie ? <Check size={12} /> : <Copy size={12} />}</span>
    </button>
  );
}
