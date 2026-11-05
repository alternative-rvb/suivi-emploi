import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, MapPin, Plus, RefreshCw, Video, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { decaler, elementsAgenda, estPasse, joursMois, joursSemaine, memeMois, parJour, periode, placer, plageHeures } from '../agenda.ts';
import type { ElementAgenda } from '../agenda.ts';
import { nomContact } from '../contacts.ts';
import { useRendezVous } from '../rendezVous.tsx';
import { useEvenements } from '../useAgenda.ts';
import { aujourdhui, fmtDate, lienMaps, lienSur, useMemoire } from '../utils.ts';
import { TYPES_RDV } from './RendezVousForm.tsx';

type Vue = 'jour' | 'semaine' | 'mois';
const VUES: [Vue, string][] = [['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois']];
const PX_HEURE = 48;
const MAX_PAR_CASE = 3;

const jourLong = (j: string) => new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const jourCourt = (j: string) => new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
const nomMois = (j: string) => new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

function titrePeriode(vue: Vue, jour: string) {
  if (vue === 'jour') return jourLong(jour);
  if (vue === 'mois') return nomMois(jour);
  const j = joursSemaine(jour);
  const d = new Date(j[0] + 'T12:00:00');
  const f = new Date(j[6] + 'T12:00:00');
  const mois = d.getMonth() === f.getMonth() ? '' : ' ' + d.toLocaleDateString('fr-FR', { month: 'long' });
  return `Du ${d.getDate()}${mois} au ${f.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

const horaire = (e: ElementAgenda) => (e.journee ? 'Journée' : `${e.debut} à ${e.fin}`);

// ANCHOR: onglet Agenda (ligne 121) : vues Jour, Semaine, Mois des rendez-vous enregistrés et des événements du calendrier Google choisi.
// NOTE: cible = { jour, vue?, cle? } demandée depuis l'accueil (mini-calendrier) : la vue s'ouvre sur ce jour, avec le détail de l'élément (cle : r:<id> ou g:<id>)
export default function Agenda({ cible, cibleLue, ouvrirCandidature, ouvrirOffre, ouvrirContact, candidatures, contacts, offres, allerAdmin }: {
  cible: { jour: string; vue?: Vue; cle?: string } | null;
  cibleLue: () => void;
  ouvrirCandidature: (id: string) => void;
  ouvrirOffre: (id: string) => void;
  ouvrirContact: (id: string) => void;
  candidatures: any[];
  contacts: any[];
  offres: any[];
  allerAdmin: () => void;
}) {
  const { rdvs, version, ouvrirFormulaire } = useRendezVous();
  const [vue, setVue] = useMemoire('agenda.vue', 'semaine') as [Vue, (v: Vue) => void];
  const [jour, setJour] = useState(aujourdhui());
  const [detail, setDetail] = useState<string | null>(null);
  const [du, au] = periode(vue, jour);
  const { evenements, chargement, probleme, relire } = useEvenements(du, au, version);

  // NOTE: la cible venue de l'accueil est consommée une fois
  useEffect(() => {
    if (!cible) return;
    setJour(cible.jour);
    setVue(cible.vue ?? 'jour');
    setDetail(cible.cle ?? null);
    cibleLue();
  }, [cible]);

  const elements = useMemo(() => elementsAgenda(rdvs, evenements).filter(e => e.jour >= du && e.jour <= au), [rdvs, evenements, du, au]);
  const detaille = detail ? elements.find(e => e.cle === detail) ?? null : null;
  const nouveau = (j: string, heure = '10:00') => ouvrirFormulaire({ jour: j, heure });
  const auj = aujourdhui();

  return (
    <div className="agenda">
      <div className="agenda-barre">
        <div className="agenda-nav">
          <button type="button" className="btn btn-ghost small" onClick={() => setJour(auj)} title="Revenir à aujourd'hui"><CalendarCheck size={15} aria-hidden="true" />Aujourd'hui</button>
          <button type="button" className="btn btn-ghost icon" onClick={() => setJour(decaler(vue, jour, -1))} aria-label="Période précédente" title="Précédent"><ChevronLeft size={17} /></button>
          <button type="button" className="btn btn-ghost icon" onClick={() => setJour(decaler(vue, jour, 1))} aria-label="Période suivante" title="Suivant"><ChevronRight size={17} /></button>
        </div>
        <h2 className="agenda-titre">{titrePeriode(vue, jour)}</h2>
        <div className="agenda-actions">
          <div className="agenda-vues" role="group" aria-label="Vue">
            {VUES.map(([k, l]) => <button key={k} type="button" className={'btn small' + (vue === k ? ' btn-primary' : ' btn-ghost')} aria-pressed={vue === k} onClick={() => setVue(k)}>{l}</button>)}
          </div>
          <button type="button" className="btn btn-ghost icon" onClick={relire} disabled={chargement} aria-label="Relire Google Agenda" title="Relire Google Agenda"><RefreshCw size={15} className={chargement ? 'tourne' : ''} /></button>
          <button type="button" className="btn btn-primary small" onClick={() => nouveau(jour)}><Plus size={15} />Nouveau RDV</button>
        </div>
      </div>

      {probleme && probleme.genre !== 'config' && (
        <p className="muted small agenda-note" role="status">
          {probleme.genre === 'connexion' ? "Google Agenda n'est pas connecté" : probleme.genre === 'calendrier' ? 'Aucun calendrier Google choisi' : probleme.message} : seuls les rendez-vous enregistrés ici s'affichent.{' '}
          {probleme.genre !== 'erreur' && <button type="button" className="lien" onClick={allerAdmin}>Régler dans Admin</button>}
        </p>
      )}
      {probleme?.genre === 'config' && <p className="muted small agenda-note">Google Agenda n'est pas configuré (voir Admin) : seuls les rendez-vous enregistrés ici s'affichent.</p>}

      {vue === 'mois'
        ? <VueMois jour={jour} elements={elements} auj={auj} ouvrir={setDetail} nouveau={nouveau} voirJour={j => { setJour(j); setVue('jour'); }} />
        : <VueGrille jours={vue === 'jour' ? [jour] : joursSemaine(jour)} elements={elements} auj={auj} ouvrir={setDetail} nouveau={nouveau} />}

      {detaille && (
        <Detail
          element={detaille} evenements={evenements} candidatures={candidatures} contacts={contacts} offres={offres}
          onClose={() => setDetail(null)} ouvrirCandidature={ouvrirCandidature} ouvrirOffre={ouvrirOffre} ouvrirContact={ouvrirContact}
        />
      )}
    </div>
  );
}

const passe = (e: ElementAgenda) => estPasse(e, aujourdhui(), new Date().toTimeString().slice(0, 5));

function Puce({ e, ouvrir }: { e: ElementAgenda; ouvrir: (cle: string) => void }) {
  const alerte = e.rdv && e.rdv.synchro !== 'ok';
  const { couleurDe } = useRendezVous();
  const coul = couleurDe(e.rdv);
  return (
    <button type="button" className={'agenda-puce' + (e.rdv ? ' rdv' : ' externe') + (coul ? ' coul' : '') + (passe(e) ? ' passe' : '')} style={coul ? ({ '--coul': coul } as React.CSSProperties) : undefined} onClick={ev => { ev.stopPropagation(); ouvrir(e.cle); }} title={`${e.titre}, ${horaire(e)}${alerte ? ' (pas encore envoyé à Google)' : ''}`}>
      {!e.journee && <span className="agenda-puce-heure">{e.debut}</span>}
      <span className="agenda-puce-titre">{e.titre}</span>
      {alerte && <span className="agenda-alerte" aria-label="Pas encore envoyé à Google" />}
    </button>
  );
}

// ANCHOR: vue Mois : six semaines, trois éléments par case puis « + N autres » qui ouvre le jour ; un clic sur une case vide crée un rendez-vous ce jour-là
function VueMois({ jour, elements, auj, ouvrir, nouveau, voirJour }: { jour: string; elements: ElementAgenda[]; auj: string; ouvrir: (c: string) => void; nouveau: (j: string) => void; voirJour: (j: string) => void }) {
  const par = parJour(elements);
  return (
    <div className="agenda-mois" role="grid" aria-label="Mois">
      {joursSemaine('2026-10-19').map(j => <div key={j} className="agenda-entete" role="columnheader">{new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })}</div>)}
      {joursMois(jour).map(j => {
        const liste = par.get(j) ?? [];
        return (
          <div key={j} className={'agenda-case' + (memeMois(j, jour) ? '' : ' hors') + (j === auj ? ' auj' : '')} role="gridcell" onClick={() => nouveau(j)}>
            <button type="button" className="agenda-numero" onClick={ev => { ev.stopPropagation(); voirJour(j); }} aria-label={jourLong(j)}>{Number(j.slice(8))}</button>
            {liste.slice(0, MAX_PAR_CASE).map(e => <Puce key={e.cle} e={e} ouvrir={ouvrir} />)}
            {liste.length > MAX_PAR_CASE && <button type="button" className="lien agenda-plus" onClick={ev => { ev.stopPropagation(); voirJour(j); }}>+ {liste.length - MAX_PAR_CASE} autres</button>}
          </div>
        );
      })}
    </div>
  );
}

// ANCHOR: vues Jour et Semaine : grille horaire (8 h à 20 h, élargie si besoin), journées entières en haut, chevauchements côte à côte, un clic sur un créneau vide crée un rendez-vous à cette heure
function VueGrille({ jours, elements, auj, ouvrir, nouveau }: { jours: string[]; elements: ElementAgenda[]; auj: string; ouvrir: (c: string) => void; nouveau: (j: string, heure: string) => void }) {
  const { couleurDe } = useRendezVous();
  const par = parJour(elements);
  const [h0, h1] = plageHeures(elements);
  const heures = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setMaintenant(new Date()), 60_000); return () => clearInterval(t); }, []);
  const minutesMaintenant = maintenant.getHours() * 60 + maintenant.getMinutes();
  return (
    <div className="agenda-grille-conteneur">
      <div className="agenda-grille" style={{ gridTemplateColumns: `48px repeat(${jours.length}, minmax(${jours.length > 1 ? 110 : 240}px, 1fr))` }}>
        <div className="agenda-coin" />
        {jours.map(j => (
          <div key={j} className={'agenda-entete' + (j === auj ? ' auj' : '')} role="columnheader">
            {jourCourt(j)}
            <div className="agenda-journee">{(par.get(j) ?? []).filter(e => e.journee).map(e => <Puce key={e.cle} e={e} ouvrir={ouvrir} />)}</div>
          </div>
        ))}
        <div className="agenda-heures" style={{ height: heures.length * PX_HEURE }}>
          {heures.map(h => <div key={h} className="agenda-heure" style={{ height: PX_HEURE }}><span>{String(h).padStart(2, '0')}:00</span></div>)}
        </div>
        {jours.map(j => (
          <div
            key={j} className={'agenda-colonne' + (j === auj ? ' auj' : '')} style={{ height: heures.length * PX_HEURE }} role="gridcell" aria-label={jourLong(j)}
            onClick={ev => {
              if (ev.target !== ev.currentTarget && !(ev.target as HTMLElement).classList.contains('agenda-trait')) return;
              const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
              const minutes = Math.round((h0 * 60 + (y / PX_HEURE) * 60) / 30) * 30;
              nouveau(j, `${String(Math.min(23, Math.floor(minutes / 60))).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
            }}
          >
            {heures.map(h => <div key={h} className="agenda-trait" style={{ top: (h - h0) * PX_HEURE }} />)}
            {placer(par.get(j) ?? []).map(({ element: e, colonne, colonnes }) => (
              <button
                key={e.cle} type="button" className={'agenda-bloc' + (e.rdv ? ' rdv' : ' externe') + (couleurDe(e.rdv) ? ' coul' : '') + (passe(e) ? ' passe' : '')}
                style={{ '--coul': couleurDe(e.rdv), top: ((e.minutesDebut - h0 * 60) / 60) * PX_HEURE, height: Math.max(((e.minutesFin - e.minutesDebut) / 60) * PX_HEURE - 2, 22), left: `calc(${(colonne / colonnes) * 100}% + 1px)`, width: `calc(${100 / colonnes}% - 3px)` } as React.CSSProperties}
                onClick={ev => { ev.stopPropagation(); ouvrir(e.cle); }} title={`${e.titre}, ${horaire(e)}`}
              >
                <span className="agenda-bloc-heure">{e.debut}{e.rdv && e.rdv.synchro !== 'ok' && <span className="agenda-alerte" aria-label="Pas encore envoyé à Google" />}</span>
                <span className="agenda-bloc-titre">{e.titre}</span>
                {e.lieu && <span className="agenda-bloc-lieu">{e.lieu}</span>}
              </button>
            ))}
            {j === auj && minutesMaintenant >= h0 * 60 && minutesMaintenant <= h1 * 60 && <div className="agenda-maintenant" style={{ top: ((minutesMaintenant - h0 * 60) / 60) * PX_HEURE }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ANCHOR: détail d'un rendez-vous ou d'un événement externe, en fenêtre modale : liens vers la candidature, l'offre et le contact, modification, rattachement
function Detail({ element: e, evenements, candidatures, contacts, offres, onClose, ouvrirCandidature, ouvrirOffre, ouvrirContact }: {
  element: ElementAgenda; evenements: any[]; candidatures: any[]; contacts: any[]; offres: any[];
  onClose: () => void; ouvrirCandidature: (id: string) => void; ouvrirOffre: (id: string) => void; ouvrirContact: (id: string) => void;
}) {
  const { ouvrirFormulaire } = useRendezVous();
  const ref = useRef<any>(null);
  useEffect(() => { ref.current.showModal(); }, []);
  const r = e.rdv;
  const candidature = r?.candidature_id ? candidatures.find(c => c.id === r.candidature_id) : null;
  const offre = r?.offre_id ? offres.find(o => o.id_offre === r.offre_id) : null;
  const contact = r?.contact_id ? contacts.find(k => k.id === r.contact_id) : null;
  const lienGoogle = lienSur(e.lien || evenements.find(x => r && x.rdv === r.id)?.lien);
  const visio = lienSur(e.visio);
  const aller = (f: () => void) => () => { ref.current.close(); f(); };
  const quand = `${fmtDate(e.jour)}, ${horaire(e)}`;

  return (
    <dialog ref={ref} className="dialog dialog-detail" onClose={onClose} onClick={ev => { if (ev.target === ref.current) ref.current.close(); }}>
      <header className="dialog-head">
        <h2><CalendarDays size={17} aria-hidden="true" /> {e.titre}</h2>
        <button type="button" className="btn btn-ghost icon" onClick={() => ref.current.close()} aria-label="Fermer" title="Fermer"><X size={16} /></button>
      </header>
      <div className="dialog-body">
        <p><b>{quand}</b>{r && <> <span className="tag">{TYPES_RDV[r.type]}</span></>}{!r && <> <span className="tag">Événement Google</span></>}</p>
        {e.lieu && <p className="small"><MapPin size={13} aria-hidden="true" /> {e.lieu}{!(r && (r.type === 'visio' || r.type === 'telephone')) && <> · <a href={lienMaps(e.lieu)} target="_blank" rel="noopener noreferrer">Voir sur Google Maps</a></>}</p>}
        {visio && <p className="small"><Video size={13} aria-hidden="true" /> <a href={visio} target="_blank" rel="noopener noreferrer">Rejoindre la visio</a></p>}
        {r?.note && <p className="small agenda-note-texte">{r.note}</p>}
        {r && (r.synchro === 'a_envoyer' || r.synchro === 'erreur') && <p className="warn small">{r.synchro === 'erreur' ? "Google Agenda a refusé l'envoi." : "Pas encore envoyé à Google Agenda : l'envoi se fera dès que la connexion le permet."}</p>}
        {r && (candidature || offre || contact) && (
          <ul className="agenda-liens">
            {candidature && <li>Candidature : <button type="button" className="lien" onClick={aller(() => ouvrirCandidature(candidature.id))}>{candidature.entreprise}, {candidature.poste}</button></li>}
            {offre && <li>Offre : <button type="button" className="lien" onClick={aller(() => ouvrirOffre(offre.id_offre))}>{offre.titre}</button></li>}
            {contact && <li>Contact : <button type="button" className="lien" onClick={aller(() => ouvrirContact(contact.id))}>{nomContact(contact)}</button></li>}
          </ul>
        )}
      </div>
      <footer className="dialog-foot">
        {lienGoogle && <a className="btn btn-ghost small" href={lienGoogle} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Ouvrir dans Google</a>}
        {r ? (
          <button type="button" className="btn btn-primary" onClick={aller(() => ouvrirFormulaire({ id: r.id }))}>Modifier</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={aller(() => ouvrirFormulaire({ rattacher: { google_id: e.externe!.id, titre: e.titre, quand } }))}>Rattacher à une offre ou un contact</button>
        )}
      </footer>
    </dialog>
  );
}
