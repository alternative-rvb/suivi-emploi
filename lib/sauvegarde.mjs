// ANCHOR: sauvegarde complète facultative au démarrage du serveur : lance le script désigné par SUIVI_SAUVEGARDE_SCRIPT
// (chemin relatif à la racine du projet ou absolu), en arrière-plan, sans jamais bloquer ni faire tomber le serveur.
// NOTE: le script reçoit SAUVEGARDE_MIN_MINUTES pour s'abstenir s'il a déjà tourné récemment (npm run dev redémarre souvent).
import { execFile as execFileNode } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export const MINUTES_ENTRE_SAUVEGARDES = 30;

/**
 * @param {string | undefined} script valeur de SUIVI_SAUVEGARDE_SCRIPT
 * @param {string} racine dossier du projet, répertoire de travail du script
 * @param {{ execFile?: typeof execFileNode, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<{ ok: boolean, raison?: string, sortie?: string }>}
 */
export function lancerSauvegarde(script, racine, { execFile = execFileNode, env = process.env } = {}) {
  const valeur = (script ?? '').trim();
  if (!valeur) return Promise.resolve({ ok: false, raison: 'désactivé' });
  const chemin = isAbsolute(valeur) ? valeur : join(racine, valeur);
  if (!existsSync(chemin) || !statSync(chemin).isFile()) return Promise.resolve({ ok: false, raison: 'script introuvable' });
  return new Promise(resolve => {
    execFile(chemin, [], {
      cwd: racine,
      timeout: 120_000,
      env: { ...env, SAUVEGARDE_MIN_MINUTES: String(MINUTES_ENTRE_SAUVEGARDES) },
    }, (erreur, stdout, stderr) => {
      const sortie = `${stdout ?? ''}${stderr ?? ''}`.trim();
      resolve(erreur ? { ok: false, raison: sortie || String(erreur.message) } : { ok: true, sortie });
    });
  });
}
