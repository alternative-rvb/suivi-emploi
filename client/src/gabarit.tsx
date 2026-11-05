import { useEffect, type RefObject } from 'react';
import { Sq } from './components/Squelettes.tsx';

// ANCHOR: gabarit des blocs d'une page : après chargement, on relève la position et la taille réelles des blocs principaux (cartes, fiches, colonnes) et on les garde dans le navigateur. Au chargement suivant, le squelette redessine ces blocs aux mêmes places et aux mêmes tailles.
// NOTE: x et largeur sont mémorisés en proportion de la largeur utile (le squelette suit donc une fenêtre redimensionnée), y et hauteur en pixels

type Bloc = { x: number; y: number; w: number; h: number; n: number; r?: number };
type Texte = { x: number; y: number; w: number; h: number; lh: number };
type Gabarit = { hauteur: number; blocs: Bloc[]; textes: Texte[] };

// NOTE: les hauteurs dépendent de la largeur de la fenêtre (retours à la ligne, colonnes) : un gabarit par page et par tranche de 100 px de largeur. Sans gabarit pour la tranche courante, on prend la tranche voisine la plus proche.
const tranche = () => Math.round(window.innerWidth / 100);
const CLE = (page: string, t = tranche()) => `suivi.gabarit3.${page}.${t}`;
// NOTE: éléments portant du texte (ou un champ) : ils deviennent des barres grises de la largeur et de la hauteur réelles du texte, une barre par ligne
const TEXTES = 'h1, h2, h3, h4, h5, p, li, a, button, label, dt, dd, span, b, strong, small, td, th, summary, input, textarea, select';
// NOTE: boutons, badges, pastilles, champs, avatars : relevés comme des boîtes pleines à leur taille exacte (rayon compris) ; le texte qu'ils contiennent n'est pas dessiné
const BOITES = 'button, a, span, small, b, i, label, summary, input, textarea, select, img';
const BLOCS = 'section, article, .carte, .carte-petite, .fiche, .split-liste, .split-detail, .aide, .etats-repli, .bilan-item, .row, .rdv-carte, .auj-groupe';

export function lireGabarit(page: string): Gabarit | null {
  try {
    const t = tranche();
    for (let ecart = 0; ecart <= 12; ecart++) {
      for (const c of ecart ? [t - ecart, t + ecart] : [t]) {
        const g = JSON.parse(localStorage.getItem(CLE(page, c)) ?? 'null');
        if (g?.blocs?.length) return { textes: [], ...g };
      }
    }
  } catch { /* gabarit illisible : squelette générique */ }
  return null;
}

/** Rectangle visible d'un élément : coupé par les conteneurs à défilement ou à débordement masqué (listes et fiches défilantes), null s'il en sort entièrement */
function visible(e: HTMLElement, main: HTMLElement, b: DOMRect): DOMRect | null {
  let haut = b.top, bas = b.bottom, gauche = b.left, droite = b.right;
  for (let a = e.parentElement; a && a !== main; a = a.parentElement) {
    const st = getComputedStyle(a);
    if (st.overflowX === 'visible' && st.overflowY === 'visible') continue;
    const r = a.getBoundingClientRect();
    haut = Math.max(haut, r.top); bas = Math.min(bas, r.bottom); gauche = Math.max(gauche, r.left); droite = Math.min(droite, r.right);
  }
  return bas - haut >= 1 && droite - gauche >= 1 ? new DOMRect(gauche, haut, droite - gauche, bas - haut) : null;
}

/** Élément caché dans un panneau replié (details fermé, hors résumé) ou sans boîte affichée */
const cache = (e: HTMLElement) => {
  if (e.offsetParent === null) return true;
  const d = e.closest('details:not([open])');
  return Boolean(d && !e.closest('summary'));
};

function releve(main: HTMLElement): Gabarit | null {
  const st = getComputedStyle(main);
  const r = main.getBoundingClientRect();
  const gauche = r.left + parseFloat(st.paddingLeft);
  const haut = r.top + parseFloat(st.paddingTop);
  const largeur = main.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
  const hauteur = main.scrollHeight - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom);
  if (largeur < 200 || hauteur < 100) return null;
  // NOTE: tous les niveaux sont relevés (sections, articles, cartes, tuiles, lignes de liste), en ordre du document : un parent est donc dessiné avant ses enfants. Un enfant qui déborde de son parent (liste défilante) est ignoré.
  const blocs: Bloc[] = [];
  const rects = new Map<Element, DOMRect>();
  for (const e of main.querySelectorAll<HTMLElement>(BLOCS)) {
    if (blocs.length >= 90 || cache(e)) continue;
    const b = visible(e, main, e.getBoundingClientRect());
    if (!b || b.height < 24 || b.width < 60) continue;
    // NOTE: un élément sans fond, sans bordure ni ombre n'est qu'une enveloppe de mise en page : il n'est pas dessiné, ses enfants remontent d'un niveau
    const st = getComputedStyle(e);
    const cadre = st.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(st.borderTopWidth) > 0 || parseFloat(st.borderLeftWidth) > 0 || st.boxShadow !== 'none';
    if (!cadre) continue;
    let pere = e.parentElement?.closest(BLOCS) ?? null;
    while (pere && !rects.has(pere)) pere = pere.parentElement?.closest(BLOCS) ?? null;
    const pr = pere ? rects.get(pere) : null;
    if (pr && (b.bottom > pr.bottom + 2 || b.right > pr.right + 2)) continue;
    rects.set(e, b);
    blocs.push({ x: Math.round((b.left - gauche) / largeur * 1000) / 1000, y: Math.round(b.top - haut), w: Math.round(b.width / largeur * 1000) / 1000, h: Math.round(b.height), n: pere ? 1 : 0 });
  }
  const boites = new Set<Element>();
  for (const e of main.querySelectorAll<HTMLElement>(BOITES)) {
    if (blocs.length >= 220 || cache(e)) continue;
    const st = getComputedStyle(e);
    const cadre = e.matches('img, input, textarea, select') || st.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(st.borderTopWidth) > 0;
    if (!cadre || e.matches(BLOCS)) continue;
    if ([...boites].some(b => b.contains(e))) continue;
    let b = visible(e, main, e.getBoundingClientRect());
    if (!b || b.height < 14 || b.width < 14) continue;
    const bloc = (() => { let q = e.closest(BLOCS); while (q && !rects.has(q)) q = q.parentElement?.closest(BLOCS) ?? null; return q ? rects.get(q)! : null; })();
    if (bloc && (b.bottom > bloc.bottom + 2)) continue;
    if (bloc && b.right > bloc.right) b = new DOMRect(b.left, b.top, Math.max(1, bloc.right - b.left), b.height);
    boites.add(e);
    blocs.push({ x: Math.round((b.left - gauche) / largeur * 1000) / 1000, y: Math.round(b.top - haut), w: Math.round(b.width / largeur * 1000) / 1000, h: Math.round(b.height), n: 2, r: Math.min(parseFloat(st.borderTopLeftRadius) || 0, b.height / 2) });
  }
  const textes: Texte[] = [];
  const dansUnBloc = (e: Element) => { let b = e.closest(BLOCS); while (b && !rects.has(b)) b = b.parentElement?.closest(BLOCS) ?? null; return b ? rects.get(b)! : null; };
  const fait = new Set<Element>();
  for (const e of main.querySelectorAll<HTMLElement>(TEXTES)) {
    if (textes.length >= 700 || cache(e)) continue;
    const champ = e.matches('input, textarea, select');
    const propre = champ || [...e.childNodes].some(n => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0);
    if (!propre) continue;
    const pere = e.parentElement?.closest(TEXTES);
    if (pere && fait.has(pere)) continue;
    if ([...boites].some(x => x.contains(e))) continue;
    // NOTE: pour un élément de texte, la barre épouse le texte lui-même (Range), pas la boîte, souvent pleine largeur (titres, paragraphes)
    let b = e.getBoundingClientRect();
    if (!champ) {
      const rg = document.createRange();
      let g: DOMRect | null = null;
      for (const n of e.childNodes) {
        if (n.nodeType !== 3 || !(n.textContent ?? '').trim()) continue;
        rg.selectNodeContents(n);
        const t = rg.getBoundingClientRect();
        if (t.width > 0 && t.height > 0) g = g ? new DOMRect(Math.min(g.left, t.left), Math.min(g.top, t.top), Math.max(g.right, t.right) - Math.min(g.left, t.left), Math.max(g.bottom, t.bottom) - Math.min(g.top, t.top)) : new DOMRect(t.left, t.top, t.width, t.height);
      }
      if (g) b = g;
    }
    const vis = visible(e, main, b);
    if (!vis || vis.top > b.top + 2 || vis.bottom < b.bottom - 2) continue;
    if (b.height < 8 || b.width < 12) continue;
    const bloc = dansUnBloc(e);
    if (bloc && (b.bottom > bloc.bottom + 2)) continue;
    const lh = parseFloat(getComputedStyle(e).lineHeight) || 20;
    if (bloc && b.right > bloc.right) b = new DOMRect(b.left, b.top, Math.max(1, bloc.right - 8 - b.left), b.height);
    fait.add(e);
    textes.push({ x: Math.round((b.left - gauche) / largeur * 1000) / 1000, y: Math.round(b.top - haut), w: Math.round(b.width / largeur * 1000) / 1000, h: Math.round(b.height), lh: Math.round(champ ? b.height : lh) });
  }
  // NOTE: hauteur du gabarit = bas du dernier bloc visible (scrollHeight compterait le contenu des listes défilantes)
  const bas = blocs.reduce((m, b) => Math.max(m, b.y + b.h), 0);
  return blocs.length ? { hauteur: Math.round(Math.min(hauteur, bas)), blocs, textes } : null;
}

/** À poser dans App avant les retours anticipés : relève le gabarit de l'onglet une fois ses données affichées, puis à chaque redimensionnement. */
export function useReleveGabarit(main: RefObject<HTMLElement | null>, page: string, actif: boolean) {
  useEffect(() => {
    if (!actif) return;
    const enregistrer = () => {
      if (!main.current) return;
      const g = releve(main.current);
      if (g) { try { localStorage.setItem(CLE(page), JSON.stringify(g)); } catch { /* stockage indisponible */ } }
    };
    // NOTE: on ne relève que lorsque plus aucun squelette n'est affiché (aria-busy), sinon on mémoriserait la forme du squelette ; sondage chaque seconde, 30 s au plus
    let essais = 0;
    const sonde = setInterval(() => {
      essais++;
      if (!main.current?.querySelector('[aria-busy="true"]') && essais >= 2) { enregistrer(); clearInterval(sonde); }
      else if (essais >= 30) clearInterval(sonde);
    }, 1000);
    const t = [sonde];
    let r: ReturnType<typeof setTimeout>;
    const surTaille = () => { clearTimeout(r); r = setTimeout(enregistrer, 800); };
    window.addEventListener('resize', surTaille);
    return () => { t.forEach(clearInterval); clearTimeout(r); window.removeEventListener('resize', surTaille); };
  }, [main, page, actif]);
}

/** Squelette aux mêmes blocs que la page réelle ; repli sur le squelette générique tant qu'aucun gabarit n'est mémorisé. */
export function SqGabarit({ page, repli, label = 'Chargement' }: { page: string; repli: React.ReactNode; label?: string }) {
  const g = lireGabarit(page);
  if (!g) return <>{repli}</>;
  return (
    <div className="sq-gabarit sqz" style={{ height: g.hauteur }} aria-busy="true" role="status" aria-label={label}>
      {g.blocs.map((b, i) => (
        <div key={i} className={'sq-gabarit-bloc ' + (b.n === 2 ? 'sq' : b.n ? 'sq-gabarit-sous' : b.h < 70 ? 'sq' : 'carte')} style={{ left: `${b.x * 100}%`, top: b.y, width: `${b.w * 100}%`, height: b.h, ...(b.r != null ? { borderRadius: b.r } : {}) }} />
      ))}
      {g.textes.flatMap((t, i) => {
        const lignes = Math.max(1, Math.round(t.h / t.lh));
        const barre = Math.max(8, Math.min(14, Math.round(t.lh * 0.6)));
        return Array.from({ length: lignes }, (_, j) => (
          <div key={i + '-' + j} className="sq sq-gabarit-bloc" style={{ left: `${t.x * 100}%`, top: t.y + j * (t.h / lignes) + ((t.h / lignes) - barre) / 2, width: `${t.w * 100 * (j === lignes - 1 && lignes > 1 ? 0.6 : 1)}%`, height: barre }} />
        ));
      })}
    </div>
  );
}
