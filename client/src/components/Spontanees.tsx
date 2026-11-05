import { Ban, Bookmark, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { chargerEntreprises, chargerSuiviEntreprises, majSuiviEntreprise } from '../api.ts';
import type { Entreprise, StatutEntreprise, SuiviEntreprises } from '../api.ts';
import { CATEGORIES } from '../constants.ts';
import { useMemoire } from '../utils.ts';
import AideModale from './AideModale.tsx';
import FiltresPastilles from './FiltresPastilles.tsx';
import { SqListe } from './Squelettes.tsx';

// ANCHOR: un code ROME par métier visé, pour interroger La Bonne Boite
const METIERS: [string, string][] = [['dev_web', 'M1805'], ['comptabilite', 'M1203'], ['formateur_digital', 'K2111'], ['web_design', 'E1205']];
// NOTE: libellés courts pour que les quatre métiers tiennent sur une ligne
const LIBELLES = { dev_web: 'Dev web', comptabilite: 'Comptabilité', formateur_digital: 'Formateur digital', web_design: 'Web design' };
const DISTANCES = [20, 30, 50];
const ETATS: [string, string, string][] = [['a_trier', 'À trier', 'var(--c-grey)'], ['gardee', 'Gardées', 'var(--c-amber)'], ['contactee', 'Contactées', 'var(--c-emerald)'], ['ecartee', 'Écartées', 'var(--c-grey)']];
const ACTIONS: [StatutEntreprise, string, typeof Bookmark][] = [['gardee', 'Garder', Bookmark], ['contactee', 'Contactée', Send], ['ecartee', 'Écarter', Ban]];

const statutDe = (suivi: SuiviEntreprises, e: Entreprise) => suivi[e.siret]?.statut ?? 'a_trier';

// ANCHOR: candidatures spontanées (API La Bonne Boite) : entreprises à fort potentiel d'embauche autour du premier point de départ des trajets, hors offres publiées
// NOTE: la décision (gardée, contactée, écartée) est enregistrée par SIRET côté serveur, rien d'autre de la réponse n'est gardé
export default function Spontanees() {
  const [f, setF] = useMemoire('spontanees.filtres', { metier: 'dev_web', distance: 30, etat: 'a_trier' });
  const [donnees, setDonnees] = useState<{ actif: boolean; depart?: string; total: number; entreprises: Entreprise[] } | null>(null);
  const [suivi, setSuivi] = useState<SuiviEntreprises>({});
  const [erreur, setErreur] = useState('');
  const rome = METIERS.find(([m]) => m === f.metier)?.[1] ?? METIERS[0][1];

  useEffect(() => { chargerSuiviEntreprises().then(r => setSuivi(r.suivi)).catch(e => setErreur(e.message)); }, []);
  useEffect(() => {
    let vivant = true;
    setDonnees(null);
    setErreur('');
    chargerEntreprises(rome, f.distance).then(r => vivant && setDonnees(r)).catch(e => { if (vivant) { setErreur(e.message); setDonnees({ actif: true, total: 0, entreprises: [] }); } });
    return () => { vivant = false; };
  }, [rome, f.distance]);

  const compte = etat => (donnees?.entreprises ?? []).filter(e => statutDe(suivi, e) === etat).length;
  const liste = useMemo(() => (donnees?.entreprises ?? []).filter(e => statutDe(suivi, e) === f.etat), [donnees, suivi, f.etat]);

  // NOTE: mise à jour immédiate, annulée si le serveur refuse ; un second clic sur le statut actif le retire
  const decider = (e: Entreprise, statut: StatutEntreprise) => {
    const avant = suivi[e.siret];
    const suite = avant?.statut === statut ? null : statut;
    setSuivi(s => {
      const n = { ...s };
      if (suite) n[e.siret] = { statut: suite, nom: e.nom, ville: e.ville, maj: new Date().toISOString() };
      else delete n[e.siret];
      return n;
    });
    majSuiviEntreprise(e.siret, { statut: suite, nom: e.nom, ville: e.ville }).catch(err => {
      setErreur(err.message);
      setSuivi(s => {
        const n = { ...s };
        if (avant) n[e.siret] = avant;
        else delete n[e.siret];
        return n;
      });
    });
  };

  return (
    <section className="carte spontanees" aria-labelledby="titre-spontanees">
      <h2 id="titre-spontanees" className="carte-titre">
        Candidatures spontanées
        <AideModale titre="Candidatures spontanées">
          <p>Cet espace propose des entreprises qui recrutent souvent, même sans offre publiée. Il sert à envoyer une candidature spontanée, en plus des annonces de l'onglet Offres.</p>
          <h3 className="carte-titre">Chercher</h3>
          <ul>
            <li>Choisissez un métier : un code ROME est interrogé pour chacun.</li>
            <li>Choisissez un rayon : la distance se compte à vol d'oiseau depuis le premier point de départ de Admin, section Trajets.</li>
          </ul>
          <h3 className="carte-titre">Lire une ligne</h3>
          <p>Chaque entreprise affiche sa ville, sa distance, son effectif, son secteur et un potentiel d'embauche. Le potentiel est le score d'embauche calculé par La Bonne Boite : plus il est haut, plus l'entreprise a de chances d'embaucher.</p>
          <h3 className="carte-titre">Noter votre décision</h3>
          <ul>
            <li><b>Garder</b> : l'entreprise vous intéresse, vous la contacterez plus tard.</li>
            <li><b>Contactée</b> : vous lui avez déjà écrit.</li>
            <li><b>Écarter</b> : elle ne vous intéresse pas, elle quitte la liste À trier.</li>
          </ul>
          <p>Un second clic sur le bouton actif annule la décision : l'entreprise redevient « à trier ».</p>
          <h3 className="carte-titre">Retrouver vos choix</h3>
          <p>Les quatre filtres À trier, Gardées, Contactées et Écartées n'affichent qu'une catégorie à la fois. Le chiffre indique le nombre d'entreprises de la recherche en cours dans cette catégorie. Votre décision est mémorisée par entreprise : elle reste affichée quand vous changez de métier ou de rayon, si l'entreprise réapparaît.</p>
          <p className="small muted">Les entreprises viennent de l'API La Bonne Boite de France Travail et sont gardées 6 heures en mémoire. Seules vos décisions sont enregistrées dans la base.</p>
        </AideModale>
      </h2>
      <p className="muted small">Entreprises à fort potentiel d'embauche, hors offres publiées{donnees?.depart ? <>, autour de « {donnees.depart} »</> : null}.</p>

      <div className="chips chips-compact" role="group" aria-label="Métier">
        {METIERS.map(([m]) => (
          <button key={m} type="button" className={'chip' + (f.metier === m ? ' on' : '')} style={{ '--c': CATEGORIES[m].color } as React.CSSProperties} aria-pressed={f.metier === m} onClick={() => setF({ ...f, metier: m })}>
            <span className="dot" /><span className="chip-libelle">{LIBELLES[m]}</span>
          </button>
        ))}
        <span className="spont-rayon" role="group" aria-label="Rayon">
          {DISTANCES.map(d => <button key={d} type="button" className={'btn btn-ghost small' + (f.distance === d ? ' on' : '')} aria-pressed={f.distance === d} onClick={() => setF({ ...f, distance: d })}>{d} km</button>)}
        </span>
      </div>

      {donnees && donnees.actif && (
        <FiltresPastilles label="Suivi" valeur={f.etat} onChange={etat => setF({ ...f, etat })} items={ETATS.map(([cle, libelle, couleur]) => ({ cle, libelle, couleur, nombre: compte(cle) }))} />
      )}

      {erreur && <p className="alert" role="alert">{erreur}</p>}
      {!donnees ? <SqListe n={5} label="Chargement des entreprises" />
        : !donnees.actif ? <p className="muted small">La Bonne Boite n'est pas activée : ajoutez <code>FT_SCOPE_BONNEBOITE</code> au fichier <code>.env</code> (voir <code>.env.example</code>), puis relancez le serveur.</p>
        : liste.length === 0 ? (!erreur && <p className="muted small">{donnees.entreprises.length === 0 ? 'Aucune entreprise trouvée pour ce métier et ce rayon.' : 'Rien dans cette liste.'}</p>)
        : (
          <ul className="spont-liste">
            {liste.map(e => {
              const statut = suivi[e.siret]?.statut;
              return (
                <li key={e.siret} className="spont-ligne">
                  <div className="auj-postuler-corps">
                    <span className="auj-postuler-titre">{e.nom}</span>
                    <span className="small muted">{[e.ville, e.distance_km != null && `${String(e.distance_km).replace('.', ',')} km`, e.effectif && `${e.effectif} salariés`, e.secteur, e.potentiel != null && `potentiel ${String(e.potentiel).replace('.', ',')}`].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="spont-actions">
                    {ACTIONS.map(([cle, libelle, Icone]) => (
                      <button key={cle} type="button" className={'btn btn-ghost small' + (statut === cle ? ' on' : '')} aria-pressed={statut === cle} onClick={() => decider(e, cle)} title={statut === cle ? 'Retirer ce statut' : libelle}>
                        <Icone size={14} aria-hidden="true" /><span className="spont-libelle">{libelle}</span>
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      <p className="muted small spont-source">Source : API La Bonne Boite, France Travail.</p>
    </section>
  );
}
