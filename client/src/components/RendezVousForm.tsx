import { CalendarPlus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RendezVous, TypeRdv } from '../../../types';
import { memeEntreprise, nomContact } from '../contacts.ts';
import { ACTIFS, STATUTS } from '../constants.ts';
import { aujourdhui, fmtDate, lienMaps } from '../utils.ts';
import Select from './Select.tsx';
import Suggestions from './Suggestions.tsx';
import type { CibleRdv } from '../rendezVous.tsx';

export const TYPES_RDV: Record<TypeRdv, string> = { telephone: 'Téléphone', visio: 'Visio', sur_place: 'Sur place', autre: 'Autre' };
const DUREES = [15, 30, 45, 60, 90, 120];
// NOTE: après l'ajout d'un RDV, le passage de la candidature à Entretien est proposé (jamais automatique) pour ces statuts seulement
const A_PROPOSER = ['en_cours', 'sans_reponse'];

const libelleDuree = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`);

// ANCHOR: formulaire de rendez-vous (ligne 121), en fenêtre modale : création, modification, rattachement d'un événement externe (seuls les liens se choisissent alors)
export default function RendezVousForm({ cible, rdvs, candidatures, contacts, offres, maj, enregistrer, rattacher, supprimer, onClose }: {
  cible: CibleRdv;
  rdvs: RendezVous[];
  candidatures: any[];
  contacts: any[];
  offres: any[];
  maj: (patch: any) => void;
  enregistrer: (id: string | undefined, d: any) => Promise<RendezVous>;
  rattacher: (googleId: string, liens: any) => Promise<RendezVous>;
  supprimer: (id: string, localSeulement?: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const existant = cible.id ? rdvs.find(r => r.id === cible.id) : undefined;
  const ref = useRef<any>(null);
  const [f, setF] = useState(() => ({
    titre: existant?.titre ?? cible.titre ?? '',
    jour: existant?.debut.slice(0, 10) ?? cible.jour ?? aujourdhui(),
    heure: existant?.debut.slice(11, 16) ?? cible.heure ?? '10:00',
    duree: existant?.duree ?? 60,
    type: (existant?.type ?? 'visio') as TypeRdv,
    lieu: existant?.lieu ?? '',
    lien_visio: existant?.lien_visio ?? '',
    note: existant?.note ?? '',
    candidature_id: existant?.candidature_id ?? cible.candidature_id ?? '',
    contact_id: existant?.contact_id ?? cible.contact_id ?? '',
  }));
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  // NOTE: après l'enregistrement : message de synchro et proposition de statut, la fenêtre reste ouverte tant qu'il y a quelque chose à dire
  const [suite, setSuite] = useState<null | { synchro: RendezVous['synchro']; proposer: any }>(null);
  useEffect(() => { ref.current.showModal(); }, []);
  const maj1 = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));

  const candidature = candidatures.find(c => c.id === f.candidature_id);
  const offreId = candidature?.offre_id || existant?.offre_id || cible.offre_id || '';
  const offre = offres.find(o => o.id_offre === offreId);
  const rattachement = Boolean(cible.rattacher);

  const optionsCandidatures = useMemo(() => [
    ['', 'Aucune'],
    ...[...candidatures].sort((a, b) => Number(ACTIFS.includes(b.statut)) - Number(ACTIFS.includes(a.statut)) || a.entreprise.localeCompare(b.entreprise, 'fr'))
      .map(c => [c.id, `${c.entreprise} : ${c.poste}${ACTIFS.includes(c.statut) ? '' : ` (${STATUTS[c.statut]?.label ?? c.statut})`}`]),
  ], [candidatures]);
  // NOTE: contacts de l'offre d'abord, puis ceux du même employeur
  const optionsContacts = useMemo(() => {
    const entreprise = candidature?.entreprise ?? offre?.entreprise ?? '';
    const rang = k => (offreId && k.offres.includes(offreId) ? 0 : memeEntreprise(k.entreprise, entreprise) ? 1 : 2);
    return [['', 'Aucun'], ...[...contacts].sort((a, b) => rang(a) - rang(b) || nomContact(a).localeCompare(nomContact(b), 'fr')).map(k => [k.id, nomContact(k) + (k.entreprise ? ` (${k.entreprise})` : '')])];
  }, [contacts, offreId, candidature, offre]);
  const lieux = useMemo(() => [...new Set([...(candidature?.lieux ?? []).map(l => l.adresse || l.nom), ...rdvs.map(r => r.lieu)].filter(Boolean))] as string[], [candidature, rdvs]);
  const optionsDuree = DUREES.includes(f.duree) ? DUREES : [...DUREES, f.duree].sort((a, b) => a - b);

  const fermer = () => { ref.current?.close(); };

  const envoyer = async e => {
    e.preventDefault();
    setErreur('');
    setOccupe(true);
    try {
      const liens = { offre_id: offreId || null, candidature_id: f.candidature_id || null, contact_id: f.contact_id || null };
      const r = rattachement
        ? await rattacher(cible.rattacher!.google_id, liens)
        : await enregistrer(cible.id, { titre: f.titre, debut: `${f.jour}T${f.heure}`, duree: f.duree, type: f.type, lieu: f.lieu, lien_visio: f.lien_visio, note: f.note, ...liens });
      const cand = candidatures.find(c => c.id === r.candidature_id);
      const proposer = !cible.id && cand && A_PROPOSER.includes(cand.statut) ? cand : null;
      if (r.synchro !== 'ok' || proposer) setSuite({ synchro: r.synchro, proposer });
      else fermer();
    } catch (x) { setErreur(x.message); } finally { setOccupe(false); }
  };

  const retirer = async () => {
    if (!existant || !confirm(existant.google_id ? 'Supprimer ce rendez-vous ? Il sera aussi supprimé de Google Agenda.' : 'Supprimer ce rendez-vous ?')) return;
    setErreur('');
    setOccupe(true);
    try { await supprimer(existant.id); fermer(); } catch (x) {
      // NOTE: Google injoignable ou accès retiré : proposer de ne supprimer qu'ici, l'événement Google restera
      setErreur(x.message);
      if (confirm(`${x.message}\n\nSupprimer seulement ici ? L'événement restera dans Google Agenda.`)) {
        try { await supprimer(existant.id, true); fermer(); } catch (y) { setErreur(y.message); }
      }
    } finally { setOccupe(false); }
  };

  const passerEntretien = () => {
    const c = suite!.proposer;
    maj(e => ({ candidatures: e.candidatures.map(x => (x.id === c.id ? { ...x, statut: 'entretien' } : x)) }));
    fermer();
  };

  const titre = rattachement ? 'Rattacher un événement' : existant ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous';

  return (
    <dialog ref={ref} className="dialog dialog-rdv" onClose={onClose} onClick={e => { if (e.target === ref.current) fermer(); }}>
      <form onSubmit={envoyer}>
        <header className="dialog-head">
          <h2><CalendarPlus size={17} aria-hidden="true" /> {titre}</h2>
          <button type="button" className="btn btn-ghost icon" onClick={fermer} aria-label="Fermer" title="Fermer"><X size={16} /></button>
        </header>
        {suite ? (
          <div className="dialog-body">
            <p>Rendez-vous enregistré.</p>
            {suite.synchro === 'a_envoyer' && <p className="warn small">Il sera envoyé à Google Agenda dès que la connexion le permettra (agenda non connecté, calendrier non choisi ou Google injoignable).</p>}
            {suite.synchro === 'erreur' && <p className="alert" role="alert">Google Agenda a refusé l'envoi. Le rendez-vous reste enregistré ici.</p>}
            {suite.proposer && (
              <div className="rdv-proposition">
                <p>La candidature {suite.proposer.entreprise} est « {STATUTS[suite.proposer.statut]?.label} ». La passer à « Entretien » ?</p>
                <div className="row-end">
                  <button type="button" className="btn btn-primary small" onClick={passerEntretien}>Passer à Entretien</button>
                  <button type="button" className="btn btn-ghost small" onClick={fermer}>Non, laisser</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="dialog-body">
              {rattachement && <p className="muted small">{cible.rattacher!.titre}, {cible.rattacher!.quand}. Choisissez ce à quoi il se rapporte : il sera rangé avec cette offre, cette candidature et ce contact.</p>}
              {!rattachement && (
                <>
                  <label className="field">Titre
                    <input className="input" value={f.titre} onChange={e => maj1('titre', e.target.value)} placeholder={candidature ? `Entretien, ${candidature.entreprise}, ${candidature.poste}` : 'Entretien, employeur, poste'} />
                  </label>
                  <div className="grid-2">
                    <label className="field">Date
                      <input className="input" type="date" value={f.jour} onChange={e => maj1('jour', e.target.value)} required />
                    </label>
                    <label className="field">Heure
                      <input className="input" type="time" value={f.heure} onChange={e => maj1('heure', e.target.value)} required />
                    </label>
                  </div>
                  <div className="grid-2">
                    <label className="field">Durée
                      <Select value={String(f.duree)} onChange={e => maj1('duree', Number(e.target.value))} options={optionsDuree.map(d => [String(d), libelleDuree(d)])} aria-label="Durée" />
                    </label>
                    <label className="field">Type
                      <Select value={f.type} onChange={e => maj1('type', e.target.value)} options={Object.entries(TYPES_RDV)} aria-label="Type de rendez-vous" />
                    </label>
                  </div>
                </>
              )}
              <label className="field">Candidature
                <Select value={f.candidature_id} onChange={e => maj1('candidature_id', e.target.value)} options={optionsCandidatures} aria-label="Candidature" />
              </label>
              {offre && <p className="muted small">Offre liée : {offre.entreprise || 'Employeur non indiqué'}, {offre.titre} ({offre.id_offre}).</p>}
              <label className="field">Contact
                <Select value={f.contact_id} onChange={e => maj1('contact_id', e.target.value)} options={optionsContacts} aria-label="Contact" />
              </label>
              {!rattachement && (
                <>
                  <label className="field">Lieu
                    <Suggestions value={f.lieu} onChange={e => maj1('lieu', e.target.value)} options={lieux} placeholder="Adresse, ville ou « téléphone »" className="input" aria-label="Lieu" />
                    {f.lieu.trim() && f.type !== 'visio' && f.type !== 'telephone' && <a className="lien small" href={lienMaps(f.lieu)} target="_blank" rel="noopener noreferrer">Voir sur Google Maps</a>}
                  </label>
                  <label className="field">Lien de visio
                    <input className="input" type="url" value={f.lien_visio} onChange={e => maj1('lien_visio', e.target.value)} placeholder="https://..." />
                  </label>
                  <label className="field">Note
                    <textarea className="input" rows={3} value={f.note} onChange={e => maj1('note', e.target.value)} placeholder="À préparer, questions, accès..." />
                  </label>
                  {existant && <p className="muted small">Ajouté le {fmtDate(existant.cree)}.{existant.synchro === 'ok' ? ' Synchronisé avec Google Agenda.' : existant.synchro === 'annule' ? ' Supprimé dans Google Agenda : enregistrer le recrée.' : ' En attente d\'envoi vers Google Agenda.'}</p>}
                </>
              )}
              {erreur && <p className="alert" role="alert">{erreur}</p>}
            </div>
            <footer className="dialog-foot">
              {existant && <button type="button" className="btn btn-ghost small rdv-supprimer" onClick={retirer} disabled={occupe}><Trash2 size={14} />Supprimer</button>}
              <button type="button" className="btn btn-ghost" onClick={fermer}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={occupe}>{rattachement ? 'Rattacher' : 'Enregistrer'}</button>
            </footer>
          </>
        )}
      </form>
    </dialog>
  );
}
