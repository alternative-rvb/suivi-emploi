// Tests du serveur (ligne 97) : corps de requête UTF-8, URL mal encodée, profil envoyé en partie, CRUD des candidatures et des offres manuelles, sauvegarde et index.
// Le serveur est lancé sur une copie dans un dossier temporaire, sans .env (aucun appel réseau).
import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { serveurTemporaire } from './serveur-temporaire.mjs';
import { ouvrirBase } from '../lib/offres.mjs';
import { jourLocal } from '../lib/journal.mjs';
import { sauvegardeDuJour } from '../lib/sync.mjs';

const dossierTemp = () => mkdtempSync(join(tmpdir(), 'suivi-serveur-'));

// ANCHOR: envoie le corps en plusieurs morceaux, découpés au milieu d'un caractère accentué
const envoyerEnMorceaux = (url, chemin, morceaux) => new Promise((ok, ko) => {
  const { hostname, port } = new URL(url);
  const req = request({ hostname, port, path: chemin, method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, res => {
    let t = '';
    res.setEncoding('utf8');
    res.on('data', c => { t += c; });
    res.on('end', () => ok({ status: res.statusCode, data: JSON.parse(t) }));
  });
  req.on('error', ko);
  (async () => {
    for (const m of morceaux) { req.write(m); await new Promise(r => setTimeout(r, 20)); }
    req.end();
  })();
});

test('routes : corps UTF-8 coupé, URL mal encodée, profil partiel, CRUD candidatures et offres manuelles journalisés', async () => {
  const dir = dossierTemp();
  const { url, proc } = await serveurTemporaire(dir);
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(url + chemin, { method: methode, headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { status: r.status, data: await r.json() };
  };
  try {
    const octets = Buffer.from(JSON.stringify({ id: 'utf8', entreprise: 'Société Générale à Rivière', poste: 'Comptable unique' }));
    const coupe = octets.indexOf(Buffer.from('é')) + 1;
    const r = await envoyerEnMorceaux(url, '/api/candidatures', [octets.subarray(0, coupe), octets.subarray(coupe)]);
    assert.equal(r.status, 201);
    assert.equal(r.data.entreprise, 'Société Générale à Rivière');
    assert.equal(r.data.date, jourLocal(new Date()));

    assert.equal((await appel('GET', '/api/candidatures/%E0%A4%A')).status, 400);
    assert.equal((await appel('POST', '/api/candidatures', { id: 'utf8', entreprise: 'X', poste: 'Y' })).status, 409);
    assert.equal((await appel('POST', '/api/candidatures', { entreprise: 'X' })).status, 400);
    assert.equal((await appel('POST', '/api/candidatures', { entreprise: 'X', poste: 'Y', statut: 'inconnu' })).status, 400);
    // NOTE: consultation journalisée une fois par jour, statut initial journalisé avec la création
    assert.equal((await appel('POST', '/api/candidatures/utf8/vue')).data.deja, false);
    assert.equal((await appel('POST', '/api/candidatures/utf8/vue')).data.deja, true);
    assert.equal((await appel('POST', '/api/candidatures/absente/vue')).status, 404);
    assert.equal((await appel('GET', '/api/candidatures/utf8/vue')).status, 405);
    const ev = (await appel('GET', '/api/journal?entite=candidature&id=utf8')).data;
    assert.equal(ev.filter(e => e.action === 'consultation').length, 1);
    assert.ok(ev.some(e => e.action === 'creation' && e.champ === 'statut'));
    assert.equal((await appel('PATCH', '/api/candidatures/utf8', { statut: 'entretien' })).data.statut, 'entretien');
    assert.equal((await appel('GET', '/api/candidatures/utf8')).data.poste, 'Comptable unique');
    assert.equal((await appel('PATCH', '/api/candidatures/absente', { statut: 'entretien' })).status, 404);
    assert.equal((await appel('DELETE', '/api/candidatures/utf8')).status, 200);
    assert.equal((await appel('GET', '/api/candidatures/utf8')).status, 404);
    assert.equal((await appel('PUT', '/api/candidatures')).status, 405);

    // NOTE: un envoi partiel du profil ne vide plus les champs absents
    assert.equal((await appel('PUT', '/api/state', { profil: { accroche: 'Accroche', contact: { nom: 'ProjetX', ville: 'Villeneuve' } } })).status, 200);
    assert.equal((await appel('PUT', '/api/state', { profil: { resume: 'Résumé', contact: { ville: 'Rivière' } } })).status, 200);
    const profil = (await appel('GET', '/api/state')).data.profil;
    assert.equal(profil.accroche, 'Accroche');
    assert.equal(profil.resume, 'Résumé');
    assert.equal(profil.contact.nom, 'ProjetX');
    assert.equal(profil.contact.ville, 'Rivière');

    const o = await appel('POST', '/api/offres', { titre: 'Comptable fournisseurs', entreprise: 'ClientABC', ville: 'Villeneuve' });
    assert.equal(o.status, 201);
    assert.match(o.data.id_offre, /^man-/);
    assert.equal((await appel('PATCH', `/api/offres/${o.data.id_offre}`, { salaire: '30 k€' })).data.salaire, '30 k€');
    assert.equal((await appel('POST', '/api/offres', { titre: 'X', lien: 'javascript:alert(1)' })).status, 400);
    assert.equal((await appel('DELETE', `/api/offres/${o.data.id_offre}`)).status, 200);
    assert.equal((await appel('GET', `/api/offres/${o.data.id_offre}`)).status, 404);

    const journal = (await appel('GET', '/api/journal')).data;
    for (const [entite, action] of [['candidature', 'creation'], ['candidature', 'modification'], ['candidature', 'suppression'], ['offre', 'creation'], ['offre', 'modification'], ['offre', 'suppression']]) {
      assert.ok(journal.some(e => e.entite === entite && e.action === action), `${entite} ${action} journalisée`);
    }
  } finally {
    proc.kill();
    await new Promise(r => proc.once('exit', r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('base : index des offres et des candidatures, sauvegarde du jour cohérente par VACUUM INTO, une seule par jour', () => {
  const dir = dossierTemp();
  try {
    const db = ouvrirBase(join(dir, 'suivi.db'));
    const index = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(r => r.name);
    assert.ok(index.includes('offres_date') && index.includes('candidatures_offre'));
    db.prepare("INSERT INTO candidatures (id, entreprise, poste) VALUES ('c1', 'ClientABC', 'Comptable')").run();
    sauvegardeDuJour(dir, db);
    const copie = join(dir, 'data', 'backups', `suivi-${jourLocal(new Date())}.db`);
    assert.ok(existsSync(copie));
    const lu = new DatabaseSync(copie, { readOnly: true });
    assert.equal(lu.prepare('SELECT COUNT(*) n FROM candidatures').get()?.n, 1);
    lu.close();
    db.prepare("INSERT INTO candidatures (id, entreprise, poste) VALUES ('c2', 'ClientABC', 'Comptable')").run();
    sauvegardeDuJour(dir, db);
    const relu = new DatabaseSync(copie, { readOnly: true });
    assert.equal(relu.prepare('SELECT COUNT(*) n FROM candidatures').get()?.n, 1);
    relu.close();
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
