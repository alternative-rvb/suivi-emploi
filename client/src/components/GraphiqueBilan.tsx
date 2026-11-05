import { useLayoutEffect, useRef, useState } from 'react';

// ANCHOR: graphique du bilan par période (ligne 101) : colonnes empilées des actions de l'utilisateur, dans l'ordre chronologique. Les offres détectées (veille automatique, des centaines) restent hors échelle, dans l'infobulle et le tableau.
// NOTE: palette catégorielle validée (clair et sombre), ordre fixe des séries, jamais recalculé par un filtre
export const SERIES: { cle: string; nom: string; compteurs: string[] }[] = [
  { cle: 'offres', nom: 'Offres triées', compteurs: ['offres_vues', 'offres_ecartees', 'offres_saisies'] },
  { cle: 'envoyees', nom: 'Candidatures envoyées', compteurs: ['candidatures_envoyees'] },
  { cle: 'echanges', nom: 'Échanges', compteurs: ['echanges'] },
  { cle: 'taches', nom: 'Tâches faites', compteurs: ['taches_faites'] },
];
const valeur = (p, s) => s.compteurs.reduce((n, k) => n + (p[k] ?? 0), 0);
const HAUT = 200;
const MARGE = { haut: 12, bas: 28, gauche: 32, droite: 8 };

// Graduations rondes : 1, 2 ou 5 fois une puissance de dix, quatre intervalles au plus
function graduations(max: number) {
  if (max <= 0) return [0, 1];
  const brut = max / 4;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 5, 10].map(x => x * p).find(x => x >= brut) ?? brut;
  return Array.from({ length: Math.ceil(max / pas) + 1 }, (_, i) => i * pas);
}

// Colonne arrondie en haut seulement (4 px), carrée à la ligne de base
const colonne = (x, y, l, h, r) => (h <= 0 ? '' : `M${x},${y + h}V${y + Math.min(r, h)}Q${x},${y} ${x + Math.min(r, l / 2)},${y}H${x + l - Math.min(r, l / 2)}Q${x + l},${y} ${x + l},${y + Math.min(r, h)}V${y + h}Z`);

export default function GraphiqueBilan({ periodes, libelle }: { periodes: any[]; libelle: (p: any) => string }) {
  const boite = useRef<HTMLDivElement>(null);
  const [large, setLarge] = useState(600);
  const [survol, setSurvol] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = boite.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setLarge(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totaux = periodes.map(p => SERIES.reduce((n, s) => n + valeur(p, s), 0));
  const ticks = graduations(Math.max(...totaux, 0));
  const max = ticks[ticks.length - 1];
  const zoneL = large - MARGE.gauche - MARGE.droite;
  const zoneH = HAUT - MARGE.haut - MARGE.bas;
  const bande = zoneL / Math.max(periodes.length, 1);
  const l = Math.min(24, bande * 0.6);
  const y = v => MARGE.haut + zoneH - (v / max) * zoneH;
  // NOTE: une étiquette d'axe sur n au plus, pour ne jamais les chevaucher
  const pasEtiquette = Math.ceil(90 / bande);
  const p = survol == null ? null : periodes[survol];

  return (
    <figure className="graphique" aria-label="Actions menées par période">
      <ul className="graphique-legende">
        {SERIES.map(s => <li key={s.cle}><span className={`pastille serie-${s.cle}`} aria-hidden="true" />{s.nom}</li>)}
      </ul>
      <div ref={boite} className="graphique-zone" onMouseLeave={() => setSurvol(null)}>
        <svg width={large} height={HAUT} role="img" aria-label="Colonnes empilées, détail dans le tableau ci-dessous">
          {ticks.map(t => (
            <g key={t}>
              <line x1={MARGE.gauche} x2={large - MARGE.droite} y1={y(t)} y2={y(t)} className="graphique-grille" />
              <text x={MARGE.gauche - 6} y={y(t)} dy="0.32em" textAnchor="end" className="graphique-axe">{t}</text>
            </g>
          ))}
          {periodes.map((pe, i) => {
            const x = MARGE.gauche + i * bande + (bande - l) / 2;
            let base = 0;
            const segs = SERIES.map(s => ({ s, v: valeur(pe, s) })).filter(z => z.v > 0);
            return (
              <g key={pe.periode} className={survol != null && survol !== i ? 'graphique-attenue' : ''}>
                {segs.map((z, j) => {
                  const haut = y(base) - y(base + z.v);
                  base += z.v;
                  const dernier = j === segs.length - 1;
                  // NOTE: 2 px de surface entre deux segments empilés
                  const h = Math.max(0, haut - (j > 0 ? 2 : 0));
                  return <path key={z.s.cle} className={`serie-${z.s.cle}`} d={dernier ? colonne(x, y(base), l, h, 4) : `M${x},${y(base)}h${l}v${h}h${-l}Z`} />;
                })}
                {totaux[i] > 0 && (survol === i || periodes.length <= 16) && <text x={x + l / 2} y={y(totaux[i]) - 4} textAnchor="middle" className="graphique-valeur">{totaux[i]}</text>}
                {i % pasEtiquette === 0 && <text x={x + l / 2} y={HAUT - 8} textAnchor="middle" className="graphique-axe">{libelle(pe).split(',')[0]}</text>}
                <rect x={MARGE.gauche + i * bande} y={MARGE.haut} width={bande} height={zoneH} fill="transparent" onMouseEnter={() => setSurvol(i)} onFocus={() => setSurvol(i)} tabIndex={0} aria-label={`${libelle(pe)} : ${totaux[i]} actions`} />
              </g>
            );
          })}
        </svg>
        {p && (
          // NOTE: bulle à côté de la colonne survolée, jamais dessus : à gauche dans la moitié droite, à droite sinon
          <div className="graphique-bulle" role="status" style={survol! * bande > zoneL / 2 ? { right: large - (MARGE.gauche + survol! * bande + (bande - l) / 2) + 8, top: 4 } : { left: MARGE.gauche + survol! * bande + (bande + l) / 2 + 8, top: 4 }}>
            <b>{libelle(p)}</b>
            {SERIES.map(s => <div key={s.cle}><span className={`pastille serie-${s.cle}`} aria-hidden="true" />{s.nom}<span>{valeur(p, s)}</span></div>)}
            <div className="muted"><span className="pastille" aria-hidden="true" />Offres détectées<span>{p.offres_detectees ?? 0}</span></div>
          </div>
        )}
      </div>
    </figure>
  );
}
