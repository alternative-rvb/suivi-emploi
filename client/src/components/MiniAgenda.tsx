import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { decaler, elementsAgenda, joursMois, joursSemaine, memeMois, parJour } from '../agenda.ts';
import type { ElementAgenda } from '../agenda.ts';
import { useRendezVous } from '../rendezVous.tsx';
import { useEvenements } from '../useAgenda.ts';
import { ajouterJours, aujourdhui } from '../utils.ts';

const nomMois = (j: string) => new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const jourLong = (j: string) => new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const horaire = (e: ElementAgenda) => (e.journee ? 'Journée' : e.debut);

function quand(jour: string, auj: string) {
  if (jour === auj) return "Aujourd'hui";
  if (jour === ajouterJours(auj, 1)) return 'Demain';
  const t = jourLong(jour);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export type CibleAgenda = { jour: string; vue?: 'jour' | 'semaine' | 'mois'; cle?: string };

// ANCHOR: mini-calendrier du mois sur l'accueil (ligne 121) : un point par rendez-vous (accent) ou événement Google externe (gris), infobulle au survol ou au clavier, clic vers l'onglet Agenda.
// NOTE: un jour qui n'a qu'un élément ouvre directement son détail dans l'Agenda ; sinon la vue Jour s'ouvre
export default function MiniAgenda({ allerAgenda, allerAdmin }: { allerAgenda: (cible: CibleAgenda) => void; allerAdmin: () => void }) {
  const { rdvs, version, ouvrirFormulaire, couleurDe } = useRendezVous();
  const auj = aujourdhui();
  const [mois, setMois] = useState(auj.slice(0, 8) + '01');
  const jours = useMemo(() => joursMois(mois), [mois]);
  const { evenements, probleme } = useEvenements(jours[0], jours[41], version);
  const elements = useMemo(() => elementsAgenda(rdvs, evenements).filter(e => e.jour >= jours[0] && e.jour <= jours[41]), [rdvs, evenements, jours]);
  const par = useMemo(() => parJour(elements), [elements]);
  const maintenant = new Date().toTimeString().slice(0, 5);
  // NOTE: prochains éléments : aujourd'hui (pas encore terminés) puis les jours suivants
  const prochains = elements.filter(e => e.jour > auj || (e.jour === auj && (e.journee || e.fin >= maintenant))).slice(0, 4);

  return (
    <div className="carte rdv-carte">
      <h3 className="carte-titre">
        <CalendarDays size={17} aria-hidden="true" />Agenda
        <button type="button" className="btn btn-ghost small titre-outils" onClick={() => ouvrirFormulaire({ jour: auj })}><Plus size={14} />RDV</button>
      </h3>
      <div className="mini-nav">
        <button type="button" className="btn btn-ghost icon" onClick={() => setMois(decaler('mois', mois, -1))} aria-label="Mois précédent"><ChevronLeft size={16} /></button>
        <button type="button" className="mini-mois" onClick={() => setMois(auj.slice(0, 8) + '01')} title="Revenir au mois en cours">{nomMois(mois)}</button>
        <button type="button" className="btn btn-ghost icon" onClick={() => setMois(decaler('mois', mois, 1))} aria-label="Mois suivant"><ChevronRight size={16} /></button>
      </div>
      <div className="mini-grille" role="grid" aria-label={nomMois(mois)}>
        {joursSemaine('2026-10-19').map(j => <span key={j} className="mini-entete" role="columnheader">{new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'narrow' })}</span>)}
        {jours.map((j, i) => {
          const liste = par.get(j) ?? [];
          // NOTE: un point par couleur de contact, puis un point d'accent pour les rendez-vous sans couleur
          const couleurs = [...new Set(liste.filter(e => e.rdv).map(e => couleurDe(e.rdv)).filter(Boolean))] as string[];
          const locaux = liste.filter(e => e.rdv && !couleurDe(e.rdv)).length;
          const externes = liste.filter(e => !e.rdv).length;
          const colonne = i % 7;
          return (
            <button
              key={j} type="button" role="gridcell"
              className={'mini-jour' + (memeMois(j, mois) ? '' : ' hors') + (j === auj ? ' auj' : '') + (j < auj ? ' passe' : '') + (liste.length ? ' a-rdv' : '') + (colonne > 4 ? ' bord-droit' : '')}
              onClick={() => allerAgenda({ jour: j, vue: 'jour', cle: liste.length === 1 ? liste[0].cle : undefined })}
              aria-label={`${jourLong(j)}${liste.length ? `, ${liste.length} rendez-vous` : ''}`}
            >
              <span className="mini-numero">{Number(j.slice(8))}</span>
              <span className="mini-points" aria-hidden="true">
                {couleurs.map(c => <i key={c} className="mini-point" style={{ background: c }} />)}
                {locaux > 0 && <i className="mini-point rdv" />}
                {externes > 0 && <i className="mini-point externe" />}
              </span>
              {liste.length > 0 && (
                <span className="mini-bulle" role="tooltip">
                  <b>{jourLong(j)}</b>
                  {liste.slice(0, 5).map(e => <span key={e.cle} className="mini-bulle-ligne"><span className="mini-bulle-heure">{horaire(e)}</span> {e.titre}</span>)}
                  {liste.length > 5 && <span className="muted">+ {liste.length - 5} autres</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {probleme && probleme.genre !== 'config' && (
        <p className="muted small">{probleme.genre === 'connexion' ? "Google Agenda n'est pas connecté." : probleme.genre === 'calendrier' ? 'Aucun calendrier Google choisi.' : probleme.message}{' '}
          {probleme.genre !== 'erreur' && <button type="button" className="lien" onClick={allerAdmin}>Régler dans Admin</button>}</p>
      )}
      <h4 className="mini-sous-titre">Rendez-vous proches</h4>
      <ul className="mini-prochains">
        {prochains.length === 0 && <li className="muted small">Aucun rendez-vous à venir.</li>}
        {prochains.map(e => (
          <li key={e.cle}>
            <button type="button" className="mini-prochain" style={couleurDe(e.rdv) ? { borderLeftColor: couleurDe(e.rdv) } : undefined} onClick={() => allerAgenda({ jour: e.jour, vue: 'jour', cle: e.cle })}>
              <span className="mini-prochain-quand">{quand(e.jour, auj)}, {horaire(e)}</span>
              <span className="mini-prochain-titre">{e.titre}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mini-legende muted small"><i className="mini-point rdv" /> Rendez-vous <i className="mini-point externe" /> Événement Google <button type="button" className="lien" onClick={() => allerAgenda({ jour: auj, vue: 'semaine' })}>Ouvrir l'agenda</button></p>
    </div>
  );
}
