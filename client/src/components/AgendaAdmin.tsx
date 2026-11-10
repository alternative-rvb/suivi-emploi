import { CalendarDays, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { SqLignes } from './Squelettes.tsx';
import { useEffect, useState } from 'react';
import type { CalendrierGoogle, EtatAgenda } from '../../../types';
import { calendriersAgenda, choisirCalendrier, deconnecterAgenda, etatAgenda, lienConnexionAgenda } from '../api.ts';
import { fmtDate } from '../utils.ts';
import { useHauteur } from '../useHauteur.ts';
import Select from './Select.tsx';

// ANCHOR: résultat du retour de Google (?agenda=connecte ou ?agenda_erreur=...), lu une fois puis retiré de l'adresse
function lireRetourGoogle() {
  const p = new URLSearchParams(location.search);
  const r = { connecte: p.get('agenda') === 'connecte', erreur: p.get('agenda_erreur') ?? '' };
  if (r.connecte || r.erreur) history.replaceState(null, '', location.pathname + location.hash);
  return r;
}

// Carte Google Agenda de la page Admin (ligne 120) : connexion directe à Google, choix du calendrier, déconnexion
export default function AgendaAdmin() {
  const [retour] = useState(lireRetourGoogle);
  const [etat, setEtat] = useState<EtatAgenda | null>(null);
  const [calendriers, setCalendriers] = useState<CalendrierGoogle[] | null>(null);
  const [erreur, setErreur] = useState(retour.erreur);
  const [message, setMessage] = useState(retour.connecte ? 'Google Agenda connecté. Choisissez maintenant le calendrier à suivre.' : '');
  const [occupe, setOccupe] = useState(false);
  // NOTE: hauteur réelle mémorisée, reprise par le squelette pour ne pas pousser les cartes suivantes à l'arrivée de l'état
  const { ref, hauteur } = useHauteur('admin.agenda', 180, Boolean(etat));

  const chargerCalendriers = () => calendriersAgenda().then(setCalendriers).catch(e => { setErreur(e.message); if (e.status === 401) etatAgenda().then(setEtat).catch(() => {}); });
  useEffect(() => { etatAgenda().then(setEtat).catch(e => setErreur(e.message)); }, []);
  useEffect(() => { if (etat?.connecte && calendriers === null) chargerCalendriers(); }, [etat?.connecte]);

  const choisir = async (id: string) => {
    setOccupe(true); setErreur(''); setMessage('');
    try {
      const e = await choisirCalendrier(id);
      setEtat(e);
      setMessage(id ? `Calendrier suivi : ${e.calendrier_nom}.` : 'Plus aucun calendrier suivi.');
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  const deconnecter = async () => {
    if (!confirm("Déconnecter Google Agenda ? L'accès est retiré chez Google, vos événements restent dans votre agenda.")) return;
    setOccupe(true); setErreur(''); setMessage('');
    try {
      const r = await deconnecterAgenda();
      setEtat(r); setCalendriers(null);
      setMessage(r.revoque ? 'Google Agenda déconnecté, accès retiré chez Google.' : 'Google Agenda déconnecté ici. Google était injoignable : retirez aussi l\'accès sur myaccount.google.com/connections.');
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };

  return (
    <div className="carte" ref={ref} style={etat ? undefined : { minHeight: hauteur }}>
      <h3 className="carte-titre"><CalendarDays size={17} aria-hidden="true" />Google Agenda</h3>
      {!etat ? (erreur ? <p className="muted small">{erreur}</p> : <div className="sqz" aria-busy="true" role="status" aria-label="Chargement de l'agenda"><SqLignes n={3} /></div>) : !etat.configure ? (
        <p className="muted small">Non configuré : ajoutez <code>GOOGLE_CLIENT_ID</code> et <code>GOOGLE_CLIENT_SECRET</code> au fichier <code>.env</code> (préparation décrite dans le README), puis relancez le serveur.</p>
      ) : !etat.connecte ? (
        <>
          <p className="muted small">Les rendez-vous de l'accueil viennent d'un calendrier Google choisi ici. La connexion passe directement par Google, sans n8n : l'app ne demande que la liste de vos agendas et les événements de ceux dont vous êtes propriétaire.</p>
          <p className="muted small">Google affichera « application non validée » : c'est normal pour une application personnelle (Paramètres avancés, puis Accéder à Suivi emploi). Cochez les deux autorisations.</p>
          <div className="admin-actions">
            <a className="btn btn-primary small" href={lienConnexionAgenda()}><LogIn size={15} />Connecter Google Agenda</a>
          </div>
        </>
      ) : (
        <>
          <p className="small">Connecté{etat.depuis && <> depuis le {fmtDate(etat.depuis.slice(0, 10))}</>}{etat.calendrier_nom ? <>, calendrier suivi : <b>{etat.calendrier_nom}</b>.</> : '.'}</p>
          {!etat.calendrier_id && <p className="warn small">Choisissez le calendrier dont les événements s'affichent sur l'accueil. Un calendrier dédié (« Recherche d'emploi ») garde votre agenda personnel à part.</p>}
          {/* NOTE: libellé sur la ligne du choix et boutons à la hauteur de la liste, comme les champs de Trajets et revenu */}
          <div className="admin-actions">
            {calendriers ? (
              <label className="field agenda-choix">Calendrier
                <Select value={etat.calendrier_id} onChange={e => choisir(e.target.value)} disabled={occupe} aria-label="Calendrier suivi"
                  options={[['', 'Aucun'], ...calendriers.map(c => [c.id, c.nom + (c.principal ? ' (principal)' : ''), c.couleur || undefined])]} />
              </label>
            ) : <span className="muted small">Chargement des calendriers...</span>}
            <button type="button" className="btn btn-ghost" onClick={() => { setErreur(''); setCalendriers(null); chargerCalendriers(); }} disabled={occupe} title="Relire la liste des calendriers"><RefreshCw size={15} />Actualiser</button>
            <button type="button" className="btn btn-ghost" onClick={deconnecter} disabled={occupe}><LogOut size={15} />Déconnecter</button>
          </div>
        </>
      )}
      {etat && erreur && <p className="alert" role="alert">{erreur}</p>}
      {message && <p className="small" role="status">{message}</p>}
    </div>
  );
}
