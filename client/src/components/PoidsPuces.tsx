import { Pencil, SlidersHorizontal } from 'lucide-react';
import { useMemo } from 'react';
import { METIERS_CV } from '../../../lib/listes.mjs';
import { clePuce, normaliserPoids, POIDS_MAX, poidsSuggere, puces } from '../../../lib/cv.mjs';
import { CATEGORIES } from '../constants.ts';
import BlocRepliable from './BlocRepliable.tsx';
import { triFrise } from './Parcours.tsx';

// NOTE: une seule ligne par puce (clé identique = même poids), sinon deux lignes se partageraient le même réglage
const lignesDe = (description: string) => [...new Map(puces(description).map(p => [clePuce(p), p])).values()] as string[];

// ANCHOR: grille puces × métiers d'une expérience, valeurs grises = suggestions tirées des mots du métier
function GrillePoids({ lignes, poids, onChange }: { lignes: string[]; poids: Record<string, Record<string, number>>; onChange: (p: Record<string, Record<string, number>>) => void }) {
  return (
    <>
      <div className="poids-grille" role="table" aria-label="Poids des puces par métier">
        <div className="poids-ligne poids-entete" role="row">
          <span role="columnheader">Puce</span>
          {METIERS_CV.map(m => <span key={m} role="columnheader">{CATEGORIES[m]?.label ?? m}</span>)}
        </div>
        {lignes.map(p => (
          <div key={clePuce(p)} className="poids-ligne" role="row">
            <span className="poids-puce" role="cell" title={p}>{p}</span>
            {METIERS_CV.map(m => {
              const saisi = poids?.[clePuce(p)]?.[m];
              return (
                <select key={m} className={`input poids-select${saisi === undefined ? ' poids-suggere' : ''}`} value={saisi ?? poidsSuggere(p, m)}
                  aria-label={`Poids pour ${CATEGORIES[m]?.label ?? m} : ${p}`}
                  onChange={e => onChange({ ...poids, [clePuce(p)]: { ...poids?.[clePuce(p)], [m]: Number(e.target.value) } })}>
                  {Array.from({ length: POIDS_MAX + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                </select>
              );
            })}
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-ghost small" onClick={() => onChange(Object.fromEntries(lignes.map(p => [clePuce(p), Object.fromEntries(METIERS_CV.map(m => [m, poids?.[clePuce(p)]?.[m] ?? poidsSuggere(p, m)]))])))}>Enregistrer les suggestions</button>
    </>
  );
}

// ANCHOR: partie Poids des puces du Profil (ligne 255) : toutes les expériences sur une page, chaque changement s'enregistre aussitôt
export default function PoidsPuces({ experiences, maj, allerPartie }) {
  const liste = useMemo(() => [...experiences].sort(triFrise).map(x => ({ x, lignes: lignesDe(x.description) })).filter(e => e.lignes.length), [experiences]);
  // NOTE: même forme que le serveur (puces encore présentes, clés normalisées), sinon l'envoi par différence verrait un écart à chaque chargement
  const changer = (x, lignes: string[], poids) => {
    const gardees = new Set(lignes.map(clePuce));
    const propre = normaliserPoids(Object.fromEntries(Object.entries(poids ?? {}).filter(([k]) => gardees.has(clePuce(k)))));
    maj(e => ({ experiences: e.experiences.map(y => (y.id === x.id ? { ...y, poids: propre } : y)) }));
  };
  return (
    <section aria-labelledby="titre-poids" className="parcours">
      <h2 id="titre-poids" className="panel-title">Poids des puces</h2>
      <p className="muted small lead">
        De 0 à {POIDS_MAX} par métier visé : le CV place en tête les puces les plus lourdes de chaque expérience. Les valeurs en gris sont des suggestions tirées des mots du métier ; sans poids saisi, le CV garde le tri par mots-clés.
      </p>
      {liste.length === 0 ? (
        <div className="carte"><p className="muted small">Aucune expérience avec des puces. Les puces sont les lignes de « Missions et réalisations » dans <button type="button" className="lien" onClick={() => allerPartie('parcours')}>Parcours</button>.</p></div>
      ) : (
        <div className="reglages-listes">
          {liste.map(({ x, lignes }) => (
            <BlocRepliable key={x.id} id={x.id} memoire="poids" Icone={SlidersHorizontal} titre={x.poste || 'Expérience sans titre'}
              resume={`${x.employeur ? x.employeur + ' · ' : ''}${lignes.filter(p => x.poids?.[clePuce(p)]).length} / ${lignes.length} pesées`}>
              <GrillePoids lignes={lignes} poids={x.poids ?? {}} onChange={p => changer(x, lignes, p)} />
              <p className="muted small"><button type="button" className="lien" onClick={() => allerPartie('parcours')}><Pencil size={13} aria-hidden="true" /> Modifier les puces dans Parcours</button></p>
            </BlocRepliable>
          ))}
        </div>
      )}
    </section>
  );
}
