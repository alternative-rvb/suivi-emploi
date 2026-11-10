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
import PoidsPuces from './PoidsPuces.tsx';
import Projets from './Projets.tsx';
import ReglagesCv from './ReglagesCv.tsx';
import ReglagesRecherche from './ReglagesRecherche.tsx';
import Select from './Select.tsx';
import ToutReplier from './ToutReplier.tsx';
import Trajets from './Trajets.tsx';
import { useRef } from 'react';
import { useMemoire } from '../utils.ts';

// ANCHOR: menu latéral groupé (ligne 255), dans l'ordre du travail : 1 renseigner, 2 filtrer et optimiser, 3 le reste (Autre).
// Toutes les parties restent visibles, un seul clic pour y aller ; sur téléphone, une liste déroulante les remplace.
const GROUPES: { cle: string; titre: string; parties: [string, string][] }[] = [
  { cle: 'renseigner', titre: 'Renseigner', parties: [['parcours', 'Parcours'], ['coord', 'Coordonnées'], ['comp', 'Compétences'], ['projets', 'Projets'], ['diplomes', 'Diplômes et certifications'], ['enseignes', 'Titres enseignés']] },
  { cle: 'optimiser', titre: 'Filtrer et optimiser', parties: [['poids', 'Poids des puces'], ['recherche', "Recherche d'offres"], ['trajets', 'Trajets et revenu'], ['modeles', 'Modèles CV et lettre'], ['badges', 'Synthèse et badges']] },
  { cle: 'reste', titre: 'Autre', parties: [['notes', 'To-do et veille'], ['bilan', 'Bilan'], ['carte', 'Carte']] },
];
const groupeDe = (partie: string) => GROUPES.find(g => g.parties.some(([k]) => k === partie)) ?? GROUPES[0];

// Tout ce qui décrit le profil, consulté moins souvent que les offres et les candidatures
export default function Profil({ etat, maj, progression, partie: memorisee, setPartie, offres, compCible, compCibleLue, ouvrirCompetence }) {
  // NOTE: une partie mémorisée qui n'existe plus ramène à sa remplaçante (« titres » et « formations » avant la ligne 110), sinon au parcours
  const ANCIENNES = { titres: 'enseignes', formations: 'diplomes', cv: 'parcours' };
  const corps = useRef<HTMLDivElement>(null);
  const [modele, setModele] = useMemoire('profil.modeles', 'cv');
  const partie = ANCIENNES[memorisee] ?? (GROUPES.some(g => g.parties.some(([k]) => k === memorisee)) ? memorisee : 'parcours');
  const groupe = groupeDe(partie);
  // NOTE: le menu reste collé en haut ; changer de partie ramène en haut du contenu
  const aller = (k: string) => { setPartie(k); window.scrollTo(0, 0); };
  return (
    <section aria-label="Profil" className="profil">
      <nav className="profil-nav" aria-label="Navigation du profil">
        {GROUPES.map((g, i) => (
          <div key={g.cle} className={'profil-groupe' + (groupe === g ? ' actif' : '')}>
            <p id={`profil-groupe-${g.cle}`} className="profil-groupe-titre"><span className="profil-groupe-num" aria-hidden="true">{i + 1}</span>{g.titre}</p>
            <ul aria-labelledby={`profil-groupe-${g.cle}`}>
              {g.parties.map(([k, l]) => (
                <li key={k}><button type="button" className="profil-lien" aria-current={partie === k ? 'page' : undefined} onClick={() => aller(k)}>{l}</button></li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="profil-choix">
        <Select value={partie} onChange={e => aller(e.target.value)} aria-label="Partie du profil"
          options={GROUPES.flatMap((g, i) => g.parties.map(([k, l]) => [k, `${i + 1}. ${g.titre} › ${l}`]))} />
      </div>
      <div className="profil-corps" ref={corps}>
        {partie === 'coord' && <Coordonnees profil={etat.profil} maj={maj} signature={etat.signature} />}
        {partie === 'parcours' && <Parcours etat={etat} maj={maj} allerPartie={aller} ouvrirCompetence={ouvrirCompetence} />}
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
        {partie === 'recherche' && <ReglagesRecherche />}
        {partie === 'trajets' && <Trajets />}
        {partie === 'poids' && <PoidsPuces experiences={etat.experiences} maj={maj} allerPartie={aller} />}
        {/* NOTE: la lecture du Profil par un RH ouvre le Profil, suivie des badges */}
        {partie === 'badges' && (
          <div className="notes-stack">
            <ProfilIa allerProfil={() => aller('coord')} progression={progression} />
            <Badges progression={progression} />
          </div>
        )}
      </div>
    </section>
  );
}
