// Provider d'analyse Ollama (modèle local). Variables : ANALYSE_URL (défaut http://localhost:11434), ANALYSE_MODELE (défaut qwen3:8b),
// ANALYSE_CONTEXTE (fenêtre en tokens, défaut 8192), ANALYSE_OLLAMA_AUTO=0 pour ne jamais lancer `ollama serve` soi-même.
import { spawn } from 'node:child_process';
import { ErreurSync } from '../erreurs.mjs';

const DELAI_MS = 180_000;
const pause = ms => new Promise(r => setTimeout(r, ms));
const estLocal = url => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(url).hostname);

async function joignable(url) {
  try {
    return (await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

export default function creer(env = process.env) {
  const url = (env.ANALYSE_URL || 'http://localhost:11434').replace(/\/+$/, '');
  const modele = env.ANALYSE_MODELE || 'qwen3:8b';
  const contexte = Number(env.ANALYSE_CONTEXTE) || 8192;
  return {
    id: 'ollama',
    nom: 'Ollama',
    url,
    modele,

    // Vérifie qu'Ollama répond, et le lance en arrière-plan s'il est installé localement et arrêté
    async preparer() {
      if (await joignable(url)) return;
      if (!estLocal(url) || env.ANALYSE_OLLAMA_AUTO === '0') throw new ErreurSync('reseau', `Ollama injoignable sur ${url}.`);
      // NOTE: processus détaché, laissé en vie à l'arrêt de l'app (Ollama peut servir ailleurs)
      const enfant = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
      const absent = new Promise(resolve => enfant.on('error', () => resolve(true)));
      enfant.unref();
      for (let i = 0; i < 20; i++) {
        if (await Promise.race([absent, pause(1000).then(() => false)])) throw new ErreurSync('config', 'Ollama n\'est pas installé (commande ollama introuvable).');
        if (await joignable(url)) return;
      }
      throw new ErreurSync('reseau', `Ollama lancé mais sans réponse sur ${url} après 20 secondes.`);
    },

    // Renvoie l'objet JSON répondant au schéma
    async repondre({ consigne, message, schema }) {
      let rep;
      try {
        rep = await fetch(`${url}/api/chat`, {
          method: 'POST',
          signal: AbortSignal.timeout(DELAI_MS),
          body: JSON.stringify({
            model: modele,
            stream: false,
            think: false,
            format: schema,
            keep_alive: '10m',
            options: { temperature: 0, num_ctx: contexte },
            messages: [{ role: 'system', content: consigne }, { role: 'user', content: message }],
          }),
        });
      } catch (e) {
        throw new ErreurSync('reseau', e.name === 'TimeoutError' ? `Ollama n'a pas répondu en ${DELAI_MS / 1000} secondes.` : `Ollama injoignable sur ${url}.`);
      }
      const corps = await rep.json().catch(() => ({}));
      if (!rep.ok) {
        if (rep.status === 404) throw new ErreurSync('config', `Modèle ${modele} absent d'Ollama : lancer « ollama pull ${modele} ».`);
        throw new ErreurSync('http', `Ollama a répondu ${rep.status}${corps.error ? ` (${corps.error})` : ''}.`);
      }
      try {
        return JSON.parse(corps.message?.content ?? '');
      } catch {
        throw new ErreurSync('format', 'Réponse d\'Ollama qui n\'est pas du JSON.');
      }
    },
  };
}
