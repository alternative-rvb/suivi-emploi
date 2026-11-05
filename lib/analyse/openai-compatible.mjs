// Provider d'analyse pour tout serveur à l'API « chat completions » d'OpenAI : LM Studio, llama.cpp (llama-server), vLLM, Jan, ou un service distant.
// Variables : ANALYSE_URL (obligatoire, finit par /v1, ex. http://localhost:1234/v1), ANALYSE_MODELE (obligatoire), ANALYSE_CLE (jeton, facultatif).
import { ErreurSync } from '../erreurs.mjs';

const DELAI_MS = 180_000;

export default function creer(env = process.env) {
  const url = (env.ANALYSE_URL || '').replace(/\/+$/, '');
  const modele = env.ANALYSE_MODELE || '';
  if (!url || !modele) throw new ErreurSync('config', 'Le provider openai-compatible demande ANALYSE_URL (ex. http://localhost:1234/v1) et ANALYSE_MODELE.');
  const entetes = { 'Content-Type': 'application/json', ...(env.ANALYSE_CLE ? { Authorization: `Bearer ${env.ANALYSE_CLE}` } : {}) };
  return {
    id: 'openai-compatible',
    nom: 'API compatible OpenAI',
    url,
    modele,

    async preparer() {},

    async repondre({ consigne, message, schema }) {
      let rep;
      try {
        rep = await fetch(`${url}/chat/completions`, {
          method: 'POST',
          headers: entetes,
          signal: AbortSignal.timeout(DELAI_MS),
          body: JSON.stringify({
            model: modele,
            temperature: 0,
            response_format: { type: 'json_schema', json_schema: { name: 'analyse', strict: true, schema } },
            messages: [{ role: 'system', content: consigne }, { role: 'user', content: message }],
          }),
        });
      } catch (e) {
        throw new ErreurSync('reseau', e.name === 'TimeoutError' ? `Le serveur n'a pas répondu en ${DELAI_MS / 1000} secondes.` : `Serveur injoignable sur ${url}.`);
      }
      const corps = await rep.json().catch(() => ({}));
      if (rep.status === 401 || rep.status === 403) throw new ErreurSync('auth', 'Clé refusée : vérifier ANALYSE_CLE.');
      if (!rep.ok) throw new ErreurSync('http', `Le serveur a répondu ${rep.status}${corps.error?.message ? ` (${corps.error.message})` : ''}.`);
      // NOTE: certains serveurs entourent le JSON d'une clôture de code Markdown
      const contenu = (corps.choices?.[0]?.message?.content ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
      try {
        return JSON.parse(contenu);
      } catch {
        throw new ErreurSync('format', 'Réponse du serveur qui n\'est pas du JSON.');
      }
    },
  };
}
