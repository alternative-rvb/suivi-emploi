import { Download, FileText, ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { lignesJournal } from '../actions.ts';
import { journalCsv, journalPdf, telecharger } from '../exports.ts';
import { heureSeule as heure } from '../format.ts';
import { fmtDate } from '../utils.ts';

const PAR_PAGE = 200;

// ANCHOR: journal complet (Profil > Bilan) : toutes les lignes journalisées sur la période (suppressions, réglages et automatismes compris), filtre par rubrique, aperçu et exports propres
export default function JournalComplet({ evenements, du, au, tronque, limite }) {
  const [rubrique, setRubrique] = useState('');
  const [affichees, setAffichees] = useState(PAR_PAGE);
  const [erreur, setErreur] = useState('');
  const lignes = useMemo(() => lignesJournal(evenements), [evenements]);
  const parRubrique = useMemo(() => lignes.reduce((m, l) => ({ ...m, [l.rubrique]: (m[l.rubrique] ?? 0) + 1 }), {} as Record<string, number>), [lignes]);
  const filtrees = useMemo(() => (rubrique ? lignes.filter(l => l.rubrique === rubrique) : lignes), [lignes, rubrique]);
  const periode = `Période du ${fmtDate(du)} au ${fmtDate(au)}`;
  const suffixe = rubrique ? `-${rubrique.toLowerCase().replace(/[^a-z]+/g, '-')}` : '';

  const choisir = (r: string) => { setRubrique(r); setAffichees(PAR_PAGE); };
  const exporterPdf = async () => {
    try {
      telecharger(`journal-${du}-${au}${suffixe}.pdf`, await journalPdf(periode + (rubrique ? `, rubrique ${rubrique}` : ''), filtrees));
      setErreur('');
    } catch (e) {
      setErreur(`Export PDF impossible : ${e.message}`);
    }
  };

  return (
    <section className="carte" aria-labelledby="bilan-journal-titre">
      <h3 id="bilan-journal-titre" className="carte-titre"><ScrollText size={17} aria-hidden="true" />Journal complet<span className="muted small">{filtrees.length}</span></h3>
      <p className="muted small">Tout ce que l'application a enregistré sur la période, du plus récent au plus ancien, sans tri ni filtre de pertinence.</p>
      <div className="bilan-reglages">
        <div className="chips chips-compact" role="group" aria-label="Filtrer le journal">
          <button type="button" className={'chip' + (!rubrique ? ' on' : '')} aria-pressed={!rubrique} onClick={() => choisir('')}><span className="chip-libelle">Toutes</span> <span className="count">{lignes.length}</span></button>
          {Object.entries(parRubrique).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
            <button key={k} type="button" className={'chip' + (rubrique === k ? ' on' : '')} aria-pressed={rubrique === k} onClick={() => choisir(rubrique === k ? '' : k)}><span className="chip-libelle">{k}</span> <span className="count">{n}</span></button>
          ))}
        </div>
        <span className="btn-group">
          <button type="button" className="btn btn-ghost small" onClick={exporterPdf} disabled={!filtrees.length}><FileText size={15} />PDF</button>
          <button type="button" className="btn btn-ghost small" onClick={() => telecharger(`journal-${du}-${au}${suffixe}.csv`, journalCsv(filtrees))} disabled={!filtrees.length}><Download size={15} />CSV</button>
        </span>
      </div>
      {erreur && <p className="alert" role="alert">{erreur}</p>}
      {tronque && <p className="small warn">Plus de {limite} lignes de journal sur la période : seules les plus récentes sont listées, réduisez l'intervalle.</p>}
      {filtrees.length === 0
        ? <p className="muted small">Aucune ligne de journal sur la période.</p>
        : (
          <div className="table-wrap">
            <table className="table journal-table">
              <thead><tr><th>Date</th><th>Heure</th><th>Rubrique</th><th>Élément</th><th>Action</th><th>Avant</th><th>Après</th></tr></thead>
              <tbody>
                {filtrees.slice(0, affichees).map(l => (
                  <tr key={l.id}>
                    <td>{fmtDate(l.jour)}</td>
                    <td className="muted">{heure(l.ts)}</td>
                    <td>{l.rubrique}</td>
                    <td className="journal-cellule" title={l.element}>{l.element}</td>
                    <td>{l.action}</td>
                    <td className="journal-cellule muted" title={l.avant}>{l.avant}</td>
                    <td className="journal-cellule" title={l.apres}>{l.apres}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {filtrees.length > affichees && (
        <button type="button" className="btn btn-ghost small" onClick={() => setAffichees(n => n + PAR_PAGE)}>Afficher {Math.min(PAR_PAGE, filtrees.length - affichees)} lignes de plus ({filtrees.length - affichees} restantes)</button>
      )}
    </section>
  );
}
