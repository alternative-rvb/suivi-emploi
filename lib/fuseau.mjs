// Heure murale de Paris, sans dépendance Node : partagée par le serveur (lib/agenda/google.mjs) et l'interface (client/src/agenda.ts).
export const FUSEAU = 'Europe/Paris';

const FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

// NOTE: instant ISO (avec décalage) vers l'heure murale de Paris AAAA-MM-JJTHH:MM, format des rendez-vous locaux
export function heureParis(iso) {
  const p = Object.fromEntries(FORMAT.formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
