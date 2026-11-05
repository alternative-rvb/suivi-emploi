// Tests du contrôle qualité des fiches contact (ligne 138). Données fictives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { avertissementsContact, aCompleter } from '../client/src/contacts.ts';

const base = { id: 'k', prenom: 'Camille', nom: 'Test', fonction: 'RH', entreprise: 'ClientABC', adresse: '', telephone: '0400000000', email: 'contact@example.com', note: '', cree: '2026-10-23', couleur: '', epingle: false, sans_telephone: false, sans_email: false, offres: ['o1'], candidatures: [] };
const messages = k => avertissementsContact(k).map(x => x.message);

test('fiche complète : aucune alerte', () => {
  assert.deepEqual(avertissementsContact(base), []);
  assert.equal(aCompleter(base), false);
});

test('ni email ni téléphone, format invalide, nom incomplet : avertissements', () => {
  assert.ok(messages({ ...base, email: '', telephone: '' }).some(m => /Ni email ni téléphone/.test(m)));
  assert.ok(messages({ ...base, email: 'pas-un-mail' }).includes('Adresse email invalide.'));
  assert.ok(messages({ ...base, telephone: 'abc' }).includes('Numéro de téléphone invalide.'));
  assert.ok(messages({ ...base, nom: '' }).includes('Nom de famille absent.'));
  assert.ok(messages({ ...base, prenom: '' }).includes('Prénom absent.'));
  assert.ok(messages({ ...base, prenom: '', nom: 'Nouveau contact' }).includes('Nom par défaut à remplacer.'));
  assert.equal(aCompleter({ ...base, email: '' }), false, 'le téléphone suffit pour le joindre');
  const sans = { ...base, email: '', telephone: '' };
  assert.equal(aCompleter(sans), true);
  assert.equal(aCompleter({ ...sans, sans_telephone: true }), true, 'une seule case ne suffit pas');
  assert.equal(aCompleter({ ...sans, sans_telephone: true, sans_email: true }), false, 'les deux cases : alerte levée');
});

test('fonction, société et liens manquants : info seulement, fiche non marquée à compléter', () => {
  const k = { ...base, fonction: '', entreprise: '', offres: [] };
  assert.equal(avertissementsContact(k).length, 3);
  assert.ok(avertissementsContact(k).every(x => x.niveau === 'info'));
  assert.equal(aCompleter(k), false);
});
