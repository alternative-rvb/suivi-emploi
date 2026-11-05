import { CalendarPlus } from 'lucide-react';
import { useMemo } from 'react';
import { useRendezVous } from '../rendezVous.tsx';
import { fmtDate } from '../utils.ts';

// ANCHOR: rendez-vous liés à une offre, une candidature ou un contact (ligne 121) : liste cliquable (ouvre le formulaire) et bouton de création prérempli
export default function RendezVousLies({ offreId, candidatureId, contactId, titre }: { offreId?: string | null; candidatureId?: string | null; contactId?: string | null; titre?: string }) {
  const { rdvs, ouvrirFormulaire } = useRendezVous();
  const liste = useMemo(() => rdvs
    .filter(r => (offreId && r.offre_id === offreId) || (candidatureId && r.candidature_id === candidatureId) || (contactId && r.contact_id === contactId))
    .filter(r => r.synchro !== 'annule')
    .sort((a, b) => a.debut.localeCompare(b.debut)), [rdvs, offreId, candidatureId, contactId]);

  return (
    <div className="rdv-lies">
      {liste.length === 0 && <p className="muted small">Aucun rendez-vous.</p>}
      <ul className="liste-simple">
        {liste.map(r => (
          <li key={r.id}>
            <button type="button" className="btn-lien" onClick={() => ouvrirFormulaire({ id: r.id })}>
              {fmtDate(r.debut.slice(0, 10))} à {r.debut.slice(11, 16).replace(':', ' h ')} : {r.titre}
            </button>
            {r.synchro !== 'ok' && <span className="muted small"> (pas encore dans Google Agenda)</span>}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost small" onClick={() => ouvrirFormulaire({ offre_id: offreId, candidature_id: candidatureId, contact_id: contactId, titre })}>
        <CalendarPlus size={14} />Nouveau rendez-vous
      </button>
    </div>
  );
}
