import { useEffect, useMemo, useState } from 'react';
import { chargerRapport } from './api.ts';
import { useMemoire } from './utils.ts';
import { lundiDe, statistiques } from './progression.ts';

// ANCHOR: périodes du journal (depuis sa première ligne, semaine en cours comprise) et statistiques de progression, partagées par l'accueil et le Profil.
// periodes vaut null tant que le rapport n'est pas chargé, fiable passe à true au premier chargement réussi (un échec laisse periodes à [] pour l'affichage). etat peut être null (appelé par App avant le premier chargement).
const VIDE: any[] = [];
export function useProgression(etat) {
  const candidatures = etat?.candidatures ?? VIDE;
  const taches = etat?.taches ?? VIDE;
  const echanges = etat?.echanges ?? VIDE;
  const [periodes, setPeriodes] = useState<any[] | null>(null);
  const [fiable, setFiable] = useState(false);
  // NOTE: défis du jour réussis (clés jour:id), mémorisés dans le navigateur car les défis automatiques se calculent sans laisser de trace dans les données
  const [defisNotes, setDefisNotes] = useMemoire('defis.reussis', [] as string[]);
  const noterDefis = (cles: string[]) => setDefisNotes(l => (cles.every(c => l.includes(c)) ? l : [...new Set([...l, ...cles])]));
  // NOTE: les modifications partent à l'API une seconde après la dernière action : rechargement du journal un peu après (même principe que BilanJour)
  const signature = useMemo(() => JSON.stringify([taches.map(t => [t.id, t.faite]), candidatures.map(c => [c.id, c.statut]), echanges.length]), [taches, candidatures, echanges]);

  useEffect(() => {
    if (!etat) return;
    let annule = false;
    const charger = async () => {
      try {
        const r = await chargerRapport();
        const depuis = (r.journal_depuis ?? '').slice(0, 10) || r.au;
        const lundi = lundiDe(r.au);
        const complet = await chargerRapport(depuis < lundi ? depuis : lundi, r.au);
        if (!annule) { setPeriodes(complet.periodes); setFiable(true); }
      } catch {
        if (!annule) setPeriodes(p => p ?? []);
      }
    };
    const t = setTimeout(charger, 1500);
    window.addEventListener('focus', charger);
    return () => { annule = true; clearTimeout(t); window.removeEventListener('focus', charger); };
  }, [signature, !etat]);

  const stats = useMemo(() => statistiques(candidatures, taches, echanges, periodes ?? [], defisNotes), [candidatures, taches, echanges, periodes, defisNotes]);
  return { periodes, stats, fiable, noterDefis };
}
