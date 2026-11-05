import { Minus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { chargerMarche } from '../api.ts';
import type { Marche, MetierMarche, PointMarche } from '../api.ts';
import { CATEGORIES } from '../constants.ts';
import AideModale from './AideModale.tsx';
import { SqCarte } from './Squelettes.tsx';

const nombre = (v: number | null) => (v === null ? '·' : v.toLocaleString('fr-FR'));
const decimal = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

// ANCHOR: lecture d'un métier selon son nombre d'offres pour 100 demandeurs ; 100 = autant d'offres que de demandeurs inscrits
// NOTE: seuils propres à l'application (repères de lecture), pas une classification de France Travail
const SEUIL_FAVORABLE = 100;
const SEUIL_MOYEN = 30;
const verdict = (r: number | null) => r === null ? { cle: 'inconnu', libelle: 'Non publié', couleur: 'var(--c-grey)' }
  : r >= SEUIL_FAVORABLE ? { cle: 'favorable', libelle: 'Porteur', couleur: 'var(--c-emerald)' }
  : r >= SEUIL_MOYEN ? { cle: 'moyen', libelle: 'Moyen', couleur: 'var(--c-amber)' }
  : { cle: 'difficile', libelle: 'Très disputé', couleur: 'var(--c-red)' };

// NOTE: échelle logarithmique, car les écarts entre métiers sont très grands (de 9 à plus de 500) ; le trait de repère marque le point 100
const ECHELLE_MAX = 600;
const position = (r: number, max: number) => Math.min(100, (Math.log10(1 + r) / Math.log10(1 + max)) * 100);

// ANCHOR: mini-courbe des offres pour 100 demandeurs sur les derniers trimestres (échelle propre à chaque métier : elle montre la forme de la tendance, pas le niveau)
// NOTE: le niveau se lit sur la barre ; un trimestre non publié interrompt le tracé
function Courbe({ points, couleur }: { points: PointMarche[]; couleur: string }) {
  const valeurs = points.map(p => p.offres_pour_100);
  const connues = valeurs.filter((v): v is number => v !== null);
  if (connues.length < 2) return null;
  const [bas, haut] = [Math.min(...connues), Math.max(...connues)];
  const L = 76, H = 22, marge = 3;
  const x = (i: number) => marge + (i * (L - 2 * marge)) / (valeurs.length - 1);
  const y = (v: number) => (haut === bas ? H / 2 : H - marge - ((v - bas) / (haut - bas)) * (H - 2 * marge));
  const traces: string[] = [];
  let courant = '';
  valeurs.forEach((v, i) => {
    if (v === null) { if (courant) traces.push(courant); courant = ''; return; }
    courant += `${courant ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
  });
  if (courant) traces.push(courant);
  const dernier = valeurs.length - 1;
  const resume = points.map(p => `${p.periode} : ${p.offres_pour_100 === null ? 'non publié' : decimal(p.offres_pour_100)}`).join(', ');
  return (
    <svg className="marche-courbe" width={L} height={H} viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`Offres pour 100 demandeurs par trimestre : ${resume}`}>
      <title>{resume}</title>
      {traces.map((d, i) => <path key={i} d={d} fill="none" stroke={couleur} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />)}
      {valeurs[dernier] !== null && <circle cx={x(dernier)} cy={y(valeurs[dernier] as number)} r="2.4" fill={couleur} />}
    </svg>
  );
}

// NOTE: moins de 5 % d'écart sur un an est présenté comme stable
const evolution = (e: number | null | undefined) => e == null ? null
  : Math.abs(e) < 5 ? { Icone: Minus, libelle: 'Stable sur 1 an', cle: 'stable' }
  : e > 0 ? { Icone: TrendingUp, libelle: `+${e} % sur 1 an`, cle: 'hausse' }
  : { Icone: TrendingDown, libelle: `${e} % sur 1 an`, cle: 'baisse' };

// ANCHOR: carte « Marché local » de l'accueil (API Marché du travail) : pour chaque métier visé, une barre d'offres pour 100 demandeurs et un verdict, pour voir où se concentrer
// NOTE: la carte ne s'affiche pas sans FT_SCOPE_MARCHE dans le .env (même principe que les candidatures spontanées), et reste discrète si l'API est en panne
export default function MarcheLocal() {
  const [marche, setMarche] = useState<Marche | null>(null);
  const [erreur, setErreur] = useState('');
  const [actualisation, setActualisation] = useState(false);

  const charger = (force = false) => {
    setErreur('');
    return chargerMarche(force).then(setMarche).catch(e => setErreur(e.message));
  };
  useEffect(() => { charger(); }, []);
  const actualiser = () => { setActualisation(true); charger(true).finally(() => setActualisation(false)); };

  // NOTE: du métier qui compte le plus d'offres par demandeur au moins porteur ; les valeurs non publiées en dernier
  const metiers = useMemo<MetierMarche[]>(() => [...(marche?.metiers ?? [])].sort((a, b) => (b.offres_pour_100 ?? -1) - (a.offres_pour_100 ?? -1)), [marche]);

  if (marche && !marche.actif) return null;
  if (!marche && !erreur) return <SqCarte lignes={4} label="Chargement du marché local" />;
  const periode = metiers.find(m => m.periode)?.periode;
  const max = Math.max(ECHELLE_MAX, ...metiers.map(m => m.offres_pour_100 ?? 0));
  const reperePct = position(SEUIL_FAVORABLE, max);
  const meilleur = metiers[0]?.offres_pour_100 != null ? metiers[0] : null;

  return (
    <div className="carte marche-local">
      <h3 className="carte-titre">
        <TrendingUp size={17} aria-hidden="true" />Marché local
        <AideModale titre="Marché local">
          <p>Cette carte aide à voir sur quel métier se concentrer : pour chacun, elle compare les offres d'emploi aux demandeurs d'emploi inscrits dans le département de votre zone proche.</p>
          <h4 className="carte-titre">Lire une barre</h4>
          <ul>
            <li><b>Offres pour 100 demandeurs</b> : plus la barre est longue, plus il y a d'offres pour chaque demandeur inscrit. Le trait marque 100, c'est-à-dire autant d'offres que de demandeurs.</li>
            <li><b>Porteur</b> : au moins 100 offres pour 100 demandeurs. <b>Moyen</b> : entre 30 et 100. <b>Très disputé</b> : moins de 30. Ces seuils sont des repères de l'application, pas une classification de France Travail.</li>
            <li>Les chiffres sous la barre : offres du dernier trimestre connu (toutes origines) et demandeurs inscrits en catégorie A (sans activité) pour ce métier.</li>
          </ul>
          <h4 className="carte-titre">Tendance</h4>
          <p>La petite courbe montre l'évolution de ce rapport sur les 8 derniers trimestres, avec la dernière valeur marquée d'un point. Son échelle est propre à chaque métier : elle montre le sens du mouvement, pas le niveau, qui se lit sur la barre. La mention « sur 1 an » compare le dernier trimestre au même trimestre de l'an passé, car les offres varient selon les saisons. Moins de 5 % d'écart se lit « Stable ».</p>
          <h4 className="carte-titre">À savoir</h4>
          <p>Les offres se comptent sur un trimestre et les demandeurs à une date : le rapport donne un ordre de grandeur, pas une probabilité d'être embauché. Beaucoup d'offres sont aussi pourvues sans passer par une annonce, et un métier proche (par exemple formateur et formateur digital) peut être classé sous un autre code. Un point « · » signifie que France Travail ne publie pas la valeur.</p>
          <p className="small muted">Les chiffres viennent de l'API Marché du travail de France Travail, publiés par trimestre. Ils sont gardés en base et mis à jour au plus une fois par jour.</p>
        </AideModale>
        <button type="button" className="btn btn-ghost small icon" onClick={actualiser} disabled={actualisation} aria-label="Actualiser le marché local" title="Actualiser"><RefreshCw size={14} aria-hidden="true" /></button>
      </h3>
      {metiers.length > 0 && (
        <>
          <p className="muted small">
            Offres pour 100 demandeurs inscrits. {meilleur ? <>Le plus porteur : <b>{(CATEGORIES[meilleur.cle] ?? CATEGORIES.autre).label}</b>. </> : null}
            {[marche?.territoire, periode].filter(Boolean).join(', ')}.
          </p>
          <ul className="marche-liste">
            {metiers.map(m => {
              const v = verdict(m.offres_pour_100);
              const cat = CATEGORIES[m.cle] ?? CATEGORIES.autre;
              return (
                <li key={m.cle} className="marche-ligne" style={{ '--v': v.couleur } as React.CSSProperties}>
                  <div className="marche-tete">
                    <span className="badge" style={{ '--c': cat.color } as React.CSSProperties}>{cat.label}</span>
                    <span className={'marche-verdict ' + v.cle}>{v.libelle}</span>
                  </div>
                  <div className="marche-barre" role="img" aria-label={m.offres_pour_100 === null ? 'Valeur non publiée' : `${decimal(m.offres_pour_100)} offres pour 100 demandeurs`}>
                    {m.offres_pour_100 !== null && <span className="marche-rempli" style={{ width: `${position(m.offres_pour_100, max)}%` }} />}
                    <span className="marche-repere" style={{ left: `${reperePct}%` }} />
                  </div>
                  <div className="marche-pied">
                    <span className="small muted marche-chiffres"><b>{m.offres_pour_100 === null ? '·' : decimal(m.offres_pour_100)}</b> pour 100 · {nombre(m.offres)} offres / {nombre(m.demandeurs)} demandeurs</span>
                    {(() => {
                      const ev = evolution(m.evolution_pct);
                      return (
                        <span className="marche-tendance small">
                          <Courbe points={m.historique ?? []} couleur={v.couleur} />
                          {ev && <span className={'marche-evol ' + ev.cle}><ev.Icone size={13} aria-hidden="true" />{ev.libelle}</span>}
                        </span>
                      );
                    })()}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="small muted marche-legende"><span className="marche-repere-legende" aria-hidden="true" />Trait : autant d'offres que de demandeurs</p>
        </>
      )}
      {(erreur || marche?.erreur) && <p className="alert" role="alert">{erreur || marche?.erreur}{marche?.obsolete ? ' Les derniers chiffres connus sont affichés.' : ''}</p>}
      <p className="muted small">Source : API Marché du travail, France Travail.</p>
    </div>
  );
}
