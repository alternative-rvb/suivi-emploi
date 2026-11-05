import { RefreshCw, Sparkles } from 'lucide-react';
import { SqCarte } from './Squelettes.tsx';
import { CATEGORIES } from '../constants.ts';
import { dateHeure } from '../format.ts';
import { badgesObtenus, grade } from '../progression.ts';
import { useSyntheses } from '../useSyntheses.ts';
import { EcussonGrade, MedailleBadge } from './Insignes.tsx';

const SENIORITES = { debutant: 'Débutant', confirme: 'Confirmé', senior: 'Senior', expert: 'Expert' };

// ANCHOR: carte en tête de Profil > Synthèse et badges (lignes 86 et 108) : lecture du Profil par le modèle local, placé en RH expérimenté, relancée à la demande
export default function ProfilIa({ allerProfil, progression }) {
  const obtenus = badgesObtenus(progression.stats);
  const g = grade(progression.stats.envoyees);
  const { etat, erreur, lancer } = useSyntheses();
  if (!etat) return erreur ? null : <SqCarte lignes={6} label="Chargement du profil vu par un RH" />;
  const s = etat.profil;
  const p = s.resultat;

  return (
    <div className="carte profil-ia">
      <h3 className="carte-titre">
        <Sparkles size={17} aria-hidden="true" />Profil vu par un RH
        {etat.actif && (
          <button type="button" className="btn btn-ghost small titre-outils" onClick={() => lancer('profil')} disabled={s.enCours} title="Faire relire le Profil par le modèle local">
            <RefreshCw size={14} className={s.enCours ? 'tourne' : ''} />{s.enCours ? 'Analyse...' : p ? 'Relancer' : 'Analyser'}
          </button>
        )}
      </h3>
      {!etat.actif && <p className="muted small">Analyse IA désactivée{etat.erreur ? ` : ${etat.erreur}` : ' (ANALYSE_PROVIDER dans le .env).'}</p>}
      {(erreur || s.erreur) && <p className="warn small" role="alert">{erreur || s.erreur}</p>}
      {etat.actif && !p && !s.enCours && <p className="muted small">Pas encore de lecture. Le modèle local, placé en RH expérimenté, lit le <button type="button" className="lien" onClick={allerProfil}>Profil</button> (Coordonnées, Parcours, Compétences, diplômes et certifications obtenus, sans les titres que vous enseignez) et dit à quoi il correspond. Rien ne sort de la machine.</p>}
      {s.enCours && !p && <p className="muted small">Lecture du Profil, comptez une à deux minutes.</p>}
      {p && (
        <>
          {p.titre && <p className="profil-ia-titre">{p.titre}{p.seniorite && <span className="tag">{SENIORITES[p.seniorite]}</span>}</p>}
          {p.correspond && <p className="small">{p.correspond}</p>}
          {p.synthese && <p className="small">{p.synthese}</p>}
          {p.metiers.length > 0 && (
            <ul className="mots" aria-label="Métiers visés">
              {p.metiers.map(m => <li key={m.intitule} className="badge" style={{ '--c': CATEGORIES[m.categorie]?.color }}>{m.intitule}</li>)}
            </ul>
          )}
          {p.points_forts.length > 0 && (
            <>
              <h4 className="profil-ia-rubrique">Points forts</h4>
              <ul className="profil-ia-points">
                {p.points_forts.map(x => <li key={x.point} className="small" title={`Appuyé sur : « ${x.preuve} »`}>{x.point}</li>)}
              </ul>
            </>
          )}
          {p.points_attention?.length > 0 && (
            <>
              <h4 className="profil-ia-rubrique">Ce qu'un recruteur vous demanderait</h4>
              <ul className="profil-ia-points">
                {p.points_attention.map(x => <li key={x} className="small">{x}</li>)}
              </ul>
            </>
          )}
          {p.mots_cles.length > 0 && <p className="profil-ia-mots">{p.mots_cles.map(m => <span key={m} className="tag">{m}</span>)}</p>}
          <p className="muted small">
            {s.modele}, {dateHeure(s.date)}.
            {p.points_ecartes > 0 && ` ${p.points_ecartes} point(s) fort(s) écarté(s), faute de preuve dans le Profil.`}
            {s.a_jour === false && <b className="warn"> Le Profil a changé depuis : à relancer.</b>}
          </p>
        </>
      )}
      {/* ANCHOR: badges gagnés (grade et médailles) sous la lecture du Profil, le détail complet suit dans les cartes en dessous */}
      <ul className="trophees-liste" aria-label="Succès gagnés">
        <li title={g.actuel.mot}><EcussonGrade rang={g.rang} taille={30} /><span className="small">{g.actuel.titre}</span></li>
        {obtenus.map(b => <li key={b.id} title={b.mot}><MedailleBadge famille={b.famille.id} niveau={b.niveau} taille={30} /><span className="small">{b.titre}</span></li>)}
        {obtenus.length === 0 && <li className="muted small">Aucun badge pour l'instant.</li>}
      </ul>
    </div>
  );
}
