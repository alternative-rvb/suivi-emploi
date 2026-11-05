import { Sparkles } from 'lucide-react';
import { niveauScore } from '../score.ts';
import { dateHeure as heure } from '../format.ts';
import ModalScore from './ModalScore.tsx';

const NIVEAUX = { junior: 'Débutant accepté', assistant: 'Assistant', confirme: 'Confirmé', responsable: 'Responsable', inconnu: 'Non précisé' };
const FAMILLES = { comptabilite: 'Comptabilité', formation: 'Formation', web_design: 'Web design', dev_web: 'Développement web', autre: 'Autre' };
const TELETRAVAIL = { oui: 'Oui', partiel: 'Partiel', non: 'Non', inconnu: 'Non précisé' };

const Ligne = ({ libelle, children }) => (
  <>
    <dt>{libelle}</dt>
    <dd>{children}</dd>
  </>
);
const Citation = ({ texte, verifie }) => texte
  ? <q className={verifie ? '' : 'non-verifie'} title={verifie ? "Phrase retrouvée dans l'annonce" : "Phrase introuvable dans l'annonce, ignorée dans la note"}>{texte}</q>
  : null;

// ANCHOR: ce que le modèle a lu dans l'annonce (réponses brutes avec leur citation) et la note que le code en tire, avec le détail des points
export default function AnalyseIA({ analyse: a, actif }) {
  if (!a) {
    return actif ? <p className="muted small analyse-vide"><Sparkles size={13} /> Analyse IA : cette offre n'a pas encore été analysée.</p> : null;
  }
  return (
    <ModalScore icone={Sparkles} note={a.note} niveau={niveauScore(a.note)} libelle="Analyse IA" legende="Analyse IA : note tirée du texte de l'annonce par le modèle. Cliquer pour le détail.">
      {a.resume && <p className="small analyse-resume">{a.resume}</p>}
      <dl className="analyse-liste">
        <Ligne libelle="Poste">{NIVEAUX[a.niveau] ?? a.niveau}, {FAMILLES[a.famille] ?? a.famille}</Ligne>
        <Ligne libelle="Diplôme exigé">{a.diplome_exige ? <>Oui <Citation texte={a.diplome_citation} verifie={a.verifie?.diplome} /></> : 'Non'}</Ligne>
        <Ligne libelle="Expérience">{a.experience_annees > 0 ? <>{a.experience_annees} an(s) <Citation texte={a.experience_citation} verifie={a.verifie?.experience} /></> : 'Non précisée'}</Ligne>
        <Ligne libelle="Cabinet">{a.cabinet ? "Cabinet d'expertise comptable" : 'Non'}</Ligne>
        <Ligne libelle="Télétravail">{TELETRAVAIL[a.teletravail] ?? a.teletravail}</Ligne>
        {a.salaire_cite && <Ligne libelle="Salaire cité"><Citation texte={a.salaire_cite} verifie /></Ligne>}
        {a.logiciels?.length > 0 && <Ligne libelle="Logiciels">{a.logiciels.map(l => <span key={l} className="tag">{l}</span>)}</Ligne>}
      </dl>
      <ul className="analyse-points" aria-label="Détail de la note">
        <li><span>Base</span><span className="muted small">{a.base}</span></li>
        {a.details.map(d => <li key={d.libelle}><span>{d.libelle}</span><span className={'small ' + (d.points > 0 ? 'plus' : 'moins')}>{d.points > 0 ? '+' : ''}{d.points}</span></li>)}
      </ul>
      <p className="muted small">Analysé par {a.modele ?? 'le modèle'}{a.date ? `, ${heure(a.date)}` : ''}. La note est calculée par l'application à partir de ces réponses, le modèle ne la donne pas.</p>
    </ModalScore>
  );
}
