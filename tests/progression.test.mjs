// Tests de la progression de l'accueil : défis, semaine, grades et métiers validés. Lancer avec npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { serieRecord, badgesObtenus, choisirDefis, DEFIS, defiFait, FAMILLES, grade, GRADES, niveauFamille, PREFIXE_DEFI, semaine, semainesReussies, statistiques, envoyeesSemaine, quotasTenus, TOUS_BADGES } from '../client/src/progression.ts';

const auj = '2026-10-22'; // un jeudi
const ctx = (extra = {}) => ({ auj, candidatures: [], taches: [], echanges: [], rapportJour: null, offresNonVues: 0, aRelancer: 0, enRetard: 0, ...extra });
const actif = jour => ({ periode: jour, offres_vues: 1 });

test('choisirDefis : tri si des offres attendent, relance si une candidature est oubliée', () => {
  const [action, suivi, rotation] = choisirDefis(ctx({ offresNonVues: 8, aRelancer: 2 }));
  assert.equal(action, 'trier');
  assert.equal(suivi, 'relancer');
  assert.ok(['reseau', 'pause', 'profil'].includes(rotation));
  assert.deepEqual(choisirDefis(ctx()).slice(0, 2), ['postuler', 'trier']);
});

test('défis : candidature du jour, tri compté par le journal, défi manuel par tâche faite', () => {
  assert.equal(defiFait(DEFIS.postuler, ctx({ candidatures: [{ date: auj, statut: 'a_faire' }] })), false);
  assert.equal(defiFait(DEFIS.postuler, ctx({ candidatures: [{ date: auj, statut: 'en_cours' }] })), false);
  assert.equal(defiFait(DEFIS.postuler, ctx({ candidatures: [{ date: auj, statut: 'en_cours' }, { date: auj, statut: 'entretien' }] })), true);
  assert.equal(defiFait(DEFIS.trier, ctx({ rapportJour: { offres_vues: 3, offres_ecartees: 2 } })), true);
  const tache = { faite: true, creee: auj, titre: PREFIXE_DEFI + DEFIS.pause.titre };
  assert.equal(defiFait(DEFIS.pause, ctx({ taches: [tache] })), true);
  assert.equal(defiFait(DEFIS.pause, ctx({ taches: [{ ...tache, creee: '2026-10-21' }] })), false);
});

test('semaine : jours ouvrés seulement pour l\'objectif, week-end en bonus', () => {
  const s = semaine(auj, [actif('2026-10-19'), actif('2026-10-20'), actif('2026-10-18')]);
  assert.equal(s.jours[0].jour, '2026-10-19');
  assert.equal(s.actifs, 2);
  assert.equal(s.atteint, false);
  assert.equal(semainesReussies(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-17'].map(actif)), 1);
  assert.equal(semainesReussies(['2026-10-12', '2026-10-13', '2026-10-17', '2026-10-18'].map(actif)), 0);
});

test('grades : seuils croissants jusqu\'au grade suprême', () => {
  assert.equal(grade(0).actuel.seuil, 0);
  assert.equal(grade(20).actuel.titre, 'Comptable des candidatures');
  assert.equal(grade(19).suivant.seuil, 20);
  assert.equal(grade(999).suivant, null);
  assert.equal(grade(999).actuel, GRADES.at(-1));
});

test('statistiques : envoyées hors à faire et écartées, défis manuels comptés', () => {
  const s = statistiques(
    /** @type {any[]} */ ([{ statut: 'en_cours' }, { statut: 'refuse' }, { statut: 'a_faire' }, { statut: 'ecarte' }]),
    /** @type {any[]} */ ([{ faite: true, titre: PREFIXE_DEFI + DEFIS.reseau.titre }]),
    /** @type {any[]} */ ([{}]),
    [{ periode: auj, offres_vues: 4, offres_ecartees: 1, refus: 0, entretiens: 2 }],
  );
  assert.equal(s.envoyees, 2);
  assert.equal(s.triees, 5);
  assert.equal(s.refus, 1);
  assert.equal(s.entretiens, 2);
  assert.equal(s.defis.reseau, 1);
});

test('grades et badges : seuils strictement croissants, titres construits sur le même modèle', () => {
  for (let i = 1; i < GRADES.length; i++) assert.ok(GRADES[i].seuil > GRADES[i - 1].seuil, GRADES[i].titre);
  for (const f of FAMILLES) {
    assert.equal(f.seuils.length, 3);
    assert.ok(f.seuils[0] < f.seuils[1] && f.seuils[1] < f.seuils[2], f.id);
  }
  assert.deepEqual(TOUS_BADGES.filter(b => b.famille.id === 'relance').map(b => b.titre), ['Relanceur apprenti', 'Relanceur confirmé', 'Relanceur émérite']);
});

test('badges : niveau atteint par famille', () => {
  const s = statistiques([], [], /** @type {any[]} */ (Array.from({ length: 6 }, () => ({}))), []);
  const relance = FAMILLES.find(f => f.id === 'relance');
  assert.equal(niveauFamille(relance, s), 2);
  assert.deepEqual(badgesObtenus(s).map(b => b.id), ['relance-1', 'relance-2']);
});

test('série : record de jours actifs consécutifs, conservé après une interruption', () => {
  const jours = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06'].map(actif);
  assert.equal(serieRecord([...jours, { periode: '2026-10-04' }]), 3);
  const sept = Array.from({ length: 7 }, (_, i) => actif(`2026-10-1${i}`));
  assert.equal(serieRecord([...sept, { periode: '2026-10-17' }]), 7);
  assert.equal(statistiques([], [], [], sept).serie, 7);
});

test('quotas : jours à 2 candidatures et semaines à 10, badges Sprinteur et Fondeur', () => {
  const c = (date, n = 1) => Array.from({ length: n }, () => ({ date, statut: 'en_cours' }));
  // lundi 19 : 2 ; mardi 20 : 1 ; mercredi 21 : 3 ; la semaine du 12 : 10 candidatures en tout
  const cands = /** @type {any[]} */ ([...c('2026-10-19', 2), ...c('2026-10-20'), ...c('2026-10-21', 3), ...c('2026-10-12', 4), ...c('2026-10-14', 3), ...c('2026-10-18', 3), { date: '2026-10-19', statut: 'a_faire' }]);
  const q = quotasTenus(cands);
  assert.equal(q.jours, 5);
  assert.equal(q.semaines, 1);
  const s = statistiques(cands, [], [], []);
  assert.equal(s.joursQuota, 5);
  assert.equal(niveauFamille(FAMILLES.find(f => f.id === 'quotidien'), s), 1);
  assert.equal(niveauFamille(FAMILLES.find(f => f.id === 'hebdo'), s), 1);
  assert.equal(envoyeesSemaine(cands, '2026-10-22'), 6);
});
