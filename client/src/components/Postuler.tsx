import { useEffect, useMemo, useRef, useState } from 'react';
import { JOURS_RELANCE, MODES_ENVOI, PLATEFORMES } from '../constants.ts';
import NoteInteret from './NoteInteret.tsx';
import Suggestions from './Suggestions.tsx';
import { ajouterJours, aujourdhui, distinctes, formaterSalaire, nouvelId } from '../utils.ts';

// Formulaire d'envoi depuis une offre : crée la candidature liée et la tâche de relance
export default function Postuler({ offre, candidatures, cvVersions = [] as any[], maj, onFini }) {
  // NOTE: CV composé pour cette offre (le plus récent, cvVersions arrive du plus récent au plus ancien) : proposé d'office et lié à la candidature par le serveur
  const cvOffre = cvVersions.find(v => v.offre_id === offre.id_offre && !v.candidature_id)?.nom ?? '';
  const cvs = useMemo(() => distinctes(candidatures, 'cv'), [candidatures]);
  const plateformes = useMemo(() => distinctes(candidatures, 'plateforme', PLATEFORMES).filter(p => p.length < 40), [candidatures]);
  const [f, setF] = useState(() => ({
    plateforme: offre.postuler_via || (offre.id_offre.startsWith('man-') ? offre.source : 'France Travail'),
    mode_envoi: 'formulaire',
    lien: '',
    date: aujourdhui(),
    // NOTE: dernière version de CV utilisée, proposée par défaut
    cv: cvOffre || ([...candidatures].filter(c => c.cv).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]?.cv ?? ''),
    lettre: true,
    interet: '',
    relance: true,
    note: '',
  }));
  // NOTE: les versions de CV peuvent arriver après l'ouverture du formulaire : le CV de l'offre est alors proposé, sauf si le champ a déjà été touché
  const cvModifie = useRef(false);
  useEffect(() => { if (cvOffre && !cvModifie.current) setF(v => ({ ...v, cv: cvOffre })); }, [cvOffre]);
  const set = k => e => {
    if (k === 'cv') cvModifie.current = true;
    setF(v => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  };

  const envoyer = (statut, e?) => {
    e?.preventDefault();
    const id = offre.id_offre.startsWith('man-') ? nouvelId() : 'ft-' + offre.id_offre;
    const envoyee = statut === 'en_cours';
    const candidature = {
      id,
      entreprise: offre.entreprise || 'Employeur non indiqué',
      poste: offre.titre,
      description: [offre.contrat, offre.ville, formaterSalaire(offre.salaire)].filter(Boolean).join(', '),
      statut,
      plateforme: envoyee ? f.plateforme.trim() : '',
      mode_envoi: envoyee ? f.mode_envoi : '',
      lien: envoyee ? f.lien.trim() : '',
      cv: envoyee ? f.cv.trim() : '',
      lettre: envoyee && f.lettre,
      interet: f.interet,
      raison: '',
      date: envoyee ? f.date : aujourdhui(),
      notes: f.note,
      offre_id: offre.id_offre,
    };
    const tache = envoyee && f.relance
      ? { id: nouvelId(), candidature_id: id, titre: 'Relancer', echeance: ajouterJours(f.date, JOURS_RELANCE), faite: false, creee: aujourdhui() }
      : null;
    maj(etat => ({ candidatures: [...etat.candidatures, candidature], taches: tache ? [...etat.taches, tache] : etat.taches }));
    onFini(envoyee ? candidature.plateforme : '');
  };

  return (
    <form className="postuler" onSubmit={e => envoyer('en_cours', e)}>
      <div className="grid-2">
        <label className="field">Plateforme
          <Suggestions required value={f.plateforme} onChange={set('plateforme')} options={plateformes} />
        </label>
        <label className="field">Date d'envoi
          <input className="input" type="date" required value={f.date} onChange={set('date')} />
        </label>
      </div>
      <label className="field">Lien de candidature (facultatif)
        <input className="input" type="url" inputMode="url" placeholder="https://" value={f.lien} onChange={set('lien')} />
      </label>
      <div className="field">
        <span>Envoyée par</span>
        <div className="chips" role="radiogroup" aria-label="Envoyée par">
          {Object.entries(MODES_ENVOI).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={f.mode_envoi === k} className={'chip' + (f.mode_envoi === k ? ' on' : '')} onClick={() => setF(v => ({ ...v, mode_envoi: k }))}><span className="dot" />{l}</button>
          ))}
        </div>
      </div>
      <div className="grid-2">
        <label className="field">Version du CV
          <Suggestions value={f.cv} onChange={set('cv')} options={cvs} placeholder="CV comptable v2..." />
        </label>
        <div className="field"><span>Intérêt</span>
          <NoteInteret value={f.interet} onChange={v => setF(x => ({ ...x, interet: v }))} />
        </div>
      </div>
      <label className="switch"><input type="checkbox" checked={f.lettre} onChange={set('lettre')} /> Lettre de motivation jointe</label>
      <label className="switch"><input type="checkbox" checked={f.relance} onChange={set('relance')} /> Relance prévue dans {JOURS_RELANCE} jours</label>
      <label className="field">Note
        <input className="input" value={f.note} onChange={set('note')} placeholder="Facultatif" />
      </label>
      <div className="row-end">
        <button type="button" className="btn btn-ghost" onClick={() => envoyer('a_faire')}>Garder pour plus tard</button>
        <button type="submit" className="btn btn-primary">Candidature envoyée</button>
      </div>
    </form>
  );
}
