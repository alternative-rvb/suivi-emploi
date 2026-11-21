// Tests des profils (schéma v31) : chaque profil ne voit que ses données, liaisons croisées refusées, routes sans préfixe = profil par défaut, suppression en cascade.
// Serveur réel sur une base temporaire, aucun réseau.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { brancherProfils } from '../lib/profils.mjs';
import { serveurTemporaire } from './serveur-temporaire.mjs';

const ids = liste => (Array.isArray(liste) ? liste : liste.candidatures ?? liste.items ?? []).map(x => x.id);

test('profils : isolation des routes, liaisons croisées refusées, suppression en cascade', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-profils-'));
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  let b = '';
  try {
    // ANCHOR: base neuve : un seul profil, le profil par défaut
    const depart = (await appel('GET', '/api/profils')).data;
    assert.equal(depart.profils.length, 1);
    const a = depart.actif;
    assert.equal(depart.profils[0].defaut, true);

    assert.equal((await appel('POST', '/api/profils', { nom: '' })).status, 400);
    assert.equal((await appel('POST', '/api/profils', { nom: 'X', inconnu: 1 })).status, 400);
    const cree = await appel('POST', '/api/profils', { nom: ' Étudiant ', couleur: 'vert' });
    assert.equal(cree.status, 201);
    b = cree.data.id;
    assert.match(b, /^p-[0-9a-f]{8}$/);
    assert.equal(cree.data.nom, 'Étudiant');
    assert.equal(cree.data.defaut, false);
    const B = `/api/p/${b}`;
    assert.equal((await appel('GET', `${B}/profils`)).data.actif, b);

    // NOTE: profil inconnu ou mal formé : 404 avec un code dédié, rien n'est exécuté
    for (const x of ['p-00000000', 'nimporte']) {
      const r = await appel('GET', `/api/p/${x}/state`);
      assert.equal(r.status, 404);
      assert.equal(r.data.code, 'profil');
    }

    // ANCHOR: candidatures : chaque profil ne voit que les siennes, l'autre profil reçoit 404
    const ca = (await appel('POST', '/api/candidatures', { entreprise: 'ClientABC', poste: 'Comptable' })).data;
    const cb = (await appel('POST', `${B}/candidatures`, { entreprise: 'ProjetX', poste: 'Alternant développeur' })).data;
    assert.ok(ca.id && cb.id && ca.id !== cb.id);
    assert.deepEqual(ids((await appel('GET', '/api/candidatures')).data), [ca.id]);
    assert.deepEqual(ids((await appel('GET', `/api/p/${a}/candidatures`)).data), [ca.id]);
    assert.deepEqual(ids((await appel('GET', `${B}/candidatures`)).data), [cb.id]);
    assert.equal((await appel('GET', `${B}/candidatures/${ca.id}`)).status, 404);
    assert.equal((await appel('PATCH', `${B}/candidatures/${ca.id}`, { notes: 'x' })).status, 404);
    assert.equal((await appel('DELETE', `${B}/candidatures/${ca.id}`)).status, 404);
    assert.equal((await appel('GET', `/api/candidatures/${ca.id}`)).status, 200);
    assert.deepEqual((await appel('GET', `${B}/state`)).data.candidatures.map(c => c.id), [cb.id]);

    // ANCHOR: liaison vers une candidature d'un autre profil refusée (tâche, échange, contact)
    assert.equal((await appel('POST', `${B}/taches`, { titre: 'Relancer', candidature_id: ca.id })).status, 400);
    assert.equal((await appel('POST', `${B}/echanges`, { candidature_id: ca.id, canal: 'email', sens: 'envoye' })).status, 400);
    assert.equal((await appel('POST', `${B}/contacts`, { prenom: 'Camille', candidatures: [ca.id] })).status, 400);
    // NOTE: témoins : les mêmes corps passent avec la candidature du profil, le refus vient donc bien du contrôle de profil
    assert.equal((await appel('POST', `${B}/echanges`, { candidature_id: cb.id, canal: 'email', sens: 'envoye' })).status, 201);
    assert.equal((await appel('POST', `${B}/contacts`, { prenom: 'Camille', candidatures: [cb.id] })).status, 201);
    const tb = await appel('POST', `${B}/taches`, { titre: 'Relancer', candidature_id: cb.id });
    assert.equal(tb.status, 201);
    assert.equal((await appel('GET', `/api/taches/${tb.data.id}`)).status, 404);
    assert.equal((await appel('DELETE', `/api/taches/${tb.data.id}`)).status, 404);

    // ANCHOR: parcours et réglages propres au profil
    const kb = await appel('POST', `${B}/competences`, { domaine: 'Web', competence: 'React' });
    assert.equal(kb.status, 201);
    assert.ok(!(await appel('GET', '/api/competences')).data.some(k => k.id === kb.data.id));
    assert.ok((await appel('GET', `${B}/competences`)).data.some(k => k.id === kb.data.id));
    assert.equal((await appel('DELETE', `/api/competences/${kb.data.id}`)).status, 404);

    const reglages = { zones: ['13'], mots_cles: ['alternance développeur'], mots_exclus: [], contrats_exclus: [], entreprises: [], mode: 'alternance' };
    assert.equal((await appel('PUT', `${B}/reglages`, reglages)).status, 200);
    const rb = (await appel('GET', `${B}/reglages`)).data;
    assert.equal(rb.origine, 'app');
    assert.equal(rb.reglages.mode, 'alternance');
    const ra = (await appel('GET', '/api/reglages')).data;
    assert.notEqual(ra.origine, 'app');
    assert.equal(ra.reglages.mode, 'emploi');

    // ANCHOR: offres partagées (v32) : une offre saisie n'existe que pour son profil, l'état (vue, écartée, note) est propre à chaque profil
    const oa = (await appel('POST', '/api/offres', { titre: 'Comptable', departement: '13', ville: 'Ville A' })).data;
    assert.match(oa.id_offre, /^man-/);
    assert.deepEqual((await appel('GET', `${B}/offres`)).data, []);
    assert.equal((await appel('PATCH', `${B}/offres/${oa.id_offre}`, { vue: true })).status, 404);
    assert.equal((await appel('POST', `${B}/candidatures`, { entreprise: 'X', poste: 'Y', offre_id: oa.id_offre })).status, 400);
    {
      const brute = new DatabaseSync(join(dir, 'suivi.db'));
      brancherProfils(brute);
      brute.prepare('INSERT INTO offre_suivis (profil_id, id_offre) VALUES (?, ?)').run(b, oa.id_offre);
      brute.close();
    }
    const vueB = (await appel('PATCH', `${B}/offres/${oa.id_offre}`, { vue: true, ignoree: true, description: 'Note B' })).data;
    assert.equal(vueB.vue, 1);
    assert.equal(vueB.description, 'Note B');
    const vueA = (await appel('GET', `/api/offres/${oa.id_offre}`)).data;
    assert.equal(vueA.vue, 0);
    assert.equal(vueA.ignoree, 0);
    assert.equal(vueA.description, '');

    // ANCHOR: zone de recherche propre au profil : validée, enregistrée, « proche » recalculée pour ce profil seulement
    assert.equal((await appel('PUT', `${B}/zone`, { departement_proche: 'xx' })).status, 400);
    const zb = await appel('PUT', `${B}/zone`, { departement_proche: '13', villes_proches: ['Ville A'], origines: ['43.3,5.4'], departements_distance: [], lieu_bonus: '' });
    assert.equal(zb.status, 200);
    assert.equal(zb.data.proches_modifiees, 1);
    assert.equal(zb.data.origines.length, 1);
    assert.equal((await appel('GET', `${B}/offres/${oa.id_offre}`)).data.proche, 1);
    assert.equal((await appel('GET', `/api/offres/${oa.id_offre}`)).data.proche, 0);
    assert.deepEqual((await appel('GET', '/api/zone')).data.reglage.villes_proches, []);

    // ANCHOR: suppression : jamais le profil par défaut, cascade sur toutes les données du profil supprimé
    assert.equal((await appel('DELETE', `/api/profils/${a}`)).status, 400);
    assert.equal((await appel('DELETE', '/api/profils/p-00000000')).status, 404);
    assert.equal((await appel('DELETE', `/api/profils/${b}`)).status, 200);
    assert.equal((await appel('GET', `${B}/state`)).status, 404);
    assert.deepEqual(ids((await appel('GET', '/api/candidatures')).data), [ca.id]);
  } finally {
    proc.kill();
    await new Promise(r => setTimeout(r, 100));
  }
  try {
    const base = new DatabaseSync(join(dir, 'suivi.db'), { readOnly: true });
    for (const t of ['candidatures', 'taches', 'competences', 'profil_reglages', 'journal']) {
      assert.equal(base.prepare(`SELECT COUNT(*) n FROM ${t} WHERE profil_id = ?`).get(b)?.n, 0, t);
    }
    assert.equal(base.prepare('SELECT COUNT(*) n FROM candidatures').get()?.n, 1);
    assert.deepEqual(base.prepare('PRAGMA foreign_key_check').all(), []);
    base.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
