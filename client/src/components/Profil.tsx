import BilanPeriodes from './BilanPeriodes.tsx';
import Badges from './Badges.tsx';
import CarteZone from './CarteZone.tsx';
import Competences from './Competences.tsx';
import Coordonnees from './Coordonnees.tsx';
import Formations from './Formations.tsx';
import ModelesLettre from './ModelesLettre.tsx';
import NoteMarkdown from './NoteMarkdown.tsx';
import ProfilIa from './ProfilIa.tsx';
import Parcours from './Parcours.tsx';
import Projets from './Projets.tsx';
import ReglagesCv from './ReglagesCv.tsx';
import ToutReplier from './ToutReplier.tsx';
import { useRef } from 'react';
import { useMemoire } from '../utils.ts';

const PARTIES = [['badges', 'Synthèse et badges'], ['coord', 'Coordonnées'], ['parcours', 'Parcours'], ['comp', 'Compétences'], ['projets', 'Projets'], ['diplomes', 'Diplômes et certifications'], ['enseignes', 'Titres enseignés'], ['modeles', 'Modèles CV et lettre'], ['notes', 'To-do et veille'], ['bilan', 'Bilan'], ['carte', 'Carte']];

// Tout ce qui décrit le profil, consulté moins souvent que les offres et les candidatures
export default function Profil({ etat, maj, progression, partie: memorisee, setPartie, offres, compCible, compCibleLue, ouvrirCompetence }) {
  // NOTE: une partie mémorisée qui n'existe plus ramène à sa remplaçante (« titres » et « formations » avant la ligne 110), sinon au parcours
  const ANCIENNES = { titres: 'enseignes', formations: 'diplomes', cv: 'parcours' };
  const corps = useRef<HTMLDivElement>(null);
  const [modele, setModele] = useMemoire('profil.modeles', 'cv');
  const partie = ANCIENNES[memorisee] ?? (PARTIES.some(([k]) => k === memorisee) ? memorisee : 'parcours');
  return (
    <section aria-label="Profil">
      <div className="chips" role="tablist" aria-label="Parties du profil">
        {PARTIES.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={partie === k} className={'chip' + (partie === k ? ' on' : '')} onClick={() => setPartie(k)}><span className="dot" />{l}</button>
        ))}
      </div>
      <div className="profil-corps" ref={corps}>
        {partie === 'coord' && <Coordonnees profil={etat.profil} maj={maj} signature={etat.signature} />}
        {partie === 'parcours' && <Parcours etat={etat} maj={maj} allerPartie={setPartie} ouvrirCompetence={ouvrirCompetence} />}
        {partie === 'comp' && <Competences competences={etat.competences} projets={etat.projets} maj={maj} cible={compCible} cibleLue={compCibleLue} />}
        {partie === 'projets' && <Projets projets={etat.projets} competences={etat.competences} maj={maj} />}
        {partie === 'diplomes' && <Formations formations={etat.formations} maj={maj} genre="obtenus" />}
        {partie === 'enseignes' && <Formations formations={etat.formations} competences={etat.competences} experiences={etat.experiences} maj={maj} genre="enseignes" />}
        {partie === 'modeles' && (
          <div className="notes-stack">
            {/* NOTE: deux onglets au lieu d'un empilement : le CV ou la lettre, jamais les deux à l'écran */}
            <div className="segments-barre">
              <div className="segments" role="tablist" aria-label="Modèles">
                {[['cv', 'CV'], ['lettre', 'Lettre de motivation']].map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={modele === k} className={'segment' + (modele === k ? ' on' : '')} onClick={() => setModele(k)}>{l}</button>
                ))}
              </div>
              {/* NOTE: seule la lettre a des blocs repliables ; même place et même geste que dans CV/LM */}
              {modele === 'lettre' && <ToutReplier cible={corps} selecteur="details.bloc-rep" />}
            </div>
            {modele === 'cv' ? <ReglagesCv profil={etat.profil} maj={maj} /> : <ModelesLettre matrice={etat.lettreMatrice} style={etat.lettreStyle} />}
          </div>
        )}
        {partie === 'notes' && (
          <div className="notes-stack">
            <NoteMarkdown titre="To-do et veille" valeur={etat.todo ?? ''} onChange={v => maj({ todo: v })} ouvert />
          </div>
        )}
        {partie === 'bilan' && <BilanPeriodes etat={etat} offres={offres} />}
        {partie === 'carte' && <CarteZone />}
        {/* NOTE: la lecture du Profil par un RH ouvre le Profil, suivie des badges */}
        {partie === 'badges' && (
          <div className="notes-stack">
            <ProfilIa allerProfil={() => setPartie('coord')} progression={progression} />
            <Badges progression={progression} />
          </div>
        )}
      </div>
    </section>
  );
}
