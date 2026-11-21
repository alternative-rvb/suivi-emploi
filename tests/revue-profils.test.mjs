// Tests de non-régression de la revue de code : fichiers du profil par défaut, réglages de score conservés,
// extraction de compétences gardée pour un second profil, cache du marché par profil, auteur du journal. Base temporaire, aucun réseau.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { completerReglages, ecrireReglages, lireReglages } from '../lib/reglages.mjs';
import { ouvrirBase } from '../lib/offres.mjs';
import { purgerCompetencesOrphelines } from '../lib/analyse/competences.mjs';
import { avecProfil, creerProfil, modifierProfil, profilDefaut } from '../lib/profils.mjs';

const temporaire = () => {
  const dossier = mkdtempSync(join(tmpdir(), 'suivi-revue-'));
  const db = ouvrirBase(join(dossier, 'suivi.db'));
  return { db, dossier, fin: () => { db.close(); rmSync(dossier, { recursive: true, force: true }); } };
};

test('profil par défaut : ses fichiers personnels changent de dossier avec lui, le reste de data/ ne bouge pas', () => {
  const t = temporaire();
  try {
    const a = profilDefaut(t.db);
    const b = /** @type {any} */ (creerProfil(t.db, { nom: 'Second' })).id;
    const data = join(t.dossier, 'data');
    mkdirSync(join(data, 'profils', b), { recursive: true });
    mkdirSync(join(data, 'backups'), { recursive: true });
    writeFileSync(join(data, 'signature.png'), 'signature-A');
    writeFileSync(join(data, 'google-agenda.json'), 'jeton-A');
    writeFileSync(join(data, 'backups', 'suivi.db'), 'sauvegarde');
    writeFileSync(join(data, 'profils', b, 'signature.png'), 'signature-B');

    const r = modifierProfil(t.db, b, { defaut: true }, t.dossier);
    assert.equal(r.apres?.defaut, true);
    assert.equal(profilDefaut(t.db), b);
    assert.equal(readFileSync(join(data, 'signature.png'), 'utf8'), 'signature-B', 'le nouveau défaut retrouve sa signature dans data/');
    assert.equal(readFileSync(join(data, 'profils', a, 'signature.png'), 'utf8'), 'signature-A', 'l\'ancien défaut garde la sienne');
    assert.equal(readFileSync(join(data, 'profils', a, 'google-agenda.json'), 'utf8'), 'jeton-A');
    assert.equal(existsSync(join(data, 'google-agenda.json')), false, 'le jeton de l\'ancien défaut n\'est plus servi au nouveau');
    assert.equal(readFileSync(join(data, 'backups', 'suivi.db'), 'utf8'), 'sauvegarde');

    // NOTE: redemander le même profil par défaut ne déplace plus rien
    modifierProfil(t.db, b, { defaut: true }, t.dossier);
    assert.equal(readFileSync(join(data, 'signature.png'), 'utf8'), 'signature-B');
  } finally { t.fin(); }
});

test('réglages : un enregistrement sans les clés de score garde le mode et le malus du profil', () => {
  const t = temporaire();
  try {
    const base = { zones: ['83'], mots_cles: ['comptable'], mots_exclus: [], contrats_exclus: [], entreprises: [] };
    ecrireReglages(t.db, { ...base, mode: 'alternance', malus_contrat: 25, km_tous_contrats: 60 });
    const r = lireReglages(t.db).reglages;
    assert.deepEqual([r.mode, r.malus_contrat, r.km_tous_contrats], ['alternance', 25, 60]);
    const complet = completerReglages(t.db, { ...base, zones: ['13'] });
    assert.deepEqual([complet.mode, complet.malus_contrat, complet.km_tous_contrats], ['alternance', 25, 60]);
    // NOTE: une valeur envoyée prime toujours sur l'enregistré
    assert.equal(completerReglages(t.db, { ...base, mode: 'stage' }).mode, 'stage');
    assert.equal(completerReglages(t.db, null), null);
  } finally { t.fin(); }
});

test('compétences d\'offre : l\'extraction reste tant qu\'une candidature d\'un profil pointe sur l\'offre', () => {
  const t = temporaire();
  try {
    const b = /** @type {any} */ (creerProfil(t.db, { nom: 'Second' })).id;
    t.db.exec('PRAGMA foreign_keys = OFF');
    t.db.prepare("INSERT INTO offre_competences (id_offre, candidature_id, version, hash, provider, modele, date, duree_ms, items) VALUES ('o1', NULL, 1, 'h', 'p', 'm', '2026-11-21', 1, '[]'), ('o2', NULL, 1, 'h', 'p', 'm', '2026-11-21', 1, '[]')").run();
    avecProfil(b, () => t.db.prepare("INSERT INTO candidatures (id, entreprise, poste, statut, offre_id) VALUES ('cb', 'ClientABC', 'Comptable', 'en_cours', 'o1')").run());
    purgerCompetencesOrphelines(t.db);
    const restantes = t.db.prepare('SELECT id_offre FROM offre_competences ORDER BY id_offre').all().map(l => l.id_offre);
    assert.deepEqual(restantes, ['o1'], 'o1 gardée pour la candidature du second profil, o2 purgée');
  } finally { t.fin(); }
});
