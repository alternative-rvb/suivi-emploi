import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TYPES_PROJET, USAGES_IA } from '../../../lib/listes.mjs';
import Etiquettes from './Etiquettes.tsx';
import Select from './Select.tsx';

// NOTE: valeurs tirées de lib/listes.mjs (celles que le serveur accepte), seuls les libellés vivent ici
const LIBELLES_TYPE = { demo: 'Démonstration', education: 'Éducation, jeu', client: 'Client', perso: 'Personnel' };
const LIBELLES_IA = { '': 'Non renseigné', aucune: 'Sans IA', assistee: 'Assisté par l\'IA', deleguee: 'Déléguée à l\'IA' };
const OPTIONS_TYPE = TYPES_PROJET.map(k => [k, LIBELLES_TYPE[k] ?? k]);
const OPTIONS_IA = USAGES_IA.map(k => [k, LIBELLES_IA[k] ?? k]);
const VIDE = { nom: '', url: '', type: 'perso', debut: '', ia: '', technologies: '', description: '', competences: [] as string[] };

// ANCHOR: projets du portfolio reliés aux compétences ; le nombre de projets d'une compétence se calcule dans Compétences, jamais saisi
export default function Projets({ projets, competences, maj }) {
  const [edition, setEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<any>(VIDE);
  const [ajoutComp, setAjoutComp] = useState('');

  const parId = useMemo(() => new Map<string, any>(competences.map(c => [c.id, c])), [competences]);
  const libelles = useMemo<string[]>(() => competences.map(c => c.competence), [competences]);
  const sansIa = projets.filter(p => !p.ia).length;
  const sansCompetence = projets.filter(p => p.competences.length === 0).length;

  const ouvrir = p => { setEdition(p ? p.id : 'nouveau'); setBrouillon(p ? { ...VIDE, ...p } : VIDE); setAjoutComp(''); };
  const fermer = () => { setEdition(null); setBrouillon(VIDE); };
  const champ = (cle, valeur) => setBrouillon(b => ({ ...b, [cle]: valeur }));
  const valide = brouillon.nom.trim() && (!brouillon.url.trim() || /^https?:\/\/\S+$/i.test(brouillon.url.trim()));

  const enregistrer = () => {
    if (!valide) return;
    // NOTE: une compétence tapée mais pas encore validée (champ toujours actif) est liée aussi
    const enAttente = competences.find(k => k.competence === ajoutComp.trim());
    const liees = enAttente && !brouillon.competences.includes(enAttente.id) ? [...brouillon.competences, enAttente.id] : brouillon.competences;
    const p = { ...brouillon, competences: liees, nom: brouillon.nom.trim(), url: brouillon.url.trim() };
    if (edition === 'nouveau') maj(e => ({ projets: [...e.projets, { ...p, id: 'p-' + Date.now().toString(36), ordre: 0 }] }));
    else maj(e => ({ projets: e.projets.map(q => (q.id === edition ? { ...q, ...p, id: q.id } : q)) }));
    fermer();
  };
  const supprimer = id => { maj(e => ({ projets: e.projets.filter(q => q.id !== id) })); if (edition === id) fermer(); };

  const lierCompetence = texte => {
    const c = competences.find(k => k.competence === texte);
    if (c && !brouillon.competences.includes(c.id)) champ('competences', [...brouillon.competences, c.id]);
    setAjoutComp('');
  };

  const formulaire = (
    <div className="carte parcours-form">
      <h3 className="carte-titre">{edition === 'nouveau' ? 'Nouveau projet' : 'Modifier le projet'}</h3>
      <div className="parcours-grille">
        <label className="field">Nom<input className="input" value={brouillon.nom} onChange={e => champ('nom', e.target.value)} autoFocus /></label>
        <label className="field">Lien (page ou démo)<input className="input" value={brouillon.url} onChange={e => champ('url', e.target.value)} placeholder="https://..." /></label>
        <div className="field">Nature<Select value={brouillon.type} onChange={e => champ('type', e.target.value)} options={OPTIONS_TYPE} aria-label="Nature du projet" /></div>
        <label className="field">Début<input className="input" type="month" value={brouillon.debut} onChange={e => champ('debut', e.target.value)} /></label>
        <div className="field">Part de l'IA<Select value={brouillon.ia} onChange={e => champ('ia', e.target.value)} options={OPTIONS_IA} aria-label="Part de l'IA" /></div>
      </div>
      <label className="field">Technologies et outils sans compétence dédiée<input className="input" value={brouillon.technologies} onChange={e => champ('technologies', e.target.value)} placeholder="Leaflet, Pagefind, Go..." /></label>
      <label className="field">Rôle et contexte<textarea className="input" rows={3} value={brouillon.description} onChange={e => champ('description', e.target.value)} /></label>
      <div className="field">
        Compétences mobilisées
        <Etiquettes items={brouillon.competences.map(id => ({ cle: id, libelle: parId.get(id)?.competence ?? id, contenu: parId.get(id)?.competence ?? id }))}
          retirer={id => champ('competences', brouillon.competences.filter(k => k !== id))}
          texte={ajoutComp} setTexte={setAjoutComp} ajouter={lierCompetence} options={libelles} placeholder="Ajouter une compétence du Profil..." />
      </div>
      {brouillon.url.trim() && !/^https?:\/\/\S+$/i.test(brouillon.url.trim()) && <p className="err small">Le lien doit commencer par http ou https.</p>}
      <div className="parcours-actions">
        {/* NOTE: pointerdown sans perte du focus, sinon la sortie du champ compétence ajoute un tag, décale les boutons et le clic tombe à côté */}
        <button type="button" className="btn btn-ghost" onPointerDown={e => e.preventDefault()} onClick={fermer}>Annuler</button>
        <button type="button" className="btn btn-primary" onPointerDown={e => e.preventDefault()} onClick={enregistrer} disabled={!valide}>Enregistrer le projet</button>
      </div>
    </div>
  );

  return (
    <section aria-labelledby="titre-projets" className="parcours">
      <h2 id="titre-projets" className="panel-title">Projets</h2>
      <p className="muted small lead">
        Les réalisations du portfolio, reliées aux compétences mobilisées. Le nombre de projets d'une compétence est calculé à partir de ces liens et apparaît dans Compétences. La part de l'IA (sans IA, assistée, déléguée) se renseigne projet par projet : c'est elle qui permet de distinguer ce que vous faites seul de ce que vous faites avec l'IA.
      </p>
      <p className="small" aria-live="polite">
        <b>{projets.length}</b> projets{sansCompetence > 0 && <>, <b>{sansCompetence}</b> sans compétence liée</>}{sansIa > 0 && <>, <b>{sansIa}</b> sans part de l'IA renseignée</>}
      </p>
      <div className="parcours-actions">
        <button type="button" className="btn btn-primary" onClick={() => ouvrir(null)}><Plus size={15} />Ajouter un projet</button>
      </div>
      {edition === 'nouveau' && formulaire}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Projet</th><th>Nature</th><th>Début</th><th>IA</th><th>Compétences</th><th /></tr></thead>
          <tbody>
            {projets.length === 0 && <tr><td colSpan={6}>Aucun projet.</td></tr>}
            {projets.flatMap(p => [
              <tr key={p.id}>
                <td>
                  <b>{p.nom}</b>
                  {p.url && <> <a href={p.url} target="_blank" rel="noreferrer noopener" aria-label={`Ouvrir ${p.nom}`}><ExternalLink size={13} /></a></>}
                  {p.technologies && <div className="muted small">{p.technologies}</div>}
                </td>
                <td>{LIBELLES_TYPE[p.type] ?? p.type}</td>
                <td>{p.debut}</td>
                <td className={p.ia ? '' : 'warn'}>
                  {/* NOTE: choix direct dans le tableau, sans ouvrir le formulaire */}
                  <Select value={p.ia} onChange={e => maj(et => ({ projets: et.projets.map(q => (q.id === p.id ? { ...q, ia: e.target.value } : q)) }))} options={OPTIONS_IA} aria-label={`Part de l'IA de ${p.nom}`} />
                </td>
                <td title={p.competences.map(id => parId.get(id)?.competence).filter(Boolean).join(', ')}>{p.competences.length}</td>
                <td className="actions">
                  <button type="button" className="btn btn-ghost small" onClick={() => ouvrir(p)} aria-label={`Modifier ${p.nom}`}><Pencil size={14} /></button>
                  <button type="button" className="btn btn-ghost small" onClick={() => supprimer(p.id)} aria-label={`Supprimer ${p.nom}`}><Trash2 size={14} /></button>
                </td>
              </tr>,
              ...(edition === p.id ? [<tr key={p.id + '-form'}><td colSpan={6}>{formulaire}</td></tr>] : []),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  );
}
