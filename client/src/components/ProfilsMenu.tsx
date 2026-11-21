import { Check, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ProfilRecherche } from '../../../types';
import { chargerProfils, creerProfil, modifierProfil, supprimerProfil } from '../api.ts';
import { ouvrirProfil } from '../profil.ts';
import { useMemoire } from '../utils.ts';
import AideModale from './AideModale.tsx';

const COULEURS: [ProfilRecherche['couleur'], string][] = [['', 'Sans couleur'], ['bleu', 'Bleu'], ['vert', 'Vert'], ['orange', 'Orange'], ['violet', 'Violet'], ['rouge', 'Rouge'], ['gris', 'Gris']];

const Pastille = ({ couleur }: { couleur: string }) => <span className={'profil-pastille' + (couleur ? ' profil-' + couleur : '')} aria-hidden="true" />;

function ChoixCouleur({ valeur, onChange, nom }: { valeur: string; onChange: (c: ProfilRecherche['couleur']) => void; nom: string }) {
  return (
    <div className="profil-couleurs" role="radiogroup" aria-label={`Couleur ${nom}`}>
      {COULEURS.map(([c, l]) => (
        <button key={c || 'aucune'} type="button" role="radio" aria-checked={valeur === c} title={l} aria-label={l} className={'profil-couleur' + (valeur === c ? ' on' : '')} onClick={() => onChange(c)}><Pastille couleur={c} /></button>
      ))}
    </div>
  );
}

// ANCHOR: sélecteur de profil de la barre du haut (ligne 263) : changer de profil, en créer, renommer ou supprimer ; avantChangement envoie d'abord les modifications en attente
export default function ProfilsMenu({ avantChangement }: { avantChangement: () => Promise<boolean> }) {
  const [profils, setProfils] = useState<ProfilRecherche[] | null>(null);
  const [actif, setActif] = useState('');
  // NOTE: nom et couleur mémorisés pour afficher le bouton dès le premier rendu, sans attendre la liste (la barre ne bouge pas)
  const [affiche, setAffiche] = useMemoire('profil.affiche', { nom: 'Mon profil', couleur: '' });
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState('');
  const [nouveau, setNouveau] = useState<{ nom: string; couleur: ProfilRecherche['couleur'] }>({ nom: '', couleur: 'bleu' });
  const [edition, setEdition] = useState<{ id: string; nom: string; couleur: ProfilRecherche['couleur'] } | null>(null);
  const [aSupprimer, setASupprimer] = useState('');
  const [occupe, setOccupe] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  const charger = () => chargerProfils().then(d => {
    setProfils(d.profils); setActif(d.actif);
    const p = d.profils.find(x => x.id === d.actif);
    if (p) setAffiche({ nom: p.nom, couleur: p.couleur });
  }).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  useEffect(() => { if (ouvert) ref.current?.showModal(); }, [ouvert]);
  const fermer = () => { setOuvert(false); setEdition(null); setASupprimer(''); setErreur(''); };

  const agir = async (f: () => Promise<unknown>) => {
    setOccupe(true); setErreur('');
    try { await f(); await charger(); } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  const changer = async (p: ProfilRecherche) => {
    if (p.id === actif) return;
    setOccupe(true);
    if (!(await avantChangement())) { setErreur('Des modifications n\'ont pas pu être enregistrées : réessayez avant de changer de profil.'); setOccupe(false); return; }
    ouvrirProfil(p.id, p.defaut);
  };
  const creer = () => agir(async () => {
    const p = await creerProfil({ nom: nouveau.nom.trim(), couleur: nouveau.couleur });
    setNouveau({ nom: '', couleur: 'bleu' });
    await changer(p);
  });

  return (
    <>
      <button type="button" className="btn btn-ghost small profil-bouton" onClick={() => setOuvert(true)} aria-haspopup="dialog" title={`Profil ouvert : ${affiche.nom}. Changer de profil`}>
        <Users size={15} aria-hidden="true" /><Pastille couleur={affiche.couleur} /><span className="profil-bouton-nom">{affiche.nom}</span>
      </button>
      {ouvert && (
        <dialog ref={ref} className="dialog profils-dialog" onClose={fermer} onClick={e => { if (e.target === ref.current) fermer(); }}>
          <header className="dialog-head">
            <h2><Users size={17} aria-hidden="true" /> Profils<AideModale titre="Profils">
              <p>Un profil est une recherche à part : ses candidatures, son parcours, ses CV et lettres, ses contacts, son agenda et ses réglages (zone, mots-clés, type de recherche emploi, alternance ou stage).</p>
              <ul>
                <li>Les offres trouvées sont communes, mais chaque profil a son propre état : vue, écartée, épinglée, note.</li>
                <li>La synchronisation cherche les offres de chaque profil qui a ses propres réglages de recherche.</li>
                <li>Le profil par défaut, celui de l'installation, ne peut pas être supprimé.</li>
                <li>Supprimer un autre profil efface tout ce qui lui appartient.</li>
              </ul>
              <p>Le profil choisi est gardé par ce navigateur. Les profils ne sont pas protégés par un mot de passe.</p>
            </AideModale></h2>
            <button type="button" className="btn btn-ghost icon" onClick={fermer} aria-label="Fermer" title="Fermer"><X size={16} /></button>
          </header>
          <div className="dialog-body">
            {!profils && !erreur && <p className="muted small">Chargement des profils...</p>}
            {profils && (
              <ul className="profils-liste">
                {profils.map(p => (
                  <li key={p.id} className={'profils-ligne' + (p.id === actif ? ' on' : '')}>
                    {edition?.id === p.id ? (
                      <form className="profils-edition" onSubmit={e => { e.preventDefault(); agir(async () => { await modifierProfil(p.id, { nom: edition.nom.trim(), couleur: edition.couleur }); setEdition(null); }); }}>
                        <input className="input" value={edition.nom} maxLength={40} aria-label="Nom du profil" autoFocus onChange={e => setEdition({ ...edition, nom: e.target.value })} />
                        <ChoixCouleur valeur={edition.couleur} nom={p.nom} onChange={c => setEdition({ ...edition, couleur: c })} />
                        <button type="submit" className="btn btn-primary small" disabled={occupe || !edition.nom.trim()}><Check size={15} />Enregistrer</button>
                        <button type="button" className="btn btn-ghost small" onClick={() => setEdition(null)}>Annuler</button>
                      </form>
                    ) : aSupprimer === p.id ? (
                      <div className="profils-confirmation" role="alert">
                        <span>Supprimer « {p.nom} » et tout ce qui lui appartient (candidatures, parcours, CV, lettres, contacts, réglages) ?</span>
                        <button type="button" className="btn btn-danger small" disabled={occupe} onClick={() => agir(async () => { await supprimerProfil(p.id); setASupprimer(''); })}><Trash2 size={15} />Supprimer</button>
                        <button type="button" className="btn btn-ghost small" onClick={() => setASupprimer('')}>Annuler</button>
                      </div>
                    ) : (
                      <>
                        <button type="button" className="profils-choix" aria-current={p.id === actif ? 'true' : undefined} disabled={occupe} onClick={() => changer(p)}>
                          <Pastille couleur={p.couleur} /><span>{p.nom}</span>
                          {p.defaut && <span className="muted small">par défaut</span>}
                          {p.id === actif && <span className="muted small">ouvert</span>}
                        </button>
                        <button type="button" className="btn btn-ghost icon small" title="Renommer" aria-label={`Renommer ${p.nom}`} onClick={() => { setASupprimer(''); setEdition({ id: p.id, nom: p.nom, couleur: p.couleur }); }}><Pencil size={15} /></button>
                        {!p.defaut && p.id !== actif && <button type="button" className="btn btn-ghost icon small" title="Supprimer" aria-label={`Supprimer ${p.nom}`} onClick={() => { setEdition(null); setASupprimer(p.id); }}><Trash2 size={15} /></button>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form className="profils-nouveau" onSubmit={e => { e.preventDefault(); creer(); }}>
              <h3 className="carte-titre"><Plus size={16} aria-hidden="true" />Nouveau profil</h3>
              <input className="input" placeholder="Nom (ex. Alternance)" value={nouveau.nom} maxLength={40} aria-label="Nom du nouveau profil" onChange={e => setNouveau({ ...nouveau, nom: e.target.value })} />
              <ChoixCouleur valeur={nouveau.couleur} nom="du nouveau profil" onChange={c => setNouveau({ ...nouveau, couleur: c })} />
              <button type="submit" className="btn btn-primary small" disabled={occupe || !nouveau.nom.trim()}><Plus size={15} />Créer et ouvrir</button>
            </form>
            {erreur && <p className="alert" role="alert">{erreur}</p>}
          </div>
        </dialog>
      )}
    </>
  );
}
