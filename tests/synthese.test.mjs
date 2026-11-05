// Tests du profil synthétique et des sujets de veille (ligne 86) : contrôles des réponses, cache et péremption, verrou.
// Faux fournisseur, base en mémoire, aucun appel réseau ni modèle requis.
import test from 'node:test';
import assert from 'node:assert/strict';

const { filtrerVeille, lancerSynthese, ouvrirSyntheses, resumeSyntheses, sourceProfil, validerProfilIa, validerVeille } = await import('../lib/analyse/synthese.mjs');
const { ErreurSync } = await import('../lib/erreurs.mjs');
const { ouvrirBase } = await import('../lib/offres.mjs');

const REGLAGES = { zones: ['83'], mots_cles: ['comptable'], mots_exclus: ['stage'], contrats_exclus: [], entreprises: [] };
const CANDIDATURES = [
  { poste: 'Assistant comptable', entreprise: 'ClientABC', statut: 'entretien', departement: '13', ville: 'Marseille' },
  { poste: 'Formateur web', entreprise: 'ProjetX', statut: 'refuse', departement: '83', ville: 'Villeneuve' },
  { poste: 'Comptable en alternance', entreprise: 'ProjetY', statut: 'ecarte', departement: '83', ville: 'Villeneuve' },
  { poste: 'Formateur CDI', entreprise: 'ProjetZ', statut: 'en_cours', departement: '83', ville: 'Hyères' },
];
const faux = (repondre, extra = {}) => ({ id: 'faux', nom: 'Faux', modele: 'm', url: 'http://localhost:1', async preparer() {}, repondre, ...extra });

function baseTest() {
  const db = ouvrirBase(':memory:');
  ouvrirSyntheses(db);
  db.prepare("INSERT INTO kv (cle, valeur) VALUES ('reglages', ?)").run(JSON.stringify(REGLAGES));
  db.prepare("INSERT INTO kv (cle, valeur) VALUES ('profil', ?)").run(JSON.stringify({ accroche: 'Comptable et formateur digital', resume: 'Tenue de comptabilité sur Sage, animation de formations web.', contact: { nom: 'Personne Fictive', telephone: '0600000000' } }));
  db.prepare("INSERT INTO offres (id_offre, titre, entreprise, departement, ville, categorie, date_detection) VALUES ('o1', 'Assistant comptable', 'ClientABC', '13', 'Marseille', 'comptabilite', '2026-10-20')").run();
  db.prepare("INSERT INTO candidatures (id, entreprise, poste, statut, date, offre_id) VALUES ('c1', 'ClientABC', 'Assistant comptable', 'entretien', '2026-10-21', 'o1')").run();
  return db;
}

test('profil : point fort sans preuve écarté, mot-clé absent de la source retiré, métiers dédoublonnés', () => {
  const source = 'Tenue de comptabilité sur Sage pendant six ans. Animation de formations web.';
  const r = validerProfilIa({
    titre: 'Comptable formateur', correspond: 'Profil hybride.', seniorite: 'gourou', synthese: 'Parcours mixte.', points_attention: ['Dispersion', '', 'Période à expliquer'],
    points_forts: [
      { point: 'Maîtrise de Sage', preuve: 'Comptable, 2010 : Tenue de comptabilité sur Sage' },
      { point: 'Expert SAP', preuve: 'dix ans de SAP sur des projets internationaux' },
      { point: 'Formateur', preuve: 'Animation de formations' },
    ],
    metiers: [{ categorie: 'comptabilite', intitule: 'Assistant comptable' }, { categorie: 'cuisine', intitule: 'assistant comptable' }, { categorie: 'formateur_digital', intitule: 'Formateur web' }],
    mots_cles: ['Sage', 'SAP', 'sage'],
  }, source);
  assert.deepEqual(r.points_forts.map(p => p.point), ['Maîtrise de Sage']);
  assert.equal(r.points_forts[0].preuve, 'Tenue de comptabilité sur Sage');
  assert.equal(r.points_ecartes, 2);
  assert.deepEqual(r.metiers.map(m => m.intitule), ['Assistant comptable', 'Formateur web']);
  assert.deepEqual(r.mots_cles, ['Sage']);
  assert.equal(r.seniorite, '');
  assert.deepEqual(r.points_attention, ['Dispersion', 'Période à expliquer']);
  assert.throws(() => validerProfilIa([], source), (/** @type {any} */ e) => e instanceof ErreurSync && e.code === 'format');
});

test('profil : la source reprend le Profil, sans téléphone ni email, ni CV de référence, ni titres enseignés', () => {
  const db = baseTest();
  db.prepare("INSERT INTO cv_references (id, fichier, importe_le, pages, texte) VALUES ('r1', 'cv.pdf', '2026-10-20', 1, 'Texte du PDF importé')").run();
  db.prepare("INSERT INTO experiences (id, poste, employeur, type, categorie, debut, fin) VALUES ('e1', 'Comptable', 'ClientABC', 'salarie', 'comptabilite', '2010-01', '2015-12')").run();
  db.prepare("INSERT INTO competences (id, domaine, competence, executer, enseigner) VALUES ('k1', 'Comptabilité', 'Sage', 4, 2)").run();
  db.prepare("INSERT INTO formations (id, type, titre) VALUES ('f1', 'diplome', 'BTS CG'), ('f2', 'titre_pro', 'DWWM')").run();
  const source = sourceProfil(db);
  for (const partie of ['Coordonnées :', 'Parcours :', 'Compétences', 'Diplômes et certifications obtenus par le candidat :']) assert.ok(source.includes(partie), partie);
  assert.match(source, /Nom : Personne Fictive/);
  assert.match(source, /comptabilité 6 ans/);
  assert.match(source, /Sage \(exécuter 4\/5, enseigner 2\/5\)/);
  assert.match(source, /candidat :\n- BTS CG/);
  assert.doesNotMatch(source, /0600000000|Texte du PDF|DWWM|Formations/);
});

test('veille : zones et employeurs tirés des candidatures, formats contrôlés, mot exclu contradictoire retiré', () => {
  const r = validerVeille({
    mots_cles: [{ valeur: 'Assistant comptable', raison: 'entretien' }, { valeur: 'Formateur IA générative', raison: 'inventé' }, { valeur: 'un intitulé beaucoup trop long pour un mot clé', raison: '' }],
    zones: [{ valeur: '13', raison: 'Marseille' }, { valeur: '06', raison: 'inventé' }, { valeur: 'Var', raison: '' }],
    entreprises: [{ valeur: 'clientabc', raison: 'entretien' }, { valeur: 'Inconnue SA', raison: '' }],
    mots_exclus: [{ valeur: 'comptable', raison: '' }, { valeur: 'alternance', raison: 'refus' }, { valeur: 'directeur', raison: '' }, { valeur: 'CDI', raison: '' }, { valeur: 'temps plein', raison: '' }],
  }, { candidatures: CANDIDATURES, reglages: REGLAGES });
  assert.deepEqual(r.mots_cles.map(s => s.valeur), ['Assistant comptable']);
  assert.deepEqual(r.zones.map(s => s.valeur), ['13']);
  assert.deepEqual(r.entreprises.map(s => s.valeur), ['ClientABC']);
  assert.deepEqual(r.mots_exclus.map(s => s.valeur), ['alternance']);
});

test('veille : une proposition entrée dans les réglages n\'est plus proposée', () => {
  const r = filtrerVeille({ mots_cles: [{ valeur: 'Comptable', raison: '' }, { valeur: 'Formateur', raison: '' }], zones: [], entreprises: [], mots_exclus: [] }, REGLAGES);
  assert.deepEqual(r.mots_cles.map(s => s.valeur), ['Formateur']);
});

test('passage complet : résultat en cache, périmé quand les candidatures changent, verrou partagé', async () => {
  const db = baseTest();
  let appels = 0;
  const f = faux(async () => {
    appels++;
    await new Promise(r => setTimeout(r, 20));
    return { mots_cles: [{ valeur: 'Assistant comptable', raison: 'entretien' }], zones: [{ valeur: '13', raison: 'Marseille' }], entreprises: [], mots_exclus: [] };
  });
  const [a, b] = [lancerSynthese(db, 'veille', { fournisseur: f }), lancerSynthese(db, 'veille', { fournisseur: f })];
  assert.equal(a, b);
  assert.equal((await a).ok, true);
  assert.equal(appels, 1);
  let v = resumeSyntheses(db, {}).veille;
  assert.equal(v.a_jour, true);
  assert.deepEqual(v.resultat.zones.map(s => s.valeur), ['13']);
  // NOTE: modifier les réglages ne périme pas le résultat, ajouter une candidature si
  db.prepare("INSERT INTO kv (cle, valeur) VALUES ('reglages', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(JSON.stringify({ ...REGLAGES, zones: ['83', '13'] }));
  v = resumeSyntheses(db, {}).veille;
  assert.equal(v.a_jour, true);
  assert.deepEqual(v.resultat.zones, []);
  db.prepare("INSERT INTO candidatures (id, entreprise, poste, statut, date) VALUES ('c2', 'ProjetX', 'Formateur', 'en_cours', '2026-10-22')").run();
  assert.equal(resumeSyntheses(db, {}).veille.a_jour, false);
});

test('passage en échec : erreur gardée dans l\'état, rien en cache', async () => {
  const db = ouvrirBase(':memory:');
  ouvrirSyntheses(db);
  const r = await lancerSynthese(db, 'veille', { fournisseur: faux(async () => ({})) });
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Aucune candidature/);
  const e = resumeSyntheses(db, {}).veille;
  assert.equal(e.resultat, null);
  assert.match(e.erreur, /Aucune candidature/);
});
