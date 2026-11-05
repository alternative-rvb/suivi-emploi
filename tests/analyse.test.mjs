// Tests de l'analyse par modèle : questions et note, fournisseurs avec un faux fetch, passage complet sur une base en mémoire.
// Aucun appel réseau réel, aucun modèle requis.
import test from 'node:test';
import assert from 'node:assert/strict';

const { fournisseurActif, lancerAnalyse, offresAAnalyser, ouvrirAnalyses, lireAnalyse, resumeAnalyse } = await import('../lib/analyse/index.mjs');
const { validerReponses, noter, POIDS } = await import('../lib/analyse/questions.mjs');
const { default: creerOllama } = await import('../lib/analyse/ollama.mjs');
const { default: creerOpenai } = await import('../lib/analyse/openai-compatible.mjs');
const { ErreurSync } = await import('../lib/erreurs.mjs');
const { ouvrirBase } = await import('../lib/offres.mjs');

const ANNONCE = 'Cabinet comptable recherche un collaborateur. Diplôme exigé : Bac+2 en comptabilité (BTS CG ou DCG). Expérience de 4 ans minimum. Maîtrise de Sage. Télétravail 1 jour par semaine. '.repeat(2);
const REPONSE = {
  famille: 'comptabilite', niveau: 'confirme', diplome_exige: true, diplome_citation: 'Bac+2 en comptabilité', experience_annees: 4,
  experience_citation: 'Expérience de 4 ans minimum', cabinet: true, teletravail: 'partiel', salaire_cite: '', logiciels: ['Sage'], resume: 'Poste de collaborateur comptable.',
};
const json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
const avecFetch = async (f, corps) => {
  const original = globalThis.fetch;
  globalThis.fetch = f;
  try { return await corps(); } finally { globalThis.fetch = original; }
};

function baseTest(n = 3) {
  const db = ouvrirBase(':memory:');
  ouvrirAnalyses(db);
  const ins = db.prepare("INSERT INTO offres (id_offre, titre, entreprise, categorie, date_detection, annonce) VALUES (?, ?, 'ClientABC', 'comptabilite', ?, ?)");
  for (let i = 1; i <= n; i++) ins.run(`o${i}`, `Comptable ${i}`, `2026-10-${10 + i}`, ANNONCE);
  return db;
}
const faux = (repondre, extra = {}) => ({ id: 'faux', nom: 'Faux', modele: 'm', url: 'http://localhost:1', async preparer() {}, repondre, ...extra });

test('réponses : une citation absente de l\'annonce invalide la valeur chiffrée', () => {
  const ok = validerReponses(REPONSE, ANNONCE);
  assert.deepEqual(ok.verifie, { diplome: true, experience: true, salaire: false });
  const inventee = validerReponses({ ...REPONSE, diplome_citation: 'Master en astrophysique', salaire_cite: '5000 euros' }, ANNONCE);
  assert.equal(inventee.verifie.diplome, false);
  assert.equal(inventee.salaire_cite, '');
  // phrase réellement présente dans l'annonce mais qui ne parle pas de diplôme
  const horsSujet = validerReponses({ ...REPONSE, diplome_citation: 'Télétravail 1 jour par semaine' }, ANNONCE);
  assert.equal(horsSujet.verifie.diplome, false);
});

test('réponses : valeurs hors liste ramenées à une valeur neutre, objet invalide refusé', () => {
  const r = validerReponses({ famille: 'cuisine', niveau: 'dieu', teletravail: 'peut-être', experience_annees: 'beaucoup', logiciels: 'Sage' }, ANNONCE);
  assert.equal(r.famille, 'autre');
  assert.equal(r.niveau, 'inconnu');
  assert.equal(r.teletravail, 'inconnu');
  assert.equal(r.experience_annees, 0);
  assert.deepEqual(r.logiciels, []);
  assert.throws(() => validerReponses('texte', ANNONCE), (/** @type {any} */ e) => e instanceof ErreurSync && e.code === 'format');
});

test('note : poids appliqués seulement aux exigences vérifiées, bornée entre 0 et 100', () => {
  const { note, details } = noter(validerReponses(REPONSE, ANNONCE));
  assert.equal(note, POIDS.base + POIDS.diplome + POIDS.parAnneeSupplementaire + POIDS.cabinet + POIDS.teletravail.partiel);
  assert.equal(details.length, 4);
  const sansPreuve = noter(validerReponses({ ...REPONSE, diplome_citation: 'inventé', experience_citation: 'inventé' }, ANNONCE));
  assert.ok(sansPreuve.note > note);
  assert.equal(noter({ niveau: 'responsable', cabinet: true, verifie: { diplome: true, experience: true }, experience_annees: 40, teletravail: 'non' }).note, 0);
  assert.equal(noter(null), null);
});

test('fournisseur : désactivé par défaut, inconnu et adresse distante refusés', () => {
  assert.equal(fournisseurActif({}), null);
  assert.equal(fournisseurActif({ ANALYSE_PROVIDER: 'aucun' }), null);
  assert.throws(() => fournisseurActif({ ANALYSE_PROVIDER: 'gpt' }), (/** @type {any} */ e) => e.code === 'config' && /inconnu/.test(e.message));
  assert.throws(() => fournisseurActif({ ANALYSE_PROVIDER: 'ollama', ANALYSE_URL: 'https://exemple.org' }), (/** @type {any} */ e) => e.code === 'config' && /hors de cette machine/.test(e.message));
  assert.equal(fournisseurActif({ ANALYSE_PROVIDER: 'ollama', ANALYSE_URL: 'https://exemple.org', ANALYSE_DISTANT: '1' }).id, 'ollama');
  assert.equal(fournisseurActif({ ANALYSE_PROVIDER: 'ollama' }).modele, 'qwen3:8b');
  assert.throws(() => fournisseurActif({ ANALYSE_PROVIDER: 'openai-compatible' }), (/** @type {any} */ e) => e.code === 'config');
});

test('ollama : envoie le schéma et renvoie le JSON, traduit les erreurs', async () => {
  const f = creerOllama({ ANALYSE_MODELE: 'm-test' });
  let envoye;
  await avecFetch(async (url, opts) => { envoye = { url: String(url), corps: JSON.parse(opts.body) }; return json({ message: { content: JSON.stringify(REPONSE) } }); }, async () => {
    assert.deepEqual(await f.repondre({ consigne: 'c', message: 'm', schema: { type: 'object' } }), REPONSE);
  });
  assert.equal(envoye.url, 'http://localhost:11434/api/chat');
  assert.equal(envoye.corps.model, 'm-test');
  assert.equal(envoye.corps.think, false);
  assert.deepEqual(envoye.corps.format, { type: 'object' });
  const appel = () => f.repondre({ consigne: 'c', message: 'm', schema: {} });
  await avecFetch(async () => json({ error: 'model not found' }, 404), () => assert.rejects(appel, (/** @type {any} */ e) => e.code === 'config' && /ollama pull m-test/.test(e.message)));
  await avecFetch(async () => json({}, 500), () => assert.rejects(appel, (/** @type {any} */ e) => e.code === 'http'));
  await avecFetch(async () => json({ message: { content: 'pas du json' } }), () => assert.rejects(appel, (/** @type {any} */ e) => e.code === 'format'));
  await avecFetch(async () => { throw new TypeError('fetch failed'); }, () => assert.rejects(appel, (/** @type {any} */ e) => e.code === 'reseau'));
});

test('openai-compatible : jeton, schéma strict, clôture Markdown retirée', async () => {
  const f = creerOpenai({ ANALYSE_URL: 'http://localhost:1234/v1/', ANALYSE_MODELE: 'm', ANALYSE_CLE: 'cle-test' });
  let vu;
  await avecFetch(async (url, opts) => { vu = { url: String(url), auth: opts.headers.Authorization, corps: JSON.parse(opts.body) }; return json({ choices: [{ message: { content: '```json\n' + JSON.stringify(REPONSE) + '\n```' } }] }); }, async () => {
    assert.deepEqual(await f.repondre({ consigne: 'c', message: 'm', schema: { type: 'object' } }), REPONSE);
  });
  assert.equal(vu.url, 'http://localhost:1234/v1/chat/completions');
  assert.equal(vu.auth, 'Bearer cle-test');
  assert.equal(vu.corps.response_format.json_schema.strict, true);
  await avecFetch(async () => json({}, 401), () => assert.rejects(() => f.repondre({ consigne: 'c', message: 'm', schema: {} }), (/** @type {any} */ e) => e.code === 'auth'));
});

test('passage : analyse tout, puis rien à refaire, puis seulement ce qui change', async () => {
  const db = baseTest(3);
  let appels = 0;
  const f = faux(async () => { appels++; return REPONSE; });
  const r = await lancerAnalyse(db, 'test', { fournisseur: f });
  assert.equal(r.ok, true);
  assert.equal(r.faits, 3);
  assert.equal(appels, 3);
  const o = db.prepare("SELECT reponses FROM analyses WHERE id_offre = 'o1'").get();
  assert.equal(lireAnalyse(o.reponses).note, noter(validerReponses(REPONSE, ANNONCE)).note);
  assert.equal(offresAAnalyser(db).length, 0);
  await lancerAnalyse(db, 'test', { fournisseur: f });
  assert.equal(appels, 3);
  db.prepare("UPDATE offres SET annonce = ? WHERE id_offre = 'o2'").run(ANNONCE + ' Nouvelle phrase.');
  assert.deepEqual(offresAAnalyser(db).map(x => x.id_offre), ['o2']);
  await lancerAnalyse(db, 'test', { fournisseur: f });
  assert.equal(appels, 4);
  await lancerAnalyse(db, 'test', { fournisseur: f, refaire: true });
  assert.equal(appels, 7);
});

test('passage : les plus récentes d\'abord, limite, offres ignorées ou trop courtes écartées, orphelines purgées', async () => {
  const db = baseTest(3);
  db.prepare("UPDATE offres SET ignoree = 1 WHERE id_offre = 'o1'").run();
  db.prepare("UPDATE offres SET annonce = 'court' WHERE id_offre = 'o2'").run();
  assert.deepEqual(offresAAnalyser(db).map(x => x.id_offre), ['o3']);
  const db2 = baseTest(3);
  const vus = [];
  await lancerAnalyse(db2, 'test', { fournisseur: faux(async () => { vus.push(1); return REPONSE; }), limite: 2 });
  assert.equal(vus.length, 2);
  assert.deepEqual(db2.prepare('SELECT id_offre FROM analyses ORDER BY id_offre').all().map(x => x.id_offre), ['o2', 'o3']);
  db2.prepare("DELETE FROM offres WHERE id_offre = 'o2'").run();
  await lancerAnalyse(db2, 'test', { fournisseur: faux(async () => REPONSE) });
  assert.deepEqual(db2.prepare('SELECT id_offre FROM analyses ORDER BY id_offre').all().map(x => x.id_offre), ['o1', 'o3']);
});

test('passage : service injoignable arrête tout sans enregistrer, réponses illisibles à la chaîne aussi', async () => {
  const db = baseTest(8);
  let appels = 0;
  const r = await lancerAnalyse(db, 'test', { fournisseur: faux(async () => { appels++; throw new ErreurSync('reseau', 'Ollama injoignable'); }) });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'reseau');
  assert.equal(appels, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM analyses').get().n, 0);
  appels = 0;
  const r2 = await lancerAnalyse(db, 'test', { fournisseur: faux(async () => { appels++; throw new ErreurSync('format', 'pas du json'); }) });
  assert.equal(r2.ok, false);
  assert.equal(appels, 5);
  // une réponse illisible isolée n'arrête pas le passage
  let n = 0;
  const r3 = await lancerAnalyse(db, 'test', { fournisseur: faux(async () => { if (++n === 2) throw new ErreurSync('format', 'x'); return REPONSE; }) });
  assert.equal(r3.ok, true);
  assert.equal(r3.faits, 7);
  assert.equal(r3.echecs, 1);
});

test('passage : verrou (une seule exécution à la fois) et résumé', async () => {
  const db = baseTest(2);
  let appels = 0;
  const f = faux(async () => { appels++; await new Promise(r => setTimeout(r, 20)); return REPONSE; });
  const [a, b] = [lancerAnalyse(db, 'test', { fournisseur: f }), lancerAnalyse(db, 'test', { fournisseur: f })];
  assert.equal(a, b);
  await a;
  assert.equal(appels, 2);
  const resume = resumeAnalyse(db, {});
  assert.equal(resume.actif, false);
  assert.equal(resume.analysees, 2);
  assert.equal(resume.restantes, 0);
  assert.equal(resume.enCours, false);
});

test('passage : analyse désactivée ou mal configurée, aucun appel et état explicite', async () => {
  const db = baseTest(1);
  const avant = { ...process.env };
  delete process.env.ANALYSE_PROVIDER;
  assert.equal(await lancerAnalyse(db, 'test'), null);
  process.env.ANALYSE_PROVIDER = 'inconnu';
  const r = await lancerAnalyse(db, 'test');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'config');
  process.env = avant;
});

test('terminerResume : coupe à la dernière phrase complète, sinon au dernier mot', async () => {
  const { terminerResume } = await import('../lib/analyse/questions.mjs');
  assert.equal(terminerResume('Une phrase courte et complète.'), 'Une phrase courte et complète.');
  const long = 'Première phrase assez longue pour dépasser le seuil de quarante caractères. Seconde phrase coupée en plein mil';
  assert.equal(terminerResume(long), 'Première phrase assez longue pour dépasser le seuil de quarante caractères.');
  assert.equal(terminerResume('Un résumé sans point final qui continue encore et encore sans jamais finir de phrase com'), 'Un résumé sans point final qui continue encore et encore sans jamais finir de phrase...');
  assert.equal(terminerResume(''), '');
  assert.ok(terminerResume('mot '.repeat(300)).length <= 604);
});
