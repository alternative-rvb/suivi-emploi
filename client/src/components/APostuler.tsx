import { Send, Target } from 'lucide-react';
import { Sq } from './Squelettes.tsx';
import { useHauteur } from '../useHauteur.ts';
import { useEffect, useMemo, useState } from 'react';
import { offresActives } from '../comptage.ts';
import { CATEGORIES } from '../constants.ts';
import { niveauScore, preparerScore } from '../score.ts';
import { chargerCentresZone, distanceLieuBonusKm, distanceZoneKm } from '../geo.ts';
import { aujourdhui, joursEntre } from '../utils.ts';
import { METIERS_CV as METIERS } from '../../../lib/cv.mjs';

const NB = 3;
const age = j => (j <= 0 ? "aujourd'hui" : j === 1 ? 'hier' : `il y a ${j} j`);
// NOTE: badge des offres fraîches, détectées il y a moins de 3 jours (même seuil que le badge New de l'onglet Offres)
const FRAICHE_JOURS = 2;
const badgeAge = j => (j <= 0 ? "aujourd'hui" : `${j}j`);
const nouvelles = n => (n ? `${n} nouvelle${n > 1 ? 's' : ''} aujourd'hui` : "Aucune nouvelle aujourd'hui");

// ANCHOR: suggestions de candidature (lignes 93 et 94) : une colonne par métier, offres actives fraîches en tête dans l'ordre aujourd'hui, 1j, 2j (badge d'âge), puis classées par score de pertinence et par fraîcheur à score égal ; compteur des offres détectées aujourd'hui
export default function APostuler({ offres, chargees, candidatures, competences, experiences, projets, ouvrirOffre, allerOffres }) {
  const auj = aujourdhui();
  const { ref, hauteur } = useHauteur('auj.postuler', 367, chargees);
  const [centresPrets, setCentresPrets] = useState(0);
  useEffect(() => { chargerCentresZone().then(() => setCentresPrets(1)); }, []);
  const duJour = o => (o.date_detection || '').slice(0, 10) === auj;
  const jours = o => (o.date_detection ? joursEntre(o.date_detection, auj) : Infinity);
  const fraiche = o => jours(o) <= FRAICHE_JOURS;
  // NOTE: fraîches de la plus récente à la plus ancienne (aujourd'hui, 1j, 2j), les autres ensuite au même rang
  const rang = o => (fraiche(o) ? jours(o) : FRAICHE_JOURS + 1);
  const { colonnes, total } = useMemo(() => {
    const actives = offresActives(offres, candidatures);
    const calcul = preparerScore(competences, auj, experiences, projets, distanceZoneKm, distanceLieuBonusKm);
    const colonnes = METIERS.map(cat => {
      const liste = actives.filter(o => o.categorie === cat);
      const notees = liste.map(o => ({ o, s: calcul(o) }))
        .sort((a, b) => rang(a.o) - rang(b.o) || b.s.total - a.s.total || (b.o.date_detection || '').localeCompare(a.o.date_detection || ''));
      return { cat, suggestions: notees.slice(0, NB), nouvelles: liste.filter(duJour).length };
    });
    return { colonnes, total: colonnes.reduce((n, c) => n + c.nouvelles, 0) };
  }, [offres, candidatures, competences, experiences, projets, auj, centresPrets]);

  return (
    <div className="carte auj-postuler" ref={ref} style={chargees ? undefined : { minHeight: hauteur }}>
      <h3 className="carte-titre">
        <Send size={17} aria-hidden="true" />Candidatures à faire
        {chargees && <button type="button" className="lien auj-postuler-compteur" onClick={() => allerOffres({ nouvelles: true })} title="Offres actives détectées aujourd'hui, ouvertes avec le filtre Nouvelles">{nouvelles(total)}</button>}
      </h3>
      {!chargees ? (
        <div className="auj-postuler-colonnes sqz" aria-busy="true" role="status" aria-label="Chargement des offres">
          {METIERS.map(cat => <div key={cat} className="sq-lignes"><Sq l="50%" h={16} /><Sq h={52} /><Sq h={52} /><Sq h={52} /></div>)}
        </div>
      ) : (
        <div className="auj-postuler-colonnes">
          {colonnes.map(({ cat, suggestions, nouvelles: n }) => (
            <section key={cat} className="auj-postuler-col" style={{ '--c': CATEGORIES[cat].color } as React.CSSProperties} aria-label={CATEGORIES[cat].label}>
              <h4><span className="auj-postuler-cat">{CATEGORIES[cat].label}</span><span className={'auj-postuler-nb' + (n ? ' on' : '')} title="Nouvelles offres détectées aujourd'hui">{n ? `+${n} aujourd'hui` : "0 aujourd'hui"}</span></h4>
              {suggestions.length === 0 ? <p className="muted small">Aucune offre à suggérer.</p> : (
                <ul className="auj-liste">
                  {suggestions.map(({ o, s }) => (
                    <li key={o.id_offre}>
                      <button type="button" className="auj-postuler-ligne" onClick={() => ouvrirOffre(o.id_offre)}>
                        <span className={'score ' + niveauScore(s.total)} title="Score de pertinence sur 100"><Target size={11} />{s.total}</span>
                        <span className="auj-postuler-corps">
                          <span className="auj-postuler-titre">{o.titre}</span>
                          <span className="small muted">
                            {fraiche(o) && <span className="auj-postuler-new" title={`Détectée le ${o.date_detection.slice(0, 10)}`}>{badgeAge(jours(o))}</span>}
                            {[o.entreprise, o.ville || o.lieu, o.date_detection && !fraiche(o) && age(jours(o))].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
