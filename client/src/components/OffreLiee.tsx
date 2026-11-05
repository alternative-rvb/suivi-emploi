import { AlertTriangle, ExternalLink, Unlink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORIES } from '../constants.ts';
import { detailOffre, norm, lienSur } from '../utils.ts';
import NumeroOffre from './NumeroOffre.tsx';
import { useEnLigne } from '../useEnLigne.ts';

const MAX = 6;
// NOTE: mots trop courants dans les intitulés pour départager deux offres
const VIDES = new Set(['poste', 'emploi', 'offre', 'temps', 'plein', 'partiel', 'charge', 'chargee', 'assistant', 'assistante', 'adjoint', 'adjointe']);
// NOTE: forme féminine ramenée à la masculine, pour que « Formateur/Formatrice » ne compte pas double
const mots = s => new Set(norm(s).split(/[^a-z0-9]+/).map(m => m.replace(/trice$/, 'teur')).filter(m => m.length > 3 && !VIDES.has(m)));

// Score de ressemblance entre une offre et la candidature : entreprise identique ou contenue, puis mots communs du poste
function score(o, entreprise, motsPoste) {
  const e = norm(entreprise).trim();
  const oe = norm(o.entreprise).trim();
  let s = e.length > 2 && oe.length > 2 && (e.includes(oe) || oe.includes(e)) ? 5 : 0;
  for (const m of mots(o.titre)) if (motsPoste.has(m)) s++;
  return s;
}

// Mots qui ne distinguent aucune offre : présents dans plus de 10 % des intitulés (comptable, responsable...) ou noms de ville
function motsFrequents(offres) {
  const df = new Map<any, any>();
  for (const o of offres) for (const m of mots(o.titre)) df.set(m, (df.get(m) ?? 0) + 1);
  const neutres = new Set([...df].filter(([, n]) => n > offres.length * 0.1).map(([m]) => m));
  for (const o of offres) for (const m of mots(o.ville)) neutres.add(m);
  return neutres;
}

function chercher(offres, q, entreprise, poste, frequents) {
  const parDate = (a, b) => (b.date_detection || '').localeCompare(a.date_detection || '');
  const termes = norm(q).split(/\s+/).filter(Boolean);
  if (termes.length) {
    return offres
      .filter(o => { const t = norm(`${o.titre} ${o.entreprise} ${o.ville} ${o.id_offre}`); return termes.every(x => t.includes(x)); })
      .sort(parDate)
      .slice(0, MAX);
  }
  const motsPoste = new Set([...mots(poste)].filter(m => !frequents.has(m)));
  // ANCHOR: sans recherche, seules les offres assez proches sont proposées (entreprise identique ou au moins deux mots du poste)
  return offres
    .map(o => [o, score(o, entreprise, motsPoste)])
    .filter(([, s]) => s >= 2)
    .sort(([a, sa], [b, sb]) => sb - sa || parDate(a, b))
    .slice(0, MAX)
    .map(([o]) => o);
}

// Met en évidence les mots recherchés dans un titre
function Surligne({ texte, q }) {
  const termes = norm(q).split(/\s+/).filter(t => t.length > 1);
  if (!termes.length) return texte;
  const n = norm(texte);
  const marques = new Array(texte.length).fill(false);
  for (const t of termes) for (let i = n.indexOf(t); i >= 0; i = n.indexOf(t, i + 1)) marques.fill(true, i, i + t.length);
  const morceaux: any[] = [];
  for (let i = 0; i < texte.length;) {
    let j = i;
    while (j < texte.length && marques[j] === marques[i]) j++;
    morceaux.push(marques[i] ? <mark key={i}>{texte.slice(i, j)}</mark> : texte.slice(i, j));
    i = j;
  }
  return morceaux;
}

// Choix de l'offre France Travail liée à une candidature. prises : offre_id déjà liés à une autre candidature
export default function OffreLiee({ valeur, onChange, offres, prises, entreprise, poste }) {
  const [q, setQ] = useState('');
  const [actif, setActif] = useState(-1);
  // NOTE: une offre liée à une candidature n'est jamais marquée automatiquement : le contrôle sert seulement à signaler que l'annonce est clôturée
  const enLigne = useEnLigne(valeur, Boolean(valeur));
  const frequents = useMemo(() => motsFrequents(offres ?? []), [offres]);
  const propositions = useMemo(() => (valeur || !offres ? [] : chercher(offres, q, entreprise, poste, frequents)), [valeur, offres, q, entreprise, poste, frequents]);

  if (valeur) {
    const o = offres?.find(x => x.id_offre === valeur);
    return (
      <div className="field">
        <span>Offre liée</span>
        <div className="offre-liee">
          <div>
            <b>{o ? o.titre : `Offre n° ${valeur}`}</b>
            {o && <NumeroOffre offre={o} />}
            <span className="muted small">{o ? detailOffre(o) : offres ? 'Introuvable dans la base des offres' : 'Chargement...'}</span>
            {enLigne?.statut === 'cloturee' && <span className="warn small"><AlertTriangle size={13} /> L'annonce n'est plus en ligne sur France Travail.</span>}
          </div>
          {lienSur(o?.lien) && <a className="btn btn-ghost small" href={lienSur(o?.lien)} target="_blank" rel="noopener noreferrer" title="Ouvrir la fiche de l'offre" aria-label="Ouvrir la fiche de l'offre"><ExternalLink size={15} /></a>}
          <button type="button" className="btn btn-ghost small icon" onClick={() => onChange(null)} title="Retirer le lien avec cette offre" aria-label="Retirer le lien avec cette offre"><Unlink size={15} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <label htmlFor="offre-recherche">Offre liée</label>
      <input
        id="offre-recherche"
        type="search"
        className="input"
        placeholder="Rechercher par titre, entreprise, ville ou numéro"
        value={q}
        onChange={e => { setQ(e.target.value); setActif(-1); }}
        onKeyDown={e => {
          // NOTE: flèches pour parcourir les propositions, Entrée pour lier celle mise en avant
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setActif(i => Math.max(-1, Math.min(propositions.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const o = propositions[actif];
            if (o && !prises.get(o.id_offre)) { onChange(o.id_offre); setQ(''); }
          }
        }}
      />
      {!offres ? (
        <p className="muted small">Chargement des offres...</p>
      ) : propositions.length ? (
        <>
          {!q.trim() && <p className="muted small">Suggestions d'après l'entreprise et le poste :</p>}
          <ul className="offre-choix">
            {propositions.map((o, i) => {
              const prise = prises.get(o.id_offre);
              const cat = CATEGORIES[o.categorie] || CATEGORIES.autre;
              return (
                <li key={o.id_offre}>
                  <button type="button" className={'offre-choix-item' + (i === actif ? ' actif' : '')} style={{ '--c': cat.color }} disabled={Boolean(prise)} onPointerEnter={() => setActif(i)} onClick={() => { onChange(o.id_offre); setQ(''); }}>
                    <b><Surligne texte={o.titre} q={q} /></b> <NumeroOffre offre={o} copiable={false} />
                    <span className="muted small">{detailOffre(o)}{prise ? ` · déjà liée à ${prise}` : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="muted small">{q.trim() ? 'Aucune offre ne correspond.' : 'Aucune offre proche de cette entreprise ou de ce poste. La recherche ci-dessus parcourt toutes les offres.'}</p>
      )}
    </div>
  );
}
