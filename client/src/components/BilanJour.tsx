import { BarChart3, History } from 'lucide-react';
import { SqBilan, SqJournal } from './Squelettes.tsx';
import { useHauteur } from '../useHauteur.ts';
import { useEffect, useMemo, useState } from 'react';
import { chargerJournal, chargerRapport } from '../api.ts';
import { actionsMenees } from '../actions.ts';
import { heureSeule as heure } from '../format.ts';

// ANCHOR: compteurs du bilan en deux parties, offres puis candidatures, dans l'ordre d'affichage (clés du rapport de lib/journal.mjs)
const PARTIES: [string, [string, string][]][] = [
  ['Offres', [['offres_detectees', 'Détectées'], ['offres_vues', 'Vues'], ['offres_ecartees', 'Écartées']]],
  ['Candidatures', [['candidatures_vues', 'Vues'], ['candidatures_creees', 'Créées'], ['candidatures_envoyees', 'Envoyées'], ['changements_statut', 'Changements de statut'], ['echanges', 'Échanges'], ['taches_faites', 'Tâches faites']]],
];

// Bilan de la journée en deux cartes indépendantes (compteurs face à la veille, journal des actions du jour, ligne 95) qui partagent un seul chargement : l'accueil les place dans deux colonnes
export function useBilanJour(etat) {
  const [rapport, setRapport] = useState<any>(null);
  const [evenements, setEvenements] = useState<any[]>([]);
  const [erreur, setErreur] = useState('');
  // NOTE: les modifications partent à l'API une seconde après la dernière frappe : on recharge un peu après chaque changement de tâches ou de candidatures
  const signature = useMemo(() => JSON.stringify([etat.taches.map(t => [t.id, t.faite]), etat.candidatures.map(c => [c.id, c.statut])]), [etat.taches, etat.candidatures]);

  useEffect(() => {
    let annule = false;
    const charger = async () => {
      try {
        const sansDate = await chargerRapport();
        const au = sansDate.au;
        const veille = new Date(`${au}T00:00:00Z`);
        veille.setUTCDate(veille.getUTCDate() - 1);
        const du = veille.toISOString().slice(0, 10);
        const [r, ev] = await Promise.all([chargerRapport(du, au), chargerJournal(au)]);
        if (annule) return;
        setRapport(r);
        setEvenements(ev.filter(e => e.jour === au));
        setErreur('');
      } catch (e) {
        if (!annule) setErreur(e.message);
      }
    };
    const t = setTimeout(charger, 1500);
    const surFocus = () => charger();
    window.addEventListener('focus', surFocus);
    return () => { annule = true; clearTimeout(t); window.removeEventListener('focus', surFocus); };
  }, [signature]);

  // NOTE: phrases partagées avec le bilan par période du Profil (actions.ts)
  const lignes = useMemo(() => actionsMenees(evenements, etat), [evenements, etat.candidatures, etat.taches, etat.echanges]);
  return { rapport, lignes, erreur };
}

export function CarteBilan({ bilan }) {
  const { rapport, erreur } = bilan;
  const [hier, auj] = rapport?.periodes ?? [];
  const { ref, hauteur } = useHauteur('auj.bilan', 382, Boolean(auj));
  const tendance = (v, h) => (h == null ? '' : v > h ? '↑' : v < h ? '↓' : '=');

  return (
    <div className="carte" ref={ref} style={auj ? undefined : { minHeight: hauteur }}>
      <h3 className="carte-titre"><BarChart3 size={17} aria-hidden="true" />Bilan du jour</h3>
      {erreur && <p className="muted small" role="alert">Bilan indisponible : {erreur}</p>}
      {!auj && !erreur && <SqBilan />}
      {auj && (
        <div className="bilan-parties">
          {PARTIES.map(([titre, compteurs]) => (
            <section key={titre} aria-label={titre}>
              <h4 className="bilan-partie">{titre}</h4>
              <dl className="bilan">
                {compteurs.map(([cle, nom]) => (
                  <div key={cle} className="bilan-item">
                    <dt>{nom}</dt>
                    <dd>
                      <b>{auj[cle]}</b>
                      {hier && <span className="muted small" title={`Hier : ${hier[cle]}`}><span aria-hidden="true">{tendance(auj[cle], hier[cle])}</span> hier {hier[cle]}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function CarteJournal({ bilan, ouvrirCandidature }) {
  const { rapport, lignes, erreur } = bilan;
  const [tout, setTout] = useState(false);
  const visibles = tout ? lignes : lignes.slice(0, 8);
  const auj = rapport?.periodes?.[1];
  const { ref, hauteur } = useHauteur('auj.journal', 366, Boolean(auj));

  return (
    <div className="carte" ref={ref} style={auj ? undefined : { minHeight: hauteur }}>
      <h3 className="carte-titre"><History size={17} aria-hidden="true" />Journal du jour{lignes.length > 0 && <span className="muted small">{lignes.length}</span>}</h3>
      {!auj && !erreur && <SqJournal />}
      {auj && lignes.length === 0 && !erreur && <p className="muted small">Aucune action enregistrée aujourd'hui pour l'instant.</p>}
      {lignes.length > 0 && (
        <>
          <ul className="bilan-liste">
            {visibles.map(l => (
              <li key={l.id}>
                <time className="muted small" dateTime={l.ts}>{heure(l.ts)}</time>
                <span>{l.texte}</span>
                {l.candidature_id
                  ? <button type="button" className="lien" onClick={() => ouvrirCandidature(l.candidature_id)}>{l.libelle}</button>
                  : <span className="muted bilan-libelle">{l.libelle}</span>}
              </li>
            ))}
          </ul>
          {lignes.length > 8 && <button type="button" className="btn btn-ghost small" onClick={() => setTout(v => !v)}>{tout ? 'Réduire' : `Voir les ${lignes.length - 8} autres`}</button>}
        </>
      )}
    </div>
  );
}