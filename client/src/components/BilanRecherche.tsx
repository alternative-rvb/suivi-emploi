import { Briefcase, Download, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, SENT } from '../constants.ts';
import { COLONNES_STATS, rechercheEmploi, statsMetier, valeursStat } from '../actions.ts';
import { chargerJournal } from '../api.ts';
import { recherchePdf, rechercheCsv, telecharger } from '../exports.ts';
import { fmtDate, useMemoire } from '../utils.ts';
import NumeroOffre from './NumeroOffre.tsx';
import Select from './Select.tsx';

const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
// NOTE: dernier jour du mois AAAA-MM (jour 0 du mois suivant)
const finMois = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);

// ANCHOR: recherche d'emploi (Profil > Bilan) : pour chaque candidature envoyée sur la période, ce qui a été fait, quand, et le résultat ; aperçu et exports propres, distincts du journal complet
// NOTE: sélecteur de mois propre à la vue (mois des candidatures envoyées, choix mémorisé, gardé dans la liste même s'il n'a plus de candidature), vide = période du bilan
export default function BilanRecherche({ etat, offres, du: duBilan, au: auBilan }) {
  const [erreur, setErreur] = useState('');
  const [mois, setMois] = useMemoire('bilan.recherche.mois', '');
  const listeMois = useMemo(() => [...new Set<string>((etat.candidatures ?? []).filter(c => SENT.includes(c.statut) && /^\d{4}-\d{2}/.test(c.date ?? '')).map(c => c.date.slice(0, 7)).concat(mois ? [mois] : []))].sort().reverse(), [etat.candidatures, mois]);
  const du = mois ? `${mois}-01` : duBilan;
  const au = mois ? finMois(mois) : auBilan;
  const [evenements, setEvenements] = useState<any[]>([]);
  // NOTE: historique des statuts lu du début de la période jusqu'à aujourd'hui : une réponse arrivée après la période reste le résultat de sa candidature
  useEffect(() => {
    let annule = false;
    chargerJournal(du, 5000, '', 'candidature').then(ev => { if (!annule) setEvenements(ev); }).catch(e => { if (!annule) setErreur(e.message); });
    return () => { annule = true; };
  }, [du, au]);
  const blocs = useMemo(() => rechercheEmploi(etat, offres, evenements, du, au), [etat.candidatures, etat.echanges, etat.rendez_vous, offres, evenements, du, au]);
  const stats = useMemo(() => statsMetier(blocs), [blocs]);
  const periode = `Période du ${fmtDate(du)} au ${fmtDate(au)}`;

  const exporterPdf = async () => {
    try {
      telecharger(`recherche-emploi-${du}-${au}.pdf`, await recherchePdf(periode, blocs));
      setErreur('');
    } catch (e) {
      setErreur(`Export PDF impossible : ${e.message}`);
    }
  };

  return (
    <section className="carte" aria-labelledby="bilan-recherche-titre">
      <h3 id="bilan-recherche-titre" className="carte-titre"><Briefcase size={17} aria-hidden="true" />Recherche d'emploi<span className="muted small">{blocs.length}</span></h3>
      <div className="bilan-reglages">
        <label className="field">Mois
          <Select value={mois} onChange={e => setMois(e.target.value)} aria-label="Mois affiché"
            options={[['', `Période du bilan (${fmtDate(duBilan)} au ${fmtDate(auBilan)})`], ...listeMois.map(m => [m, MOIS.format(new Date(`${m}-01T00:00:00Z`))])]} />
        </label>
        <span className="btn-group">
          <button type="button" className="btn small" onClick={exporterPdf} disabled={!blocs.length}><FileText size={15} />Justificatif PDF</button>
          <button type="button" className="btn btn-ghost small" onClick={() => telecharger(`recherche-emploi-${du}-${au}.csv`, rechercheCsv(blocs))} disabled={!blocs.length}><Download size={15} />CSV</button>
        </span>
      </div>
      <p className="muted small">{periode} : candidatures envoyées, de la plus récente à la plus ancienne. Sous chacune : les actions menées, à leur date, et le statut obtenu.</p>
      {erreur && <p className="alert" role="alert">{erreur}</p>}
      {/* ANCHOR: statistiques par métier (ligne 222), mêmes valeurs que la dernière page du justificatif */}
      {stats.length > 0 && (
        <div className="table-wrap recherche-stats">
          <table className="table">
            <caption className="sr-only">Statistiques par métier sur la période</caption>
            <thead><tr><th scope="col">Métier</th>{COLONNES_STATS.map(c => <th key={c} scope="col" className="chiffre">{c}</th>)}</tr></thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.metier || 'total'} className={s.metier ? '' : 'strong'}>
                  <th scope="row">{s.metier ? <span className="badge" style={{ '--c': (CATEGORIES[s.metier] ?? CATEGORIES.autre).color } as React.CSSProperties}>{(CATEGORIES[s.metier] ?? CATEGORIES.autre).label}</span> : 'Total'}</th>
                  {valeursStat(s).map((v, i) => <td key={i} className="chiffre">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {blocs.length === 0
        ? <p className="muted small">Aucune candidature envoyée sur la période.</p>
        : (
          <ul className="historique" aria-label="Candidatures envoyées et actions menées">
            {blocs.map(b => (
              <li key={b.id} className="historique-noeud">
                <div className="historique-tete">
                  {b.numero ? <NumeroOffre offre={{ id_offre: b.numero }} /> : <span className="muted small recherche-sans-numero">sans n°</span>}
                  <span aria-hidden="true">-</span>
                  <time dateTime={b.date}>{fmtDate(b.date)}</time>
                  <span aria-hidden="true">-</span>
                  <span className="historique-titre" title={`${b.poste}, ${b.employeur}`}>{[b.poste, b.employeur].filter(Boolean).join(', ')}</span>
                  {b.plateforme && <span className="badge" title="Plateforme">{b.plateforme}</span>}
                </div>
                {(b.lieu || b.contrat || b.envoi) && (
                  <p className="muted small recherche-details">{[b.lieu, b.contrat, b.envoi && `envoi : ${b.envoi.toLowerCase()}`].filter(Boolean).join(' · ')}</p>
                )}
                <ul className="historique-actions recherche-actions">
                  {b.lignes.map((l, i) => (
                    <li key={i}>
                      <time className="muted small" dateTime={l.date}>{fmtDate(l.date)}</time>
                      <span>{l.texte}</span>
                      <span className="muted">{l.resultat}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
