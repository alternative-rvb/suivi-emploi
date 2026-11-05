import { PartyPopper, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { badgesObtenus, grade, lundiDe, semaine } from '../progression.ts';
import { aujourdhui, useMemoire } from '../utils.ts';

export const CLE_NOTIFS = 'succes.notifs';

// NOTE: préférence lue au moment de l'envoi (elle se règle dans Profil > Badges), stockage du navigateur indisponible : pas de notification
const notifsActives = () => {
  try { return typeof Notification !== 'undefined' && Notification.permission === 'granted' && localStorage.getItem('suivi.' + CLE_NOTIFS) === 'true'; } catch { return false; }
};

function notifier(titre: string, corps: string) {
  if (!notifsActives()) return;
  try { new Notification(titre, { body: corps, icon: '/favicon.svg', tag: titre }); } catch { /* navigateur sans notification depuis la page : l'annonce dans l'app suffit */ }
}

// ANCHOR: détection des succès (nouveau grade, nouveau badge, objectif de la semaine), montée dans App pour fonctionner depuis n'importe quel onglet.
// Annonce dans l'app et notification du système si l'utilisateur l'a activée. La première visite mémorise l'existant sans fanfare.
export default function Succes({ progression }) {
  const { periodes, stats, fiable } = progression;
  const [vus, setVus] = useMemoire('progression.vus', null as null | { rang: number; badges: string[]; semaine?: string });
  const [annonces, setAnnonces] = useState<{ titre: string; mot: string }[]>([]);
  const g = grade(stats.envoyees);
  const obtenus = badgesObtenus(stats);
  const auj = aujourdhui();
  const sem = semaine(auj, periodes ?? []);

  useEffect(() => {
    // NOTE: sans journal chargé, les badges qui en dépendent manqueraient à la référence et seraient annoncés à tort plus tard
    if (!fiable) return;
    const ids = obtenus.map(b => b.id);
    const lundi = lundiDe(auj);
    if (vus == null || !Array.isArray(vus.badges)) { setVus({ rang: g.rang, badges: ids, semaine: sem.atteint ? lundi : '' }); return; }
    const nouveaux = obtenus.filter(b => !vus.badges.includes(b.id)).map(b => ({ titre: `Nouveau badge : ${b.titre}`, mot: b.mot }));
    if (g.rang > vus.rang) nouveaux.unshift({ titre: `Nouveau métier validé : ${g.actuel.titre}`, mot: g.actuel.mot });
    const semaineGagnee = sem.atteint && vus.semaine !== lundi;
    if (semaineGagnee) nouveaux.push({ titre: 'Objectif de la semaine atteint', mot: 'Quatre jours actifs : le reste de la semaine est du bonus.' });
    if (!nouveaux.length && g.rang === vus.rang && ids.length === vus.badges.length) return;
    setAnnonces(a => [...a, ...nouveaux]);
    for (const n of nouveaux) notifier(n.titre, n.mot);
    setVus({ rang: Math.max(g.rang, vus.rang), badges: [...new Set([...vus.badges, ...ids])], semaine: semaineGagnee ? lundi : vus.semaine });
  }, [fiable, periodes, g.rang, obtenus.length, sem.atteint]);

  if (!annonces.length) return null;
  return (
    <div className="succes-pile" role="status" aria-live="polite">
      {annonces.slice(0, 3).map((a, i) => (
        <div key={i + a.titre} className="prog-annonce">
          <PartyPopper size={22} aria-hidden="true" />
          <div><b>{a.titre}</b><span>{a.mot}</span></div>
          <button type="button" className="btn btn-ghost small" onClick={() => setAnnonces(l => l.filter((_, j) => j !== i))} aria-label="Fermer l'annonce"><X size={15} /></button>
        </div>
      ))}
    </div>
  );
}
