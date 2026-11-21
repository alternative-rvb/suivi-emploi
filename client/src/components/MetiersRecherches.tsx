import { ArrowDown, ArrowUp, Briefcase, Check, Pencil, Plus, Save, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CATALOGUE, COULEURS_METIER, METIERS_MAX, nouvelleCleMetier, PERSO_MAX, POIDS_PREMIER, poidsMetier } from '../../../lib/metiers.mjs';
import { apercuMetier, enregistrerMetiers, type MetierPerso } from '../api.ts';
import { CATEGORIES } from '../constants.ts';
import { definirMetiers, useMetiers } from '../metiers.ts';
import AideModale from './AideModale.tsx';
import BlocRepliable from './BlocRepliable.tsx';
import MotsEditables from './MotsEditables.tsx';

const NOMS_COULEUR: Record<string, string> = { violet: 'Violet', pink: 'Rose', blue: 'Bleu', emerald: 'Émeraude', orange: 'Orange', amber: 'Ambre', red: 'Rouge', green: 'Vert', grey: 'Gris' };
const vide = (couleur: string): MetierPerso => ({ cle: '', libelle: '', titre: '', mots: [], exclus: [], rome: '', couleur });
const sansAccents = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ajoutMot = (liste: string[], mot: string) => (liste.some(x => sansAccents(x) === sansAccents(mot.trim())) ? liste : [...liste, mot.trim()]);

// ANCHOR: formulaire d'un métier créé par le profil (ligne 266) : nom, mots cherchés dans le titre des annonces, mots à exclure, code ROME facultatif, couleur ; aperçu des offres reconnues
function FormMetier({ initial, onValider, onAnnuler }: { initial: MetierPerso; onValider: (m: MetierPerso) => void; onAnnuler: () => void }) {
  const [m, setM] = useState<MetierPerso>(initial);
  const [apercu, setApercu] = useState<{ total: number; sur: number; exemples: string[] } | null>(null);
  const [erreur, setErreur] = useState('');
  const maj = (p: Partial<MetierPerso>) => { setM(x => ({ ...x, ...p })); setErreur(''); };
  // NOTE: aperçu recalculé par le serveur une demi-seconde après la dernière modification des mots
  useEffect(() => {
    if (!m.mots.length) { setApercu(null); return; }
    let vivant = true;
    const t = setTimeout(() => apercuMetier({ ...m, libelle: m.libelle.trim() || 'Aperçu' }).then(r => vivant && setApercu(r)).catch(() => vivant && setApercu(null)), 500);
    return () => { vivant = false; clearTimeout(t); };
  }, [m.mots.join('|'), m.exclus.join('|')]);
  const valider = () => {
    if (m.libelle.trim().length < 2) return setErreur('Donnez un nom au métier (2 caractères au moins).');
    if (!m.mots.length) return setErreur('Ajoutez au moins un mot à chercher dans le titre des annonces.');
    if (m.rome && !/^[A-Na-n]\d{4}$/.test(m.rome.trim())) return setErreur('Code ROME attendu sous la forme D1102, ou laissez vide.');
    onValider({ ...m, libelle: m.libelle.trim(), titre: m.titre.trim(), rome: m.rome.trim().toUpperCase() });
  };
  return (
    <div className="metier-form" role="group" aria-label={initial.cle ? `Modifier ${initial.libelle}` : 'Nouveau métier'}>
      <div className="metier-form-ligne">
        <label className="field">Nom du métier<input className="input" value={m.libelle} maxLength={40} onChange={e => maj({ libelle: e.target.value })} placeholder="Ex. Boulangerie" /></label>
        <label className="field">Intitulé sur le CV<input className="input" value={m.titre} maxLength={60} onChange={e => maj({ titre: e.target.value })} placeholder={m.libelle || 'Ex. Boulanger'} /></label>
      </div>
      <div className="field">Mots à chercher dans le titre des annonces
        <MotsEditables valeurs={m.mots} label="Mot à chercher" placeholder="Ex. boulang (trouve boulanger, boulangère)" vide="Aucun mot : ce métier ne reconnaîtra aucune offre."
          onAjout={t => maj({ mots: ajoutMot(m.mots, t) })} onRetrait={v => maj({ mots: m.mots.filter(x => x !== v) })} />
      </div>
      <div className="field">Mots à exclure (facultatif)
        <MotsEditables valeurs={m.exclus} label="Mot à exclure" placeholder="Ex. industriel" vide="Aucun."
          onAjout={t => maj({ exclus: ajoutMot(m.exclus, t) })} onRetrait={v => maj({ exclus: m.exclus.filter(x => x !== v) })} />
      </div>
      <div className="metier-form-ligne">
        <label className="field">Code ROME (facultatif)<input className="input" value={m.rome} maxLength={5} onChange={e => maj({ rome: e.target.value })} placeholder="Ex. D1102" /></label>
        <div className="field">Couleur
          <div className="chips" role="radiogroup" aria-label="Couleur du métier">
            {COULEURS_METIER.map(c => (
              <button key={c} type="button" role="radio" aria-checked={m.couleur === c} className={'chip' + (m.couleur === c ? ' on' : '')} style={{ '--c': `var(--c-${c})` } as React.CSSProperties} onClick={() => maj({ couleur: c })} title={NOMS_COULEUR[c]}>
                <span className="dot" /><span className="sr-only">{NOMS_COULEUR[c]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {apercu && (
        <div className="small" role="status">
          {apercu.total} offre(s) reconnue(s) sur {apercu.sur} offre(s) active(s){apercu.exemples.length > 0 && ' :'}
          {apercu.exemples.length > 0 && <ul className="metier-exemples">{apercu.exemples.map(t => <li key={t}>{t}</li>)}</ul>}
        </div>
      )}
      {erreur && <p className="alert" role="alert">{erreur}</p>}
      <div className="admin-actions">
        <button type="button" className="btn btn-primary small" onClick={valider}><Check size={15} />{initial.cle ? 'Valider' : 'Ajouter ce métier'}</button>
        <button type="button" className="btn btn-ghost small" onClick={onAnnuler}><X size={15} />Annuler</button>
      </div>
    </div>
  );
}

// ANCHOR: métiers recherchés par le profil (lignes 260 et 266) : choix dans le catalogue de lib/metiers.mjs ou métiers créés, ordre = poids dans le score ; enregistrés à part des listes de recherche (/api/metiers)
export default function MetiersRecherches() {
  const { liste, perso, charge } = useMetiers();
  const [brouillon, setBrouillon] = useState<string[]>(liste);
  const [persoB, setPersoB] = useState<MetierPerso[]>(perso);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  // NOTE: formulaire ouvert : 'nouveau', la clé du métier modifié, ou rien ; suppression confirmée dans la ligne
  const [edition, setEdition] = useState('');
  const [aSupprimer, setASupprimer] = useState('');
  // NOTE: le brouillon suit la liste chargée tant qu'il n'a pas été modifié
  const [touche, setTouche] = useState(false);
  const signature = (l: string[], p: MetierPerso[]) => JSON.stringify([l, p]);
  useEffect(() => { if (!touche) { setBrouillon(liste); setPersoB(perso); } }, [signature(liste, perso), touche]);

  const modifie = signature(brouillon, persoB) !== signature(liste, perso);
  const maj = (l: string[], p = persoB) => { setBrouillon(l); setPersoB(p); setTouche(true); setErreur(''); setMessage(''); };
  const deplacer = (i: number, d: number) => { const l = [...brouillon]; [l[i], l[i + d]] = [l[i + d], l[i]]; maj(l); };
  const restants = CATALOGUE.filter(m => !brouillon.includes(m.cle));
  const persoHors = persoB.filter(m => !brouillon.includes(m.cle));
  const plein = brouillon.length >= METIERS_MAX;
  const libelle = (c: string) => persoB.find(m => m.cle === c)?.libelle ?? CATEGORIES[c]?.label ?? c;
  const couleur = (c: string) => { const p = persoB.find(m => m.cle === c); return p ? `var(--c-${p.couleur})` : CATEGORIES[c]?.color; };
  const sauver = async () => {
    setOccupe(true); setErreur(''); setMessage('');
    try {
      const r = await enregistrerMetiers(brouillon, persoB);
      definirMetiers(r.metiers, r.perso);
      setBrouillon(r.metiers); setPersoB(r.perso); setTouche(false);
      setMessage('Métiers enregistrés : scores, colonnes et listes de métiers sont à jour.');
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  const valider = (m: MetierPerso) => {
    if (m.cle) { maj(brouillon, persoB.map(x => (x.cle === m.cle ? m : x))); setEdition(''); return; }
    const neuf = { ...m, cle: nouvelleCleMetier() };
    maj(plein ? brouillon : [...brouillon, neuf.cle], [...persoB, neuf]);
    setEdition('');
  };
  const supprimer = (c: string) => { maj(brouillon.filter(x => x !== c), persoB.filter(x => x.cle !== c)); setASupprimer(''); };
  const couleurLibre = COULEURS_METIER.find(c => !persoB.some(m => m.couleur === c) && !CATALOGUE.some(m => brouillon.includes(m.cle) && m.couleur === c)) ?? 'grey';
  const estPerso = (c: string) => persoB.some(m => m.cle === c);

  // NOTE: actions d'un métier créé (modifier, supprimer avec confirmation dans la ligne), communes à la liste et aux métiers créés hors liste
  const actionsPerso = (c: string) => (aSupprimer === c ? (
    <span className="metiers-confirme">
      <span className="small">Supprimer ce métier ?</span>
      <button type="button" className="btn btn-danger small" onClick={() => supprimer(c)}><Trash2 size={14} />Supprimer</button>
      <button type="button" className="btn btn-ghost small" onClick={() => setASupprimer('')}>Garder</button>
    </span>
  ) : (
    <>
      <button type="button" className="btn btn-ghost icon small" onClick={() => setEdition(c)} aria-label={`Modifier ${libelle(c)}`} title="Modifier"><Pencil size={14} /></button>
      <button type="button" className="btn btn-ghost icon small" onClick={() => setASupprimer(c)} aria-label={`Supprimer ${libelle(c)}`} title="Supprimer le métier créé"><Trash2 size={14} /></button>
    </>
  ));

  return (
    <BlocRepliable id="metiers" memoire="recherche" Icone={Briefcase} titre="Métiers recherchés"
      pastille={modifie ? <span className="warn small">modifié</span> : null}
      resume={liste.length ? liste.map(libelle).join(', ') : charge ? 'aucun métier choisi' : ''}>
      <div className="small">
        Les métiers visés classent les offres et organisent l'application : colonnes de « Candidatures à faire », CV et lettres par métier, poids des puces, marché local.
        <AideModale titre="Métiers recherchés">
          <ul>
            <li>Chaque offre reçoit un métier d'après son intitulé. Une offre d'un métier absent de la liste est rangée dans « Autre ».</li>
            <li>L'ordre compte : le premier métier ajoute {POIDS_PREMIER} points au score des offres (sur 100), puis un de moins à chaque rang, 8 au minimum.</li>
            <li>Sans aucun métier choisi, tous les métiers du catalogue sont proposés et aucun ne compte dans le score.</li>
            <li>Un métier absent du catalogue se crée avec « Créer un métier » : son nom, les mots à chercher dans le titre des annonces (« boulang » trouve boulanger et boulangère) et, si besoin, des mots à exclure. Une offre dont le titre contient un de ces mots est rangée dans ce métier, avant les métiers du catalogue. L'aperçu montre les offres reconnues.</li>
            <li>Le code ROME (fiche métier de France Travail) est facultatif : sans lui, le marché local et les candidatures spontanées ne proposent pas ce métier.</li>
            <li>{METIERS_MAX} métiers au plus dans la liste, {PERSO_MAX} métiers créés au plus. Les réglages déjà faits pour un métier retiré (intitulés, poids des puces) sont gardés et reviennent s'il est ajouté de nouveau.</li>
          </ul>
        </AideModale>
      </div>
      {brouillon.length > 0 ? (
        <ol className="metiers-liste">
          {brouillon.map((c, i) => (
            <li key={c} className="metiers-ligne" style={{ '--c': couleur(c) } as React.CSSProperties}>
              <span className="dot" aria-hidden="true" /><span className="metiers-nom">{libelle(c)}{estPerso(c) && <span className="muted small"> (créé)</span>}</span>
              <span className="muted small">{poidsMetier(brouillon, c)} pts</span>
              <button type="button" className="btn btn-ghost icon small" disabled={i === 0} onClick={() => deplacer(i, -1)} aria-label={`Monter ${libelle(c)}`} title="Monter"><ArrowUp size={14} /></button>
              <button type="button" className="btn btn-ghost icon small" disabled={i === brouillon.length - 1} onClick={() => deplacer(i, 1)} aria-label={`Descendre ${libelle(c)}`} title="Descendre"><ArrowDown size={14} /></button>
              <button type="button" className="btn btn-ghost icon small" onClick={() => maj(brouillon.filter(x => x !== c))} aria-label={`Retirer ${libelle(c)}`} title="Retirer de la liste"><X size={14} /></button>
              {estPerso(c) && actionsPerso(c)}
              {edition === c && <FormMetier initial={persoB.find(m => m.cle === c) ?? vide('grey')} onValider={valider} onAnnuler={() => setEdition('')} />}
            </li>
          ))}
        </ol>
      ) : <p className="muted small">Aucun métier choisi : tous les métiers du catalogue sont proposés.</p>}
      {persoHors.length > 0 && (
        <ul className="metiers-liste" aria-label="Métiers créés hors de la liste">
          {persoHors.map(m => (
            <li key={m.cle} className="metiers-ligne" style={{ '--c': `var(--c-${m.couleur})` } as React.CSSProperties}>
              <span className="dot" aria-hidden="true" /><span className="metiers-nom">{m.libelle}<span className="muted small"> (créé, hors liste)</span></span>
              <button type="button" className="btn btn-ghost small" disabled={plein} onClick={() => maj([...brouillon, m.cle])}><Plus size={14} />Ajouter</button>
              {actionsPerso(m.cle)}
              {edition === m.cle && <FormMetier initial={m} onValider={valider} onAnnuler={() => setEdition('')} />}
            </li>
          ))}
        </ul>
      )}
      {restants.length > 0 && (
        <div className="chips" role="group" aria-label="Ajouter un métier">
          {restants.map(m => (
            <button key={m.cle} type="button" className="chip" style={{ '--c': CATEGORIES[m.cle]?.color } as React.CSSProperties} disabled={plein} onClick={() => maj([...brouillon, m.cle])}>
              <Plus size={13} aria-hidden="true" /><span className="chip-libelle">{m.libelle}</span>
            </button>
          ))}
        </div>
      )}
      {edition === 'nouveau'
        ? <FormMetier initial={vide(couleurLibre)} onValider={valider} onAnnuler={() => setEdition('')} />
        : <button type="button" className="btn btn-ghost small" disabled={persoB.length >= PERSO_MAX} onClick={() => { setEdition('nouveau'); setASupprimer(''); }}><Plus size={15} />Créer un métier</button>}
      {erreur && <p className="alert" role="alert">{erreur}</p>}
      {message && <p className="small" role="status">{message}</p>}
      <div className="admin-actions">
        <button type="button" className="btn btn-primary small" onClick={sauver} disabled={!modifie || occupe}><Save size={15} />Enregistrer les métiers</button>
        <button type="button" className="btn btn-ghost small" onClick={() => { setBrouillon(liste); setPersoB(perso); setTouche(false); setEdition(''); setASupprimer(''); setErreur(''); setMessage('Modifications annulées.'); }} disabled={!modifie || occupe}><Undo2 size={15} />Annuler</button>
      </div>
    </BlocRepliable>
  );
}
