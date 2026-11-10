import { Briefcase, Languages, Pencil, Plus, SlidersHorizontal, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { anneesParCategorie } from '../../../lib/parcours.mjs';
import { METIERS_CV, TYPES_EXPERIENCE as VALEURS_TYPE } from '../../../lib/listes.mjs';
import { periodeFormation } from '../../../lib/periode.mjs';
import { clePuce, normaliserPoids, puces } from '../../../lib/cv.mjs';
import { CATEGORIES } from '../constants.ts';
import ImportLinkedin from './ImportLinkedin.tsx';
import Select from './Select.tsx';
import Etiquettes from './Etiquettes.tsx';

// NOTE: valeurs tirées de lib/listes.mjs (celles que le serveur accepte), seuls les libellés vivent ici
const LIBELLES_TYPE = { salarie: 'Salarié', freelance: 'Freelance', formateur: 'Formateur', autre: 'Autre' };
export const TYPES_EXPERIENCE = VALEURS_TYPE.map(k => [k, LIBELLES_TYPE[k] ?? k]);
const OPTIONS_CATEGORIE = Object.entries(CATEGORIES).filter(([k]) => k !== 'toutes').map(([k, c]) => [k, c.label]);
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const VIDE = { poste: '', employeur: '', lieu: '', type: 'salarie', categorie: 'autre', debut: '', fin: '', description: '', competences: [] as string[], intitules: {} as Record<string, string>, poids: {} as Record<string, Record<string, number>> };
// NOTE: même forme que le serveur (ordre de METIERS_CV, espaces retirés, vides supprimés), sinon l'envoi par différence verrait un écart à chaque chargement
const intitulesPropres = (v: Record<string, string> = {}) => Object.fromEntries(METIERS_CV.map(m => [m, (v[m] ?? '').trim()]).filter(([, t]) => t));

// NOTE: mois en nombre continu, pour la durée et le tri de la frise
const indice = (m: string) => (/^\d{4}-\d{2}$/.test(m ?? '') ? Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 : null);
const moisLisible = (m: string) => (indice(m) === null ? '' : `${MOIS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`);
const ans = (n: number) => `${String(n).replace('.', ',')} an${n >= 2 ? 's' : ''}`;

export function dureeLisible(debut: string, fin: string) {
  const d = indice(debut);
  if (d === null) return '';
  const now = new Date();
  const f = Math.min(indice(fin) ?? now.getFullYear() * 12 + now.getMonth(), now.getFullYear() * 12 + now.getMonth());
  const n = Math.max(0, f - d + 1);
  const a = Math.floor(n / 12);
  const m = n % 12;
  return [a && `${a} an${a > 1 ? 's' : ''}`, m && `${m} mois`].filter(Boolean).join(' ') || '1 mois';
}

// ANCHOR: tri de la frise, en cours d'abord, puis par fin et début les plus récents
export const triFrise = (a, b) => (b.fin === '' ? 1 : 0) - (a.fin === '' ? 1 : 0) || (indice(b.fin) ?? 0) - (indice(a.fin) ?? 0) || (indice(b.debut) ?? 0) - (indice(a.debut) ?? 0);

// ANCHOR: partie Parcours du Profil, façon Malt ou LinkedIn : accroche, expériences en frise (compétences liées), formations et langues en rappel
export default function Parcours({ etat, maj, allerPartie, ouvrirCompetence }) {
  const { experiences, competences, formations, profil } = etat;
  const [edition, setEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<any>(VIDE);
  const [importer, setImporter] = useState(false);
  const [ajoutComp, setAjoutComp] = useState('');

  const parId = useMemo(() => new Map<string, any>(competences.map(c => [c.id, c])), [competences]);
  const libelles = useMemo(() => competences.map(c => c.competence), [competences]);
  const annees = useMemo(() => anneesParCategorie(experiences), [experiences]);
  const frise = useMemo(() => [...experiences].sort(triFrise), [experiences]);
  const langues = competences.filter(c => c.domaine === 'Langues');
  // NOTE: les titres enseignés (titre_pro) ne sont pas des formations suivies par l'utilisateur
  const obtenus = formations.filter(f => f.type !== 'titre_pro');
  const enseignes = formations.filter(f => f.type === 'titre_pro');
  const listeFormations = liste => (
    <ul className="parcours-liste">
      {liste.map(f => <li key={f.id}><b>{f.titre}</b><span className="muted small">{[f.etablissement, periodeFormation(f)].filter(Boolean).join(' · ')}</span></li>)}
    </ul>
  );

  const ouvrir = x => { setEdition(x ? x.id : 'nouvelle'); setBrouillon(x ? { ...VIDE, ...x } : VIDE); setAjoutComp(''); };
  const fermer = () => { setEdition(null); setBrouillon(VIDE); };
  const champ = (cle, valeur) => setBrouillon(b => ({ ...b, [cle]: valeur }));
  const valide = brouillon.poste.trim() && (!brouillon.fin || !brouillon.debut || brouillon.fin >= brouillon.debut);

  const enregistrer = () => {
    if (!valide) return;
    // NOTE: une compétence tapée mais pas encore validée (champ toujours actif) est liée aussi
    const enAttente = competences.find(k => k.competence === ajoutComp.trim());
    const liees = enAttente && !brouillon.competences.includes(enAttente.id) ? [...brouillon.competences, enAttente.id] : brouillon.competences;
    // NOTE: les poids des puces qui n'existent plus dans la description sont retirés, sous la même forme que le serveur
    const gardees = new Set(puces(brouillon.description).map(clePuce));
    const poids = normaliserPoids(Object.fromEntries(Object.entries(brouillon.poids ?? {}).filter(([k]) => gardees.has(clePuce(k)))));
    const x = { ...brouillon, poids, competences: liees, poste: brouillon.poste.trim(), employeur: brouillon.employeur.trim(), lieu: brouillon.lieu.trim(), intitules: intitulesPropres(brouillon.intitules) };
    if (edition === 'nouvelle') maj(e => ({ experiences: [...e.experiences, { ...x, id: 'x-' + Date.now().toString(36), ordre: 0 }] }));
    else maj(e => ({ experiences: e.experiences.map(y => (y.id === edition ? { ...y, ...x, id: y.id } : y)) }));
    fermer();
  };
  const supprimer = id => { maj(e => ({ experiences: e.experiences.filter(y => y.id !== id) })); if (edition === id) fermer(); };

  const lierCompetence = texte => {
    const c = competences.find(k => k.competence === texte);
    if (c && !brouillon.competences.includes(c.id)) champ('competences', [...brouillon.competences, c.id]);
    setAjoutComp('');
  };

  const formulaire = (
    <div className="carte parcours-form">
      <h3 className="carte-titre">{edition === 'nouvelle' ? 'Nouvelle expérience' : 'Modifier l\'expérience'}</h3>
      <div className="parcours-grille">
        <label className="field">Poste<input className="input" value={brouillon.poste} onChange={e => champ('poste', e.target.value)} autoFocus /></label>
        <label className="field">Employeur ou client<input className="input" value={brouillon.employeur} onChange={e => champ('employeur', e.target.value)} /></label>
        <label className="field">Lieu<input className="input" value={brouillon.lieu} onChange={e => champ('lieu', e.target.value)} /></label>
        <div className="field">Statut<Select value={brouillon.type} onChange={e => champ('type', e.target.value)} options={TYPES_EXPERIENCE} aria-label="Statut" /></div>
        <div className="field">Métier compté pour l'analyse<Select value={brouillon.categorie} onChange={e => champ('categorie', e.target.value)} options={OPTIONS_CATEGORIE} aria-label="Métier" /></div>
        <label className="field">Début<input className="input" type="month" value={brouillon.debut} onChange={e => champ('debut', e.target.value)} /></label>
        <label className="field">Fin (vide si en cours)<input className="input" type="month" value={brouillon.fin} onChange={e => champ('fin', e.target.value)} /></label>
      </div>
      <div className="field">
        Intitulé selon le CV visé (vide = poste)
        <div className="parcours-grille">
          {METIERS_CV.map(m => (
            <label key={m} className="field small">{CATEGORIES[m]?.label ?? m}
              <input className="input" value={brouillon.intitules?.[m] ?? ''} placeholder={brouillon.poste} maxLength={120} onChange={e => champ('intitules', { ...brouillon.intitules, [m]: e.target.value })} />
            </label>
          ))}
        </div>
      </div>
      <label className="field">Missions et réalisations<textarea className="input" rows={4} value={brouillon.description} onChange={e => champ('description', e.target.value)} /></label>
      <div className="field">
        Compétences mobilisées
        <Etiquettes items={brouillon.competences.map(id => ({ cle: id, libelle: parId.get(id)?.competence ?? id, contenu: parId.get(id)?.competence ?? id }))}
          retirer={id => champ('competences', brouillon.competences.filter(k => k !== id))}
          texte={ajoutComp} setTexte={setAjoutComp} ajouter={lierCompetence} options={libelles} placeholder="Ajouter une compétence du Profil..." />
      </div>
      {brouillon.fin && brouillon.debut && brouillon.fin < brouillon.debut && <p className="err small">La fin précède le début.</p>}
      <div className="parcours-actions">
        {/* NOTE: pointerdown sans perte du focus, sinon la sortie du champ compétence ajoute un tag, décale les boutons et le clic tombe à côté */}
        <button type="button" className="btn btn-ghost" onPointerDown={e => e.preventDefault()} onClick={fermer}>Annuler</button>
        <button type="button" className="btn btn-primary" onPointerDown={e => e.preventDefault()} onClick={enregistrer} disabled={!valide}>Enregistrer l'expérience</button>
      </div>
    </div>
  );

  return (
    <section aria-labelledby="titre-parcours" className="parcours">
      <h2 id="titre-parcours" className="panel-title">Parcours</h2>
      <p className="muted small lead">
        Le CV en version profil, comme sur Malt ou LinkedIn. Les années passées par métier relèvent le seuil de la note des offres : une annonce qui demande cinq ans d'expérience n'est plus pénalisée si votre parcours les couvre.
      </p>

      <div className="carte">
        <div className="parcours-entete">
          <h3 className="carte-titre">Accroche et résumé</h3>
          <button type="button" className="btn small" onClick={() => setImporter(v => !v)} aria-expanded={importer}><Upload size={15} />Importer l'export LinkedIn</button>
        </div>
        <label className="field">Accroche<input className="input" placeholder="Comptable et formateur digital, 15 ans d'expérience..." value={profil?.accroche ?? ''} onChange={e => maj(s => ({ profil: { ...s.profil, accroche: e.target.value } }))} /></label>
        <label className="field">Résumé<textarea className="input" rows={4} value={profil?.resume ?? ''} onChange={e => maj(s => ({ profil: { ...s.profil, resume: e.target.value } }))} /></label>
      </div>

      {importer && <ImportLinkedin etat={etat} maj={maj} fermer={() => setImporter(false)} />}

      <div className="carte">
        <div className="parcours-entete">
          <h3 className="carte-titre"><Briefcase size={17} aria-hidden="true" />Expériences</h3>
          {edition === null && (
            <span className="frise-boutons">
              <button type="button" className="btn btn-ghost small" onClick={() => allerPartie('poids')} title="Profil > Filtrer et optimiser > Poids des puces"><SlidersHorizontal size={15} />Poids des puces</button>
              <button type="button" className="btn btn-primary small" onClick={() => ouvrir(null)}><Plus size={15} />Ajouter</button>
            </span>
          )}
        </div>
        {Object.keys(annees).length > 0 && (
          <p className="parcours-annees small">
            {Object.entries(annees).sort((a, b) => b[1] - a[1]).map(([cat, n]) => (
              <span key={cat} className="tag" style={{ '--c': CATEGORIES[cat]?.color } as any}>{CATEGORIES[cat]?.label ?? cat} : {ans(n)}</span>
            ))}
          </p>
        )}
        {edition === 'nouvelle' && formulaire}
        {frise.length === 0 && edition === null && <p className="muted small">Aucune expérience. Ajoutez-en une ou importez votre export LinkedIn.</p>}
        <ol className="frise">
          {frise.map(x => (edition === x.id ? <li key={x.id}>{formulaire}</li> : (
            <li key={x.id} className="frise-item">
              <div className="frise-tete">
                <div>
                  <b>{x.poste}</b>
                  <span className="muted small">{[x.employeur, x.lieu].filter(Boolean).join(' · ')}</span>
                  <span className="muted small">
                    {x.debut ? `${moisLisible(x.debut)} à ${x.fin ? moisLisible(x.fin) : 'aujourd\'hui'} · ${dureeLisible(x.debut, x.fin)}` : 'Dates à préciser'}
                  </span>
                </div>
                <div className="frise-boutons">
                  <button type="button" className="btn btn-ghost small icon" onClick={() => ouvrir(x)} aria-label={`Modifier ${x.poste}`} title="Modifier"><Pencil size={15} /></button>
                  <button type="button" className="btn btn-ghost small icon" onClick={() => supprimer(x.id)} aria-label={`Supprimer ${x.poste}`} title="Supprimer"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="frise-tags">
                <span className="tag">{TYPES_EXPERIENCE.find(([k]) => k === x.type)?.[1]}</span>
                <span className="tag">{CATEGORIES[x.categorie]?.label}</span>
                {x.competences.map(id => parId.get(id) && <button key={id} type="button" className="tag parcours-comp parcours-comp-lien" onClick={() => ouvrirCompetence(parId.get(id)!.competence)} title="Voir dans Profil > Compétences">{parId.get(id)!.competence}</button>)}
              </div>
              {x.description && <p className="frise-texte small">{x.description}</p>}
            </li>
          )))}
        </ol>
      </div>

      <div className="grid-2">
        <div className="carte">
          <div className="parcours-entete">
            <h3 className="carte-titre">Diplômes et certifications</h3>
            <button type="button" className="btn btn-ghost small" onClick={() => allerPartie('diplomes')}>Gérer</button>
          </div>
          {obtenus.length === 0 ? <p className="muted small">Aucun diplôme ni certification saisi.</p> : listeFormations(obtenus)}
        </div>
        {/* NOTE: carte à part (ligne 110) : un titre enseigné n'est pas un diplôme de l'utilisateur */}
        <div className="carte">
          <div className="parcours-entete">
            <h3 className="carte-titre">Titres enseignés en tant que formateur</h3>
            <button type="button" className="btn btn-ghost small" onClick={() => allerPartie('enseignes')}>Gérer</button>
          </div>
          {enseignes.length === 0 ? <p className="muted small">Aucun titre enseigné saisi.</p> : listeFormations(enseignes)}
        </div>
        <div className="carte">
          <div className="parcours-entete">
            <h3 className="carte-titre"><Languages size={17} aria-hidden="true" />Langues</h3>
            <button type="button" className="btn btn-ghost small" onClick={() => allerPartie('comp')}>Gérer</button>
          </div>
          {langues.length === 0 ? <p className="muted small">Ajoutez vos langues dans Compétences, domaine « Langues ».</p> : (
            <ul className="parcours-liste">
              {langues.map(l => <li key={l.id}><b>{l.competence}</b>{l.note && <span className="muted small">{l.note}</span>}</li>)}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
