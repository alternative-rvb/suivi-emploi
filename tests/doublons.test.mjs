// Tests des rapprochements : offre contre candidature, et annonces republiées. Lancer avec npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rapprocher, regrouperAnnonces } from '../client/src/doublons.ts';

const offre = (id, extra = {}) => ({ id_offre: id, titre: 'Comptable (H/F)', entreprise: 'ClientABC', lieu: '83 - Villeneuve', date_detection: '2026-10-10', ...extra });
const cand = (id, extra = {}) => ({ id, entreprise: 'ClientABC', poste: 'Comptable', statut: 'en_cours', date: '2026-10-11', ...extra });

test('rapprocher : le lien offre_id est prioritaire', () => {
  const { parOffre, parCandidature } = rapprocher([offre('111AAAA')], [cand('c1', { offre_id: '111AAAA' })]);
  assert.equal(parOffre.get('111AAAA').type, 'lien');
  assert.equal(parCandidature.get('c1').id_offre, '111AAAA');
});

test('rapprocher : le numéro écrit dans la candidature suffit', () => {
  const { parOffre } = rapprocher([offre('215CHVV', { entreprise: 'Autre' })], [cand('c1', { entreprise: 'Zzz', plateforme: 'France Travail (offre n° 215CHVV)' })]);
  assert.equal(parOffre.get('215CHVV').type, 'numero');
});

test('rapprocher : même employeur seulement, sans certitude', () => {
  const { parOffre } = rapprocher([offre('222BBBB')], [cand('c1')]);
  assert.equal(parOffre.get('222BBBB').type, 'employeur');
});

test('rapprocher : employeurs différents ou mot trop court, aucun rapprochement', () => {
  const { parOffre } = rapprocher([offre('1', { entreprise: 'ABC' }), offre('2', { entreprise: 'Dupont' })], [cand('c1', { entreprise: 'ABC SA' }), cand('c2', { entreprise: 'Durand' })]);
  assert.equal(parOffre.size, 0);
});

test('rapprocher : une candidature écartée ne compte ni par numéro ni par employeur', () => {
  const { parOffre } = rapprocher([offre('333CCCC')], [cand('c1', { statut: 'ecarte', plateforme: '333CCCC' })]);
  assert.equal(parOffre.size, 0);
});

test('rapprocher : entrées vides', () => {
  const { parOffre, parCandidature } = rapprocher(null, undefined);
  assert.equal(parOffre.size + parCandidature.size, 0);
});

test('regrouperAnnonces : une seule principale, la plus récente', () => {
  const l = [offre('A1', { date_detection: '2026-10-01' }), offre('A2', { date_detection: '2026-10-12' }), offre('A3', { date_detection: '2026-10-05' })];
  const { principales, groupes } = regrouperAnnonces(l);
  assert.deepEqual([...principales], ['A2']);
  assert.equal(groupes.get('A2').n, 3);
});

test('regrouperAnnonces : la copie déjà suivie devient la principale', () => {
  const l = [offre('A1', { date_detection: '2026-10-01' }), offre('A2', { date_detection: '2026-10-12' })];
  const { principales } = regrouperAnnonces(l, id => id === 'A1');
  assert.deepEqual([...principales], ['A1']);
});

test('regrouperAnnonces : casse, accents et espaces ne comptent pas', () => {
  const l = [offre('A1', { titre: 'Comptable  général' }), offre('A2', { titre: 'comptable general', entreprise: 'clientabc' })];
  assert.equal(regrouperAnnonces(l).principales.size, 1);
});

test('regrouperAnnonces : lieux différents ou employeur inconnu ne sont pas regroupés', () => {
  const l = [offre('A1'), offre('A2', { lieu: '13 - Aubagne' }), offre('B1', { entreprise: '' }), offre('B2', { entreprise: '  ' })];
  assert.equal(regrouperAnnonces(l).principales.size, 4);
});

test('regrouperAnnonces : une offre saisie à la main reste toujours visible', () => {
  const l = [offre('man-1'), offre('man-2')];
  assert.equal(regrouperAnnonces(l).principales.size, 2);
});
