import ChampRecherche from './ChampRecherche.tsx';
import { Download, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { chargerOffres } from '../api.ts';
import { ACTIFS, INTERETS, STATUTS } from '../constants.ts';
import { exporter } from '../exports.ts';
import { aujourdhui, ecranLarge, fmtDate, nouvelId, useMemoire } from '../utils.ts';
import { rapprocher } from '../doublons.ts';
import CandidatureFiche from './CandidatureFiche.tsx';
import FiltresPastilles from './FiltresPastilles.tsx';
import NumeroOffre from './NumeroOffre.tsx';
import { repliCandidature } from '../format.ts';

// Statuts à suivre en priorité, affichés par défaut

export default function Candidatures({ etat, maj, selection, setSelection, ouvrirOffre, ouvrirCv, ouvrirLettre, ouvrirContact }) {
  const { candidatures, taches } = etat;
  const [filtre, setFiltre] = useMemoire('cand.filtre', 'actives');
  const [q, setQ] = useState('');
  const [message, setMessage] = useState('');
  // NOTE: offres chargées pour afficher et choisir l'offre liée ; en cas d'échec, les candidatures restent utilisables
  const [offres, setOffres] = useState<any>(null);
  useEffect(() => { chargerOffres().then(setOffres).catch(() => setOffres([])); }, []);

  // ANCHOR: offre correspondant à chaque candidature (lien, ou numéro retrouvé dans la candidature), pour afficher son numéro partout
  const offreDe = useMemo(() => rapprocher(offres, candidatures).parCandidature, [offres, candidatures]);

  // Prochaine tâche ouverte de chaque candidature
  const prochaine = useMemo(() => {
    const m = new Map<any, any>();
    for (const t of taches) {
      if (t.faite || !t.candidature_id) continue;
      const p = m.get(t.candidature_id);
      if (!p || (t.echeance || '9999') < (p.echeance || '9999')) m.set(t.candidature_id, t);
    }
    return m;
  }, [taches]);

  // ANCHOR: les compteurs suivent la recherche, comme la liste : le nombre annoncé est celui affiché
  const recherchees = useMemo(() => {
    const t = q.trim().toLowerCase();
    return candidatures.filter(d => !t || `${d.offre_id || ''} ${d.entreprise} ${d.poste} ${d.description || ''} ${d.plateforme || ''} ${d.notes || ''}`.toLowerCase().includes(t));
  }, [candidatures, q]);

  const compteurs = useMemo(() => {
    const c = Object.fromEntries(Object.keys(STATUTS).map(k => [k, 0]));
    recherchees.forEach(d => { if (c[d.statut] !== undefined) c[d.statut]++; });
    return c;
  }, [recherchees]);

  const liste = useMemo(() => recherchees
    .filter(d => filtre === 'toutes' || (filtre === 'actives' ? ACTIFS.includes(d.statut) : d.statut === filtre))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')), [recherchees, filtre]);

  const choisie = candidatures.find(d => d.id === selection) ?? null;

  // NOTE: sur grand écran, la première candidature de la liste s'ouvre si aucune n'est choisie
  useEffect(() => {
    if (!choisie && liste.length && ecranLarge()) setSelection(liste[0].id);
  }, [choisie, liste, setSelection]);

  const nouvelle = () => {
    const id = nouvelId();
    maj(e => ({ candidatures: [...e.candidatures, { id, entreprise: 'Nouvelle candidature', poste: 'Poste à préciser', description: '', statut: 'a_faire', plateforme: '', mode_envoi: '', cv: '', lettre: false, interet: '', raison: '', date: aujourdhui(), notes: '', offre_id: null, lien: '' }] }));
    setFiltre('toutes');
    setQ('');
    setSelection(id);
  };

  const lancerExport = async format => {
    try {
      await exporter(format, candidatures);
      setMessage(`Export ${format.toUpperCase()} prêt`);
    } catch (e) {
      console.error(e);
      setMessage('Export impossible');
    }
    setTimeout(() => setMessage(''), 2500);
  };

  const aujourd = aujourdhui();

  return (
    <section aria-labelledby="titre-cand" className={'split' + (choisie ? ' avec-detail' : '')}>
      <h2 id="titre-cand" className="sr-only">Candidatures</h2>

      <div className="split-liste">
        <div className="sync-bar">
          <ChampRecherche className="search" placeholder="Entreprise, poste, note..." value={q} onChange={e => setQ(e.target.value)} />
          <button type="button" className="btn btn-primary small" onClick={nouvelle} title="Nouvelle candidature"><Plus size={15} />Candidature</button>
        </div>
        <FiltresPastilles label="Filtrer par statut" valeur={filtre} onChange={setFiltre} items={[
          { cle: 'toutes', libelle: 'Toutes', couleur: 'var(--c-grey)', nombre: recherchees.length },
          { cle: 'actives', libelle: 'Actives', couleur: 'var(--accent)', nombre: ACTIFS.reduce((n, k) => n + compteurs[k], 0) },
          ...Object.entries(STATUTS).map(([k, st]) => ({ cle: k, libelle: st.label, couleur: st.color, nombre: compteurs[k] })),
        ]} />

        {liste.length === 0 ? (
          <p className="empty">Aucune candidature ne correspond à ce filtre ou à cette recherche.</p>
        ) : (
          <ul className="rows">
            {liste.map(d => {
              const s = STATUTS[d.statut] || STATUTS.en_cours;
              const t = prochaine.get(d.id);
              const retard = t?.echeance && t.echeance < aujourd;
              return (
                <li key={d.id}>
                  <button type="button" className={'row' + (d.id === selection ? ' on' : '')} style={{ '--c': s.color }} onClick={() => setSelection(d.id)} aria-current={d.id === selection}>
                    <span className="row-title">
                      <NumeroOffre offre={{ id_offre: d.offre_id || offreDe.get(d.id)?.id_offre }} copiable={false} repli={repliCandidature(d)} />
                      <span className="titre-texte">
                        {d.entreprise}
                        {d.interet && <span className={'heart ' + d.interet} title={INTERETS[d.interet]} aria-label={INTERETS[d.interet]}> ♥</span>}
                      </span>
                    </span>
                    <span className="row-sub">{d.poste}</span>
                    <span className="row-badges">
                      <span className="badge"><span className="dot" />{s.label}</span>
                      {t && <span className={'tag' + (retard ? ' retard' : '')}>{retard ? 'En retard : ' : ''}{t.titre}{t.echeance ? ` · ${fmtDate(t.echeance)}` : ''}</span>}
                    </span>
                    <span className="row-date">{fmtDate(d.date)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="toolbar-actions">
          <span className="muted small">Exporter</span>
          {['csv', 'xml', 'pdf'].map(f => <button key={f} type="button" className="btn btn-ghost small" onClick={() => lancerExport(f)} title={`Exporter en ${f.toUpperCase()}`}><Download size={14} />{f.toUpperCase()}</button>)}
          <span className="muted small" role="status">{message}</span>
        </div>
      </div>

      <div className="split-detail">
        {choisie ? (
          <CandidatureFiche key={choisie.id} c={choisie} etat={etat} maj={maj} offres={offres} ouvrirOffre={ouvrirOffre} ouvrirCv={ouvrirCv} ouvrirLettre={ouvrirLettre} ouvrirContact={ouvrirContact} offreTrouvee={offreDe.get(choisie.id)} fermer={() => setSelection(null)} />
        ) : (
          <p className="empty">Choisir une candidature pour voir où elle en est, noter un échange ou planifier une tâche.</p>
        )}
      </div>
    </section>
  );
}
