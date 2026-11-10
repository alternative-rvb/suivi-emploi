// ANCHOR: formats d'affichage communs (date et heure, durée, euros)
export const dateHeure = (d?: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const heureSeule = (ts: string) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const duree = (m: number | null | undefined) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`);
// NOTE: durée d'un traitement en millisecondes (génération, analyse), en secondes sous la minute, en minutes au-delà
export const dureeMs = (ms: number) => (ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60000)} min`);
export const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

// NOTE: sans numéro d'offre, identifiant de remplacement d'une candidature : la plateforme indiquée, sinon Internet (lien renseigné) ou Libre
export const repliCandidature = (c: { plateforme?: string; lien?: string }) => c.plateforme?.trim() || (c.lien?.trim() ? 'Internet' : 'Libre');
