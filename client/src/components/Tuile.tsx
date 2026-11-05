import { GripHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { deplacer, trier } from '../ordre.ts';
import { useMemoire } from '../utils.ts';

// ANCHOR: tuiles déplaçables de l'accueil (ligne 122). Poignée au centre du haut de chaque tuile : glisser à la souris ou au doigt (pointer events,
// repère d'arrivée avant ou après la tuile visée), ou flèches du clavier sur la poignée. Ordre mémorisé dans le navigateur (useMemoire).
// NOTE: une tuile qui n'a rien à afficher (composant qui rend null) est masquée en CSS (.tuile-contenu:empty) et ne gêne pas le déplacement

export type DefTuile = { id: string; noeud: ReactNode; titre: string };
type Glisse = { id: string; cible: string | null; apres: boolean };

export function useTuiles(defs: DefTuile[]) {
  const [ordre, setOrdre] = useMemoire('accueil.ordre', [] as string[]) as [string[], (o: string[]) => void];
  const triees = useMemo(() => trier(defs, ordre), [defs, ordre]);
  const ids = triees.map(d => d.id);
  const [glisse, setGlisse] = useState<Glisse | null>(null);
  const [annonce, setAnnonce] = useState('');
  const focus = useRef<string | null>(null);

  const placer = useCallback((id: string, cible: string, apres: boolean) => setOrdre(deplacer(ids, id, cible, apres)), [ids, setOrdre]);
  // NOTE: le déplacement d'un nœud du DOM peut faire perdre le focus : la poignée le reprend après chaque déplacement au clavier
  useEffect(() => {
    if (!focus.current) return;
    document.querySelector<HTMLElement>(`[data-poignee="${focus.current}"]`)?.focus();
    focus.current = null;
  }, [ordre]);

  const decaler = (id: string, sens: -1 | 1) => {
    const i = ids.indexOf(id);
    const cible = ids[i + sens];
    if (!cible) return;
    focus.current = id;
    placer(id, cible, sens === 1);
    const d = defs.find(x => x.id === id);
    setAnnonce(`${d?.titre ?? 'Tuile'} : position ${i + 1 + sens} sur ${ids.length}`);
  };
  const reinitialiser = () => setOrdre([]);
  return { triees, glisse, setGlisse, placer, decaler, reinitialiser, personnalise: ordre.length > 0, annonce };
}

export function Tuile({ def, tuiles }: { def: DefTuile; tuiles: ReturnType<typeof useTuiles> }) {
  const { glisse, setGlisse, placer, decaler } = tuiles;
  const actif = glisse?.id === def.id;
  const vise = glisse?.cible === def.id;

  const viser = (e: React.PointerEvent) => {
    // NOTE: près du bord de la fenêtre, la page défile pour atteindre les tuiles hors écran
    if (e.clientY < 70) window.scrollBy(0, -24); else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 24);
    const el = document.elementsFromPoint(e.clientX, e.clientY).map(n => (n as HTMLElement).closest?.('[data-tuile]')).find(Boolean) as HTMLElement | undefined;
    const cible = el?.dataset.tuile ?? null;
    if (!el || cible === def.id) { setGlisse({ id: def.id, cible: null, apres: false }); return; }
    const r = el.getBoundingClientRect();
    // NOTE: en deux colonnes, la moitié haute de la tuile visée donne « avant », la moitié basse « après »
    setGlisse({ id: def.id, cible, apres: e.clientY > r.top + r.height / 2 });
  };
  const debut = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setGlisse({ id: def.id, cible: null, apres: false });
  };
  const fin = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!actif) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (glisse?.cible) placer(def.id, glisse.cible, glisse.apres);
    setGlisse(null);
  };
  const touche = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); decaler(def.id, -1); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); decaler(def.id, 1); }
    else if (e.key === 'Escape') setGlisse(null);
  };

  return (
    <div className={'tuile' + (actif ? ' glisse' : '') + (vise ? (glisse!.apres ? ' vise-apres' : ' vise-avant') : '')} data-tuile={def.id}>
      <button
        type="button" className="tuile-poignee" data-poignee={def.id}
        onPointerDown={debut} onPointerMove={e => { if (actif) viser(e); }} onPointerUp={fin} onPointerCancel={() => setGlisse(null)} onKeyDown={touche}
        aria-label={`Déplacer la tuile ${def.titre}`} title="Glisser pour déplacer (flèches du clavier aussi)"
      ><GripHorizontal size={16} aria-hidden="true" /></button>
      <div className="tuile-contenu">{def.noeud}</div>
    </div>
  );
}
