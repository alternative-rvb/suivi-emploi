// ANCHOR: copie quotidienne de la base vers un dossier externe, par exemple un dossier synchronisé, jamais lue par l'app depuis cet endroit.
// NOTE: suivi.db ne doit jamais vivre dans un dossier synchronisé (verrous SQLite, fichiers -wal corrompus) : on n'y dépose qu'une copie cohérente faite par VACUUM INTO.
import { existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { jourLocal } from './journal.mjs';

const MOTIF = /^suivi-\d{4}-\d{2}-\d{2}\.db$/;
const COPIES_GARDEES = 7;

/**
 * Copie la base dans `dossier` sous suivi-AAAA-MM-JJ.db, une fois par jour, et garde les 7 dernières.
 * Le dossier doit exister (il n'est jamais créé) : sinon rien n'est fait. Ne lève jamais d'erreur.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string | undefined} dossier
 * @returns {{ ok: boolean, fichier?: string, raison?: string }}
 */
export function exporterBase(db, dossier, maintenant = new Date()) {
  const cible = (dossier ?? '').trim();
  if (!cible) return { ok: false, raison: 'désactivé' };
  try {
    if (!existsSync(cible) || !statSync(cible).isDirectory()) return { ok: false, raison: 'dossier introuvable' };
    const fichier = join(cible, `suivi-${jourLocal(maintenant)}.db`);
    if (existsSync(fichier)) return { ok: false, raison: 'déjà faite aujourd\'hui' };
    // NOTE: écrite sous un nom provisoire puis renommée, pour que le synchroniseur ne voie jamais un fichier à moitié écrit
    const provisoire = join(cible, `.suivi-en-cours-${process.pid}.tmp`);
    rmSync(provisoire, { force: true });
    db.prepare('VACUUM INTO ?').run(provisoire);
    renameSync(provisoire, fichier);
    const anciennes = readdirSync(cible).filter(n => MOTIF.test(n)).sort().slice(0, -COPIES_GARDEES);
    for (const n of anciennes) rmSync(join(cible, n), { force: true });
    return { ok: true, fichier };
  } catch (e) {
    return { ok: false, raison: String(e.message) };
  }
}
