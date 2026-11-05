// Tests des actions menées tirées du journal (client/src/actions.ts, ligne 99) : phrases, dédoublonnage, rattachement aux candidatures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { actionsMenees, lignesJournal, phraseAction, phraseEchange, rechercheEmploi, statsMetier, valeursStat } from '../client/src/actions.ts';

let n = 0;
const ev = (entite, entite_id, action, extra = {}) => ({ id: ++n, ts: '2026-10-22T08:00:00Z', jour: '2026-10-22', entite, entite_id, libelle: '', action, champ: null, avant: null, apres: null, ...extra });

test('phrases : suppressions et champs sans intérêt ignorés', () => {
  assert.equal(phraseAction(ev('candidature', 'c1', 'suppression')), null);
  assert.equal(phraseAction(ev('offre', 'o1', 'modification', { champ: 'vue', apres: '0' })), null);
  assert.equal(phraseAction(ev('tache', 't1', 'modification', { champ: 'titre', apres: 'x' })), null);
  assert.deepEqual(phraseAction(ev('offre', 'o1', 'modification', { champ: 'ignoree', apres: '1' })), { rubrique: 'offre', texte: 'Offre écartée' });
  assert.deepEqual(phraseAction(ev('candidature', 'c1', 'modification', { champ: 'statut', apres: 'entretien' })).rubrique, 'candidature');
  assert.deepEqual(phraseAction(ev('cv', 1, 'creation')), { rubrique: 'cv', texte: 'CV généré' });
  assert.equal(phraseAction(ev('candidature', 'c1', 'creation', { champ: 'statut', apres: 'en_cours' })).texte, 'Candidature envoyée');
  assert.equal(phraseAction(ev('candidature', 'c1', 'creation', { champ: 'statut', apres: 'a_faire' })).texte, 'Candidature créée');
  assert.equal(phraseAction(ev('candidature', 'c1', 'creation'), { statut: 'refuse', date: '2026-10-22' }).texte, 'Candidature envoyée');
  assert.equal(phraseAction(ev('candidature', 'c1', 'creation'), { statut: 'refuse', date: '2026-10-01' }).texte, 'Candidature créée');
  assert.equal(phraseAction(ev('candidature', 'c1', 'modification', { champ: 'statut', avant: 'a_faire', apres: 'en_cours' })).texte, 'Candidature envoyée');
  assert.equal(phraseAction(ev('candidature', 'c1', 'consultation')).texte, 'Candidature consultée');
  assert.equal(phraseAction(ev('echange', 'e1', 'creation', { libelle: 'email envoye' })).texte, "Email envoyé à l'employeur");
});

test('phrases des contacts : ajout et offre reliée comptent, retrait de lien et coordonnées non', () => {
  assert.deepEqual(phraseAction(ev('contact', 'k1', 'creation')), { rubrique: 'contact', texte: 'Contact ajouté' });
  assert.equal(phraseAction(ev('contact', 'k1', 'modification', { champ: 'offres', avant: '', apres: 'man-1' })).texte, 'Contact relié à une offre');
  assert.equal(phraseAction(ev('contact', 'k1', 'modification', { champ: 'candidatures', avant: '', apres: 'c1' })).texte, 'Contact relié à une candidature');
  assert.equal(phraseAction(ev('contact', 'k1', 'modification', { champ: 'candidatures', avant: 'c1', apres: '' })), null);
  assert.equal(phraseAction(ev('contact', 'k1', 'modification', { champ: 'offres', avant: 'man-1, man-2', apres: 'man-1' })), null);
  assert.equal(phraseAction(ev('contact', 'k1', 'modification', { champ: 'telephone', apres: '0600000000' })), null);
  assert.equal(phraseAction(ev('contact', 'k1', 'suppression')), null);
});

test('actions : dédoublonnage par jour, profil compté une fois, échange et tâche rattachés à la candidature', () => {
  const evenements = [
    ev('offre', 'o1', 'modification', { champ: 'vue', apres: '1', libelle: 'Comptable' }),
    ev('offre', 'o1', 'modification', { champ: 'vue', apres: '1', libelle: 'Comptable' }),
    ev('experience', 'x1', 'modification', { champ: 'poste' }),
    ev('experience', 'x2', 'creation'),
    ev('echange', 'e1', 'creation', { libelle: 'telephone recu' }),
    ev('tache', 't1', 'creation', { libelle: 'Relancer' }),
    ev('candidature', 'c1', 'suppression'),
  ];
  const etat = { candidatures: [{ id: 'c1', entreprise: 'ClientABC', poste: 'Comptable' }], taches: [{ id: 't1', candidature_id: 'c1' }], echanges: [{ id: 'e1', canal: 'telephone', candidature_id: 'c1' }] };
  const a = actionsMenees(evenements, etat);
  assert.deepEqual(a.map(x => x.texte), ['Offre consultée', 'Parcours mis à jour', "Appel reçu de l'employeur", 'Tâche prévue']);
  assert.equal(a[2].libelle, 'ClientABC, Comptable');
  assert.equal(a[2].candidature_id, 'c1');
  assert.equal(a[3].libelle, 'Relancer (ClientABC)');
  assert.equal(a[1].libelle, '');
});

test('phrases des rendez-vous : ajout et report comptent, le reste non', () => {
  assert.deepEqual(phraseAction(ev('rendez_vous', 'r-1', 'creation')), { rubrique: 'rendez_vous', texte: 'Rendez-vous ajouté' });
  assert.equal(phraseAction(ev('rendez_vous', 'r-1', 'modification', { champ: 'debut', avant: '2026-11-02T10:00', apres: '2026-11-03T10:00' })).texte, 'Rendez-vous déplacé');
  assert.equal(phraseAction(ev('rendez_vous', 'r-1', 'modification', { champ: 'note', apres: 'x' })), null);
});

test("rechercheEmploi : candidatures envoyées de la période, de la plus récente à la plus ancienne, actions datées et résultat", () => {
  const candidatures = [
    { id: 'c5', entreprise: 'Studio Y', poste: 'Graphiste', description: 'Annonce Indeed, réf. 215flrd', statut: 'en_cours', date: '2026-10-07', plateforme: 'Indeed', offre_id: null, mode_envoi: 'email' },
    { id: 'c6', entreprise: 'Cabinet Z', poste: 'Comptable', notes: 'Vue sur Glassdoor, même annonce que 9123456 sur France Travail', statut: 'en_cours', date: '2026-10-08', plateforme: 'Glassdoor', offre_id: null, mode_envoi: '' },
    { id: 'c2', entreprise: 'ProjetX (studio, Villeneuve)', poste: 'Formateur web, CDD', statut: 'refuse', date: '2026-10-12', plateforme: 'Glassdoor (candidature facile)', offre_id: 'man-1', mode_envoi: 'email' },
    { id: 'c1', entreprise: 'ClientABC', poste: 'Comptable', statut: 'en_cours', date: '2026-10-05', plateforme: '', offre_id: 'o1', mode_envoi: 'formulaire' },
    { id: 'c3', entreprise: 'Hors période', poste: 'X', statut: 'en_cours', date: '2026-09-20', plateforme: '', offre_id: null, mode_envoi: '' },
    { id: 'c4', entreprise: 'Pas envoyée', poste: 'Y', statut: 'a_faire', date: '2026-10-06', plateforme: '', offre_id: null, mode_envoi: '' },
  ];
  const offres = [
    { id_offre: 'o1', titre: 'Comptable unique (H/F)', entreprise: 'CLIENTABC', ville: 'Villeneuve', contrat: 'CDI', source: 'France Travail' },
    { id_offre: '9123456', titre: 'Comptable (H/F)', entreprise: 'CABINET Z', ville: 'Rivière', contrat: 'CDD', source: 'France Travail' },
  ];
  const echanges = [
    { id: 'e1', candidature_id: 'c2', date: '2026-10-19', heure: '09:00', canal: 'telephone', sens: 'envoye' },
    { id: 'e2', candidature_id: 'c2', date: '2026-10-25', heure: '', canal: 'entretien', sens: 'recu' },
  ];
  const rendez_vous = [{ id: 'r1', candidature_id: 'c2', debut: '2026-10-24T10:00', type: 'visio' }];
  const evenements = [
    ev('candidature', 'c2', 'modification', { champ: 'statut', avant: 'en_cours', apres: 'entretien', jour: '2026-10-20', ts: '2026-10-20T08:00:00Z' }),
    ev('candidature', 'c2', 'modification', { champ: 'statut', avant: 'entretien', apres: 'refuse', jour: '2026-11-03', ts: '2026-11-03T08:00:00Z' }),
  ];
  const blocs = rechercheEmploi({ candidatures, echanges, rendez_vous }, offres, evenements, '2026-10-01', '2026-10-31');
  assert.deepEqual(blocs.map(b => b.id), ['c2', 'c6', 'c5', 'c1']);
  const [b2, b6, b5, b1] = blocs;
  // NOTE: numéro écrit dans la candidature : relevé tel quel, et l'offre retrouvée en base complète lieu et contrat
  assert.equal(b5.numero, '215FLRD');
  // NOTE: métier de l'offre liée, sinon déduit de l'intitulé du poste
  assert.deepEqual([b1.metier, b2.metier, b5.metier], ['comptabilite', 'formateur_digital', 'web_design']);
  assert.deepEqual([b6.numero, b6.lieu, b6.contrat], ['9123456', 'Rivière', 'CDD']);
  assert.deepEqual([b1.employeur, b1.poste, b1.numero, b1.plateforme, b1.lieu, b1.contrat, b1.envoi, b1.statut], ['CLIENTABC', 'Comptable unique', 'o1', 'France Travail', 'Villeneuve', 'CDI', 'Formulaire', 'En cours']);
  assert.deepEqual(b1.lignes, [{ date: '2026-10-05', texte: 'Candidature envoyée (formulaire)', resultat: 'En cours', periode: true }]);
  assert.deepEqual(blocs.map(b => [b.anterieure, b.entretien]), [[false, true], [false, false], [false, false], [false, false]]);
  // NOTE: première réponse de c2 : passage à Entretien le 20/10, 8 jours après l'envoi ; un appel envoyé n'est pas une réponse
  assert.deepEqual(blocs.map(b => [b.reponse, b.echanges, b.delai]), [[true, 2, 8], [false, 0, null], [false, 0, null], [false, 0, null]]);
  const stats = statsMetier(blocs);
  assert.deepEqual(stats.map(s => s.metier), ['comptabilite', 'formateur_digital', 'web_design', '']);
  assert.deepEqual(valeursStat(stats[1]), ['1', '1', '100 %', '1', '100 %', '2,0', '8 j']);
  assert.deepEqual(valeursStat(stats[0]), ['2', '0', '0 %', '0', '0 %', '0,0', '-']);
  assert.deepEqual(valeursStat(stats[3]), ['4', '1', '25 %', '1', '25 %', '0,5', '8 j']);
  assert.deepEqual([b2.employeur, b2.poste, b2.numero, b2.plateforme, b2.lieu], ['ProjetX', 'Formateur web', '', 'Glassdoor', '']);
  // NOTE: l'action du 3 novembre (après la période) reste dans son bloc ; le résultat suit l'historique des statuts
  assert.deepEqual(b2.lignes.map(l => [l.date, l.texte, l.resultat]), [
    ['2026-10-12', 'Candidature envoyée (email)', 'En cours'],
    ['2026-10-19', "Appel passé à l'employeur", 'En cours'],
    ['2026-10-20', 'Statut : Entretien', 'Entretien'],
    ['2026-10-24', 'Rendez-vous (visio)', 'Entretien'],
    ['2026-10-25', 'Entretien', 'Entretien'],
    ['2026-11-03', 'Statut : Refusé', 'Refusé'],
  ]);
});

test("rechercheEmploi : une candidature antérieure, écartée ensuite, figure dès qu'elle a une action dans la période ; un entretien vaut résultat Entretien", () => {
  const candidatures = [
    { id: 'c1', entreprise: 'ClientABC', poste: 'Formateur comptabilité', statut: 'ecarte', date: '2026-08-26', plateforme: '', offre_id: null, mode_envoi: '' },
    { id: 'c2', entreprise: 'ClientDEF', poste: 'Comptable', statut: 'en_cours', date: '2026-09-10', plateforme: '', offre_id: null, mode_envoi: '' },
    { id: 'c3', entreprise: 'ClientGHI', poste: 'Comptable', statut: 'ecarte', date: '2026-09-12', plateforme: '', offre_id: null, mode_envoi: '' },
  ];
  const echanges = [
    { id: 'e1', candidature_id: 'c1', date: '2026-10-26', heure: '09:00', canal: 'entretien', sens: 'recu' },
    { id: 'e2', candidature_id: 'c3', date: '2026-10-02', heure: '', canal: 'email', sens: 'envoye' },
  ];
  const evenements = [
    ev('candidature', 'c1', 'modification', { champ: 'statut', avant: 'entretien', apres: 'accepte', jour: '2026-10-27', ts: '2026-10-27T16:00:00Z' }),
    ev('candidature', 'c1', 'modification', { champ: 'statut', avant: 'accepte', apres: 'ecarte', jour: '2026-10-29', ts: '2026-10-29T12:00:00Z' }),
  ];
  // NOTE: c2 n'a aucune action dans la période, c3 n'a jamais été envoyée
  const blocs = rechercheEmploi({ candidatures, echanges }, [], evenements, '2026-10-01', '2026-10-31');
  assert.deepEqual(blocs.map(b => [b.id, b.anterieure, b.entretien]), [['c1', true, true]]);
  assert.deepEqual(blocs[0].lignes.map(l => [l.texte, l.periode]), [['Candidature envoyée', false], ['Entretien', true], ['Statut : Accepté', true], ['Statut : Écarté', true]]);
  assert.equal(blocs[0].lignes[1].resultat, 'Entretien');
});

test('lignesJournal : aucune ligne perdue, phrase lisible ou repli explicite', () => {
  const evenements = [
    ev('candidature', 'c1', 'suppression', { libelle: 'ClientABC' }),
    ev('reglage', 'plateformes_compte', 'modification', { champ: 'valeur', avant: 'a', apres: 'b' }),
    ev('offre', 'o1', 'modification', { champ: 'ignoree', apres: '1', libelle: 'Comptable' }),
    ev('inconnue', 'x', 'creation'),
  ];
  const l = lignesJournal(evenements);
  assert.equal(l.length, evenements.length);
  assert.deepEqual(l.map(x => [x.rubrique, x.action]), [['Candidatures', 'Suppression'], ['Réglages', 'Modification : valeur'], ['Offres', 'Offre écartée'], ['Autres', 'Création']]);
  assert.deepEqual([l[1].avant, l[1].apres], ['a', 'b']);
});

test("phraseEchange : appel, message par plateforme ou autre canal, sans « Téléphone envoyé »", () => {
  assert.equal(phraseEchange('telephone envoye'), "Appel passé à l'employeur");
  assert.equal(phraseEchange('plateforme envoye'), "Message envoyé à l'employeur par la plateforme");
  assert.equal(phraseEchange('autre recu'), "Message reçu de l'employeur");
  assert.equal(phraseEchange('linkedin envoye'), "Message LinkedIn envoyé à l'employeur");
  assert.equal(phraseEchange('email recu'), "Email reçu de l'employeur");
});

test("rechercheEmploi : un « À faire » journalisé avant le passage à En cours ne sort pas en résultat après l'envoi", () => {
  const candidatures = [{ id: 'c1', entreprise: 'ClientABC', poste: 'Formateur IA', statut: 'en_cours', date: '2026-10-28', plateforme: 'Malt', offre_id: null, mode_envoi: 'autre' }];
  const evenements = [
    ev('candidature', 'c1', 'creation', { champ: 'statut', avant: '', apres: 'a_faire', jour: '2026-10-28', ts: '2026-10-28T11:57:00Z' }),
    ev('candidature', 'c1', 'modification', { champ: 'statut', avant: 'a_faire', apres: 'en_cours', jour: '2026-10-29', ts: '2026-10-29T12:25:00Z' }),
  ];
  const echanges = [{ id: 'e1', candidature_id: 'c1', date: '2026-10-28', heure: '', canal: 'plateforme', sens: 'envoye' }];
  const [b] = rechercheEmploi({ candidatures, echanges }, [], evenements, '2026-10-01', '2026-10-31');
  assert.deepEqual(b.lignes.map(l => l.resultat), ['En cours', 'En cours']);
});
