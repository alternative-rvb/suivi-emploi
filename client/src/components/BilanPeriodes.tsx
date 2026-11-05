import { BarChart3, Download, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { chargerJournal, chargerRapport, lienRapportCsv } from '../api.ts';
import { rapportPdf, telecharger } from '../exports.ts';
import { fmtDate, useMemoire } from '../utils.ts';
import BilanRecherche from './BilanRecherche.tsx';
import GraphiqueBilan from './GraphiqueBilan.tsx';
import JournalComplet from './JournalComplet.tsx';

const VUES = [['recherche', "Recherche d'emploi"], ['journal', 'Journal complet']];
const GRAINS = [['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois']];
// ANCHOR: compteurs du rapport (lib/journal.mjs) groupés comme le bilan de l'accueil
const PARTIES: [string, [string, string][]][] = [
  ['Offres', [['offres_detectees', 'Détectées'], ['offres_vues', 'Vues'], ['offres_ecartees', 'Écartées'], ['offres_expirees', 'Expirées'], ['offres_saisies', 'Saisies']]],
  ['Candidatures', [['candidatures_vues', 'Vues'], ['candidatures_creees', 'Créées'], ['candidatures_envoyees', 'Envoyées'], ['changements_statut', 'Statuts'], ['entretiens', 'Entretiens'], ['refus', 'Refus'], ['acceptees', 'Acceptées'], ['echanges', 'Échanges']]],
  ['Tâches', [['taches_creees', 'Créées'], ['taches_faites', 'Faites']]],
];
const COMPTEURS = PARTIES.flatMap(([partie, l]) => l.map(([k, nom]) => [k, nom, partie] as const));
const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
// NOTE: plafond de GET /api/journal, au-delà le journal affiché est incomplet (signalé)
const LIMITE_JOURNAL = 5000;

const libelle = (p, grain) => (grain === 'mois' ? MOIS.format(new Date(`${p.periode}T00:00:00Z`))
  : grain === 'semaine' ? `${p.semaine.replace(/^\d{4}-/, '')}, du ${fmtDate(p.periode)}` : fmtDate(p.periode));

// ANCHOR: bilan d'activité par période (ligne 96) : jour, semaine ou mois, intervalle réglable (vide = défaut du serveur), totaux et exports des compteurs, puis deux vues distinctes avec leurs exports : recherche d'emploi (BilanRecherche) et journal complet (JournalComplet)
export default function BilanPeriodes({ etat, offres = [] }) {
  const [grain, setGrain] = useState('semaine');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [r, setR] = useState<any>(null);
  const [evenements, setEvenements] = useState<any[]>([]);
  const [erreur, setErreur] = useState('');
  // NOTE: onglet choisi mémorisé dans le navigateur
  const [vue, setVue] = useMemoire('bilan.vue', 'recherche');

  useEffect(() => {
    let annule = false;
    if ((du && !/^\d{4}-\d{2}-\d{2}$/.test(du)) || (au && !/^\d{4}-\d{2}-\d{2}$/.test(au))) return;
    (async () => {
      try {
        const x = await chargerRapport(du || undefined, au || undefined, grain);
        // NOTE: le journal est lu sur l'intervalle effectif du rapport (défauts du serveur compris)
        const ev = await chargerJournal(x.du, LIMITE_JOURNAL, x.au);
        if (annule) return;
        setR(x);
        setEvenements(ev);
        setErreur('');
      } catch (e) {
        if (!annule) setErreur(e.message);
      }
    })();
    return () => { annule = true; };
  }, [grain, du, au]);

  const periodes = useMemo(() => [...(r?.periodes ?? [])].reverse(), [r]);
  const totaux = useMemo(() => Object.fromEntries(COMPTEURS.map(([k]) => [k, periodes.reduce((n, p) => n + (p[k] ?? 0), 0)])), [periodes]);
  const tronque = evenements.length >= LIMITE_JOURNAL;
  // NOTE: le graphique commence à la période qui contient le début du journal, les précédentes sont vides par construction
  const graphe = useMemo(() => {
    const debut = r?.journal_depuis?.slice(0, 10);
    const liste = r?.periodes ?? [];
    const i = debut ? liste.findLastIndex(p => p.periode <= debut) : 0;
    return liste.slice(Math.max(0, i));
  }, [r]);

  const changerGrain = g => { setGrain(g); setDu(''); setAu(''); };
  const intitule = r ? `Du ${fmtDate(r.du)} au ${fmtDate(r.au)}, par ${GRAINS.find(g => g[0] === r.grain)?.[1].toLowerCase()}` : '';

  const exporterPdf = async () => {
    try {
      const colonnes: [string, string][] = [['periode', 'Période'], ...COMPTEURS.map(([k, nom, partie]) => [k, `${partie} ${nom.toLowerCase()}`] as [string, string])];
      const lignes = periodes.map(p => ({ ...p, periode: libelle(p, r.grain) }));
      const blob = await rapportPdf("Bilan d'activité", intitule, colonnes, lignes, { ...totaux, periode: 'Total' });
      telecharger(`bilan-${r.grain}-${r.du}-${r.au}.pdf`, blob);
    } catch (e) {
      setErreur(`Export PDF impossible : ${e.message}`);
    }
  };

  return (
    <div className="bilan-periodes">
      <section className="carte" aria-labelledby="bilan-periode-titre">
        <h3 id="bilan-periode-titre" className="carte-titre"><BarChart3 size={17} aria-hidden="true" />Bilan par période</h3>
        <div className="bilan-reglages">
          <div className="chips" role="group" aria-label="Découpage">
            {GRAINS.map(([k, l]) => <button key={k} type="button" className={'chip' + (grain === k ? ' on' : '')} aria-pressed={grain === k} onClick={() => changerGrain(k)}>{l}</button>)}
          </div>
          <label className="field">Du<input className="input" type="date" value={du || r?.du || ''} onChange={e => setDu(e.target.value)} /></label>
          <label className="field">Au<input className="input" type="date" value={au || r?.au || ''} onChange={e => setAu(e.target.value)} /></label>
          <span className="btn-group">
            {r && <a className="btn btn-ghost small" href={lienRapportCsv(r.du, r.au, r.grain)} download title="Compteurs par période"><Download size={15} />CSV</a>}
            <button type="button" className="btn btn-ghost small" onClick={exporterPdf} disabled={!r} title="Compteurs par période"><FileText size={15} />PDF</button>
          </span>
        </div>
        {erreur && <p className="alert" role="alert">{erreur}</p>}
        {r && (
          <>
            <p className="muted small">{intitule}.{r.journal_depuis && r.du < r.journal_depuis.slice(0, 10) ? ` Le journal commence le ${fmtDate(r.journal_depuis.slice(0, 10))} : les actions antérieures ne sont pas comptées.` : ''}</p>
            <div className="bilan-parties">
              {PARTIES.map(([titre, compteurs]) => (
                <section key={titre} aria-label={`Total ${titre}`}>
                  <h4 className="bilan-partie">{titre}</h4>
                  <dl className="bilan">
                    {compteurs.map(([k, nom]) => <div key={k} className="bilan-item"><dt>{nom}</dt><dd><b>{totaux[k]}</b></dd></div>)}
                  </dl>
                </section>
              ))}
            </div>
          </>
        )}
      </section>

      {r && periodes.length > 0 && (
        <section className="carte" aria-label="Graphique des actions par période">
          <GraphiqueBilan periodes={graphe} libelle={p => libelle(p, r.grain)} />
        </section>
      )}

      {r && (
        <div className="table-wrap">
          <table className="table bilan-table">
            <thead>
              <tr><th rowSpan={2}>Période</th>{PARTIES.map(([t, l]) => <th key={t} colSpan={l.length} className="bilan-groupe">{t}</th>)}</tr>
              <tr>{COMPTEURS.map(([k, nom]) => <th key={k}>{nom}</th>)}</tr>
            </thead>
            <tbody>
              {periodes.map(p => (
                <tr key={p.periode}>
                  <td>{libelle(p, r.grain)}</td>
                  {COMPTEURS.map(([k]) => <td key={k} className={p[k] ? '' : 'muted'}>{p[k] ?? 0}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th>Total</th>{COMPTEURS.map(([k]) => <th key={k}>{totaux[k]}</th>)}</tr>
            </tfoot>
          </table>
        </div>
      )}

      {r && (
        <>
          <div className="chips" role="tablist" aria-label="Vues du bilan">
            {VUES.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={vue === k} className={'chip' + (vue === k ? ' on' : '')} onClick={() => setVue(k)}><span className="dot" />{l}</button>
            ))}
          </div>
          {vue === 'journal'
            ? <JournalComplet evenements={evenements} du={r.du} au={r.au} tronque={tronque} limite={LIMITE_JOURNAL} />
            : <BilanRecherche etat={etat} offres={offres} du={r.du} au={r.au} />}
        </>
      )}
    </div>
  );
}
