// Serveur réel lancé sur une copie dans un dossier temporaire, partagé par les tests de routes (pas un fichier de test : nom sans .test).
import { spawn } from 'node:child_process';
import { cpSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

// ANCHOR: copie de server.mjs, lib/ et package.json, lien vers node_modules (jspdf), port libre, environnement vidé pour ne lire aucune clé
// NOTE: env ajoute des variables choisies par le test (faux Google de tests/agenda.test.mjs)
export async function serveurTemporaire(dir, env = {}) {
  for (const f of ['server.mjs', 'package.json']) cpSync(join(racine, f), join(dir, f));
  cpSync(join(racine, 'lib'), join(dir, 'lib'), { recursive: true });
  symlinkSync(join(racine, 'node_modules'), join(dir, 'node_modules'));
  const port = 3400 + Math.floor(Math.random() * 2000);
  const proc = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: dir, env: { PATH: process.env.PATH, PORT: String(port), SUIVI_PROVIDERS: 'n8n', ...env }, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { await fetch(url + '/api/sync'); return { url, proc, port }; } catch { await new Promise(r => setTimeout(r, 50)); }
  }
  proc.kill();
  throw new Error('serveur de test injoignable');
}
