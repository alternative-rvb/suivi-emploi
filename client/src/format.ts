// ANCHOR: formats d'affichage communs (date et heure, durée, euros)
export const dateHeure = (d?: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const heureSeule = (ts: string) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const duree = (m: number | null | undefined) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`);
// NOTE: durée d'un traitement en millisecondes (génération, analyse), en secondes sous la minute, en minutes au-delà
// NOTE: moins d'une minute en secondes, moins d'une heure en minutes, au-delà « 1 h 33 » (quatre-vingt-dix minutes se lisent mal)
export const dureeMs = (ms: number) => {
  if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))} s`;
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const reste = min % 60;
  return `${Math.floor(min / 60)} h${reste ? ' ' + String(reste).padStart(2, '0') : ''}`;
};
export const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

// NOTE: sans numéro d'offre, identifiant de remplacement d'une candidature : la plateforme indiquée, sinon Internet (lien renseigné) ou Libre
export const repliCandidature = (c: { plateforme?: string; lien?: string }) => c.plateforme?.trim() || (c.lien?.trim() ? 'Internet' : 'Libre');
