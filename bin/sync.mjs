// Usage : npm run sync
// Récupère les offres auprès des providers actifs (SUIVI_PROVIDERS, France Travail direct puis n8n en secours par défaut) et les fusionne dans suivi.db.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerEnv, lancerSync } from '../lib/sync.mjs';
import { ouvrirBase } from '../lib/offres.mjs';

// NOTE: les commandes sont dans bin/ ; la base, le .env et data/ sont à la racine du projet
const ici = join(dirname(fileURLToPath(import.meta.url)), '..');

if (!chargerEnv(ici)) {
  console.error('Fichier .env introuvable : copier .env.example vers .env puis renseigner SUIVI_API_URL et SUIVI_API_TOKEN.');
  process.exit(1);
}
const db = ouvrirBase(join(ici, 'suivi.db'));
try {
  const r = await lancerSync(db, ici, 'ligne de commande');
  console.log('Synchronisation du', r.source);
  console.log('Offres :', r.stats, r.parCat);
  console.log('Offres en base :', r.enBase);
  for (const p of r.providers) console.log(`Provider ${p.id} : ok, ${p.stats.retenues} offre(s) retenue(s)`);
  for (const e of r.echecs) console.error(`Provider ${e.id} : échec (${e.code}), ${e.erreur}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
