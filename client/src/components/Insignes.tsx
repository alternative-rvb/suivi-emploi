import { GRADES } from '../progression.ts';

// ANCHOR: insignes SVG dessinés à la main (ligne 85) : écusson pour les grades, médaille à ruban pour les badges. Couleurs de la palette Material Design.
const FAMILLE: Record<string, string> = { tri: '#2196F3', relance: '#3F51B5', reseau: '#009688', regularite: '#4CAF50', serie: '#E91E63', quotidien: '#FF9800', hebdo: '#795548', entretien: '#9C27B0', refus: '#FF5722', zen: '#00BCD4', defi: '#FFC107' };

// Pictogrammes 24 x 24 en traits, un par famille
const PICTOS: Record<string, string[]> = {
  tri: ['M4 5h16l-6 7v6l-4 2v-8z'],
  relance: ['M3 11 21 3l-8 18-2-8z', 'M11 13 21 3'],
  reseau: ['M6 7h12', 'M6 7l6 11', 'M18 7l-6 11', 'M6 4.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z', 'M18 4.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z', 'M12 15.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z'],
  regularite: ['M6 21V4', 'M6 4h12l-3 4 3 4H6'],
  quotidien: ['M13 3 5 14h6l-1 7 8-11h-6z'],
  hebdo: ['M12 3 3 8l9 5 9-5z', 'M3 13l9 5 9-5', 'M3 17l9 5 9-5'],
  serie: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v5', 'M16 3v5', 'M9 15l2 2 4-4'],
  entretien: ['M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M6 11a6 6 0 0 0 12 0', 'M12 17v4', 'M9 21h6'],
  refus: ['M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z', 'M9 12l2 2 4-4'],
  defi: ['M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z'],
  zen: ['M5 19c0-8 6-14 14-14 0 8-6 14-14 14z', 'M5 19l8-8'],
};

const etoile = (cx: number, cy: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
};

// Médaille d'un badge en deux tons : la couleur de la famille et sa teinte claire (même teinte à faible opacité), sans gris. Le niveau se lit aux étoiles. obtenu à false : seule la teinte claire reste, pictogramme au trait de la couleur.
export function MedailleBadge({ famille, niveau, obtenu = true, taille = 56, titre = '' }) {
  const ton = FAMILLE[famille] ?? '#3F51B5';
  const etoiles = Array.from({ length: niveau }, (_, i) => 32 + (i - (niveau - 1) / 2) * 9);
  return (
    <svg className={'insigne' + (obtenu ? '' : ' verrouille')} width={taille} height={taille * 72 / 64} viewBox="0 0 64 72" role="img" aria-label={titre}>
      {titre && <title>{titre}</title>}
      <path d="M20 44 14 70l9-5 6 6 3-21z" fill={ton} fillOpacity={obtenu ? 1 : 0.35} />
      <path d="M44 44l6 26-9-5-6 6-3-21z" fill={ton} fillOpacity={obtenu ? 1 : 0.35} />
      <circle cx="32" cy="30" r="25" fill={ton} fillOpacity="0.22" stroke={ton} strokeWidth="2" strokeOpacity={obtenu ? 1 : 0.5} />
      <circle cx="32" cy="30" r="18" fill={ton} fillOpacity={obtenu ? 1 : 0.14} />
      <g transform="translate(20 17)" fill="none" stroke={obtenu ? '#fff' : ton} strokeOpacity={obtenu ? 1 : 0.7} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {(PICTOS[famille] ?? []).map((d, i) => <path key={i} d={d} />)}
      </g>
      {etoiles.map((x, i) => <polygon key={i} points={etoile(x, 51.5, 3.4)} fill={ton} fillOpacity={obtenu ? 1 : 0.5} />)}
    </svg>
  );
}

// Écusson d'un grade en deux tons (indigo et sa teinte claire, sans gris) : un à trois chevrons par palier, couronne pour le grade suprême
const INDIGO = '#3F51B5';
export function EcussonGrade({ rang, obtenu = true, taille = 56 }) {
  const supreme = rang === GRADES.length - 1;
  const chevrons = rang === 0 || supreme ? 0 : ((rang - 1) % 3) + 1;
  const titre = GRADES[rang]?.titre ?? '';
  const trait = obtenu ? '#fff' : INDIGO;
  return (
    <svg className={'insigne' + (obtenu ? '' : ' verrouille')} width={taille} height={taille * 72 / 64} viewBox="0 0 64 72" role="img" aria-label={titre}>
      <title>{titre}</title>
      <path d="M32 3 59 13v23c0 18-12 29-27 34C17 65 5 54 5 36V13z" fill={INDIGO} fillOpacity="0.22" stroke={INDIGO} strokeWidth="2" strokeOpacity={obtenu ? 1 : 0.5} />
      <path d="M32 10 52 17.5V36c0 13-8.5 21.5-20 26-11.5-4.5-20-13-20-26V17.5z" fill={INDIGO} fillOpacity={obtenu ? 1 : 0.14} />
      <g fill="none" stroke={trait} strokeOpacity={obtenu ? 1 : 0.7} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        {Array.from({ length: chevrons }, (_, i) => {
          const y = 38 - (chevrons - 1) * 5 + i * 10;
          return <path key={i} d={`M21 ${y - 6}l11 8 11-8`} />;
        })}
      </g>
      {rang === 0 && <circle cx="32" cy="36" r="5" fill={trait} fillOpacity={obtenu ? 1 : 0.7} />}
      {supreme && <path d="M19 44V28l7 6 6-9 6 9 7-6v16z" fill="#fff" fillOpacity={obtenu ? 1 : 0.7} stroke={obtenu ? '#fff' : INDIGO} strokeWidth="2" strokeLinejoin="round" />}
    </svg>
  );
}
