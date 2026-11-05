import { Check, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CompetencesOffre as Etat } from '../../../types';
import { competencesDeCandidature, competencesOffre, ignorerCompetence, lancerCompetencesOffre } from '../api.ts';
import { avecCompetence } from '../competences.ts';

const SONDAGE_MS = 2000;
const VISIBLES = 4;
const ANIM_MS = 450;

const SquelettesCartes = () => (
  <ul className="qualifs-grille" aria-hidden="true">
    {[0, 1, 2, 3].map(n => <li key={n}><span className="sq qualif-sq-btn" /><span className="sq qualif-sq-btn" /><span className="sq sq-ligne qualif-sq-nom" /></li>)}
  </ul>
);
const Squelette = () => (
  <section className="qualifs" aria-busy="true" aria-label="Chargement des qualifications">
    <div className="sq sq-titre" />
    <SquelettesCartes />
  </section>
);

// ANCHOR: qualifications demandées par l'annonce, relevées par le modèle local à l'ouverture de l'offre (ligne 148). Coche verte pour ce que le Profil couvre déjà,
// puis « Avez-vous aussi ces qualifications ? » : ✓ ajoute la compétence au Profil (domaine choisi par le modèle, niveaux à renseigner ensuite), ✗ ne la propose plus.
// Avec candidatureId, affichage en lecture seule des qualifications gardées avec la candidature (l'offre est purgée au bout de 21 jours).
export default function CompetencesOffre({ offreId = '', candidatureId = '', actif = true, metier = '', competences = [] as any[], maj = null as any, allerCompetences = null as null | (() => void) }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState('');
  const [toutes, setToutes] = useState(false);
  // NOTE: réponse affichée tout de suite (carte qui se valide ou s'efface, puis sortie de la liste), sans attendre le serveur ; effacée dès que le serveur confirme
  const [choix, setChoix] = useState<Record<string, 'oui' | 'non'>>({});
  const [niveau, setNiveau] = useState('');
  const [partis, setPartis] = useState<Record<string, 'oui' | 'non'>>({});
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lectureSeule = Boolean(candidatureId);

  const suivre = (e: Etat) => {
    setEtat(e);
    clearTimeout(minuteur.current);
    if (e.enCours && !lectureSeule) minuteur.current = setTimeout(() => competencesOffre(offreId).then(suivre).catch(x => setErreur(x.message)), SONDAGE_MS);
  };

  // NOTE: extraction lancée toute seule à l'ouverture d'une offre qui n'en a pas encore (une fois, puis en cache)
  useEffect(() => {
    let vivant = true;
    setEtat(null);
    setErreur('');
    setToutes(false);
    setChoix({});
    setPartis({});
    setNiveau('');
    const charger = lectureSeule ? competencesDeCandidature(candidatureId) : competencesOffre(offreId);
    charger.then(async e => {
      if (!vivant) return;
      // NOTE: même si l'offre est déjà en attente, le POST la remonte en tête de file (c'est celle qu'on regarde)
      if (!lectureSeule && !e.extrait && !e.erreur && actif) e = await lancerCompetencesOffre(offreId);
      if (vivant) suivre(e);
    }).catch(x => vivant && setErreur(x.message));
    return () => { vivant = false; clearTimeout(minuteur.current); };
  }, [offreId, candidatureId, actif]);

  const recharger = () => competencesOffre(offreId).then(suivre).catch(x => setErreur(x.message));
  const repondre = (valeur: string, r: 'oui' | 'non') => {
    setChoix(c => ({ ...c, [valeur]: r }));
    setTimeout(() => setPartis(p => ({ ...p, [valeur]: r })), ANIM_MS);
  };
  const annuler = (valeur: string) => {
    setChoix(({ [valeur]: _, ...reste }) => reste);
    setPartis(({ [valeur]: _, ...reste }) => reste);
  };
  // NOTE: niveau Exécuter choisi au clic (2 à 5) pour que l'ajout compte tout de suite dans le score et le CV ; Enseigner reste à renseigner dans le Profil
  const ajouter = (valeur: string, domaine: string, executer: number | null) => {
    setNiveau('');
    repondre(valeur, 'oui');
    maj({ competences: avecCompetence(competences, domaine || competences[0]?.domaine || 'Autre', valeur, { executer }, metier) });
    // NOTE: le statut est recalculé par le serveur contre le Profil enregistré, après la sauvegarde différée de l'état
    setTimeout(recharger, 1500);
    setTimeout(recharger, 4000);
  };
  const ignorer = async (valeur: string) => {
    repondre(valeur, 'non');
    try { await ignorerCompetence(valeur); await recharger(); } catch (x) { annuler(valeur); setErreur(x.message); }
  };

  // NOTE: dès que le serveur donne le statut définitif, la réponse affichée localement n'a plus lieu d'être
  useEffect(() => {
    const fait = (r: Record<string, 'oui' | 'non'>) => {
      const reste = Object.fromEntries(Object.entries(r).filter(([v]) => !etat?.items.some(i => i.valeur === v && (i.statut === 'profil' || i.statut === 'ignoree'))));
      return Object.keys(reste).length === Object.keys(r).length ? r : reste;
    };
    setChoix(fait);
    setPartis(fait);
  }, [etat]);

  if (lectureSeule && !etat?.extrait) return null;
  // NOTE: squelette tant que la réponse n'est pas là (chargement ou lecture de l'annonce par le modèle)
  if (!etat && !erreur) return lectureSeule ? null : <Squelette />;
  const items = etat?.items ?? [];
  const profil = items.filter(i => i.statut === 'profil' || partis[i.valeur] === 'oui');
  const aTrier = items.filter(i => (i.statut === 'proche' || i.statut === 'absente') && !partis[i.valeur]);
  const affichees = toutes ? aTrier : aTrier.slice(0, VISIBLES);

  return (
    <section className="qualifs" aria-label="Qualifications pour ce poste">
      <h4 className="qualifs-titre">
        <Sparkles size={15} aria-hidden="true" />Vos qualifications pour ce poste
        {!lectureSeule && (
          <span className="qualifs-outils">
            {allerCompetences && <button type="button" className="btn btn-ghost small" onClick={allerCompetences} title="Ouvrir Profil, Compétences"><SlidersHorizontal size={13} aria-hidden="true" />Gérer mes compétences</button>}
            {actif && etat?.extrait && (
              <button type="button" className="btn btn-ghost small" onClick={() => lancerCompetencesOffre(offreId, true).then(suivre).catch(x => setErreur(x.message))} disabled={etat.enCours} title="Relire l'annonce avec le modèle local">
                <RefreshCw size={13} className={etat.enCours ? 'tourne' : ''} />Relancer
              </button>
            )}
          </span>
        )}
      </h4>
      {erreur && <p className="warn small" role="alert">{erreur}</p>}
      {etat?.erreur && !etat.extrait && <p className="muted small">{etat.erreur}</p>}
      {etat?.enCours && <><p className="muted small" role="status"><RefreshCw size={13} className="tourne" /> Lecture de l'annonce par le modèle local...</p><SquelettesCartes /></>}
      {etat?.extrait && items.length === 0 && <p className="muted small">Aucune compétence technique nommée dans cette annonce.</p>}

      {profil.length > 0 && (
        <ul className="qualifs-liste">
          {profil.map(i => (
            <li key={i.valeur} className={i.statut === 'profil' ? undefined : 'qualif-nouveau'} title={i.competence ? `${i.competence} · « ${i.citation} »` : `« ${i.citation} »`}><CheckCircle2 size={16} className="qualif-ok" aria-hidden="true" />{i.valeur}</li>
          ))}
        </ul>
      )}

      {aTrier.length > 0 && (
        <div className="qualifs-question">
          <p className="qualifs-question-titre">{lectureSeule ? 'Aussi demandées par l\'annonce' : 'Avez-vous aussi ces qualifications ?'}</p>
          <ul className="qualifs-grille">
            {affichees.map(i => (
              <li key={i.valeur} className={[choix[i.valeur] && `qualif-${choix[i.valeur]}`, niveau === i.valeur && 'qualif-saisie'].filter(Boolean).join(' ') || undefined} title={`« ${i.citation} »`}>
                {!lectureSeule && (
                  niveau === i.valeur ? (
                    <span className="qualif-niveaux" role="group" aria-label={`Niveau Exécuter pour ${i.valeur}`}>
                      <span className="qualif-niveaux-lib">Exécuter</span>
                      {[2, 3, 4, 5].map(n => <button key={n} type="button" className="qualif-btn" onClick={() => ajouter(i.valeur, i.domaine, n)} title={`Exécuter ${n} sur 5`}>{n}</button>)}
                      <button type="button" className="qualif-btn qualif-btn-texte" onClick={() => ajouter(i.valeur, i.domaine, null)} title="Ajouter sans niveau (à renseigner dans le Profil)">Sans</button>
                      <button type="button" className="qualif-btn" onClick={() => setNiveau('')} aria-label="Annuler" title="Annuler"><X size={15} /></button>
                    </span>
                  ) : (
                    <span className="qualif-boutons">
                      <button type="button" className="qualif-btn" disabled={Boolean(choix[i.valeur])} onClick={() => setNiveau(i.valeur)} aria-label={`Oui, ajouter ${i.valeur} au Profil`} title={`Ajouter au Profil, domaine ${i.domaine}`}><Check size={15} /></button>
                      <button type="button" className="qualif-btn" disabled={Boolean(choix[i.valeur])} onClick={() => ignorer(i.valeur)} aria-label={`Non, ne plus proposer ${i.valeur}`} title="Ne plus proposer"><X size={15} /></button>
                    </span>
                  )
                )}
                <span className="qualif-nom">{i.valeur}{i.statut === 'proche' && <span className="qualif-proche" title={`Proche de ${i.competence}`}>Proche de <strong>{i.competence}</strong></span>}</span>
              </li>
            ))}
          </ul>
          {aTrier.length > VISIBLES && (
            <button type="button" className="qualifs-plus" aria-expanded={toutes} onClick={() => setToutes(v => !v)}>
              {toutes ? 'Voir moins' : 'Voir plus'}{toutes ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
