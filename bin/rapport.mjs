// Usage : npm run rapport -- [--jour | --semaine | --mois] [--du AAAA-MM-JJ] [--au AAAA-MM-JJ] [--csv]
// Rapport d'activité tiré du journal des actions (lib/journal.mjs) : offres vues, écartées, candidatures, statuts, tâches, échanges.
// Par défaut : les 14 derniers jours, jour par jour (ou les 4 dernières semaines avec --semaine, les 12 derniers mois avec --mois). --csv écrit sur la sortie standard, prêt pour un tableur.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrirBase } from '../lib/offres.mjs';
import { rapport, rapportCsv } from '../lib/journal.mjs';

// NOTE: les commandes sont dans bin/ ; la base, le .env et data/ sont à la racine du projet
const ici = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valeur = nom => (args.includes(`--${nom}`) ? args[args.indexOf(`--${nom}`) + 1] : undefined);
const db = ouvrirBase(join(ici, 'suivi.db'));
const r = rapport(db, { du: valeur('du'), au: valeur('au'), grain: args.includes('--semaine') ? 'semaine' : args.includes('--mois') ? 'mois' : 'jour' });

if (args.includes('--csv')) {
  process.stdout.write(rapportCsv(r));
} else {
  console.log(`Rapport par ${r.grain} du ${r.du} au ${r.au} (fuseau ${r.fuseau})`);
  console.log(r.journal_depuis ? `Journal actif depuis le ${r.journal_depuis}. Avant cette date, les actions ne sont pas datées.` : 'Journal vide : aucune action enregistrée pour l\'instant.');
  console.table(r.periodes.map(({ periode, semaine, mois, ...c }) => ({ periode: semaine ? `${semaine} (${periode})` : mois ?? periode, ...c })));
}
