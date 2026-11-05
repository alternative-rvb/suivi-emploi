// Tests des rendez-vous (ligne 121) : validation, envoi vers Google, reprise des changements faits dans Google, rattachement, annulation, panne.
// Serveur réel sur copie temporaire, branché sur un faux Google à état (AGENDA_URL_TEST). Données fictives uniquement (ClientABC, example.com).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCOPES, heureParis } from '../lib/agenda/google.mjs';
import { serveurTemporaire } from './serveur-temporaire.mjs';

const ENV = { GOOGLE_CLIENT_ID: 'id-fictif.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret-fictif' };

test('heureParis : heure murale de Paris, été comme hiver', () => {
  assert.equal(heureParis('2026-10-23T17:00:00+02:00'), '2026-10-23T17:00');
  assert.equal(heureParis('2026-10-28T16:00:00+01:00'), '2026-10-28T16:00');
  assert.equal(heureParis('2026-10-28T15:00:00Z'), '2026-10-28T16:00');
  assert.equal(heureParis('2026-10-25T23:30:00Z'), '2026-10-26T00:30');
});

// ANCHOR: faux Google à état : événements en mémoire, création, modification partielle, suppression, panne à la demande (reseau ou http)
async function fauxGoogle() {
  const etat = { events: new Map(), panne: '', n: 0, appels: /** @type {{ methode: string, chemin: string, corps: any }[]} */ ([]) };
  const serveur = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const envoyer = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(o === undefined ? undefined : JSON.stringify(o)); };
    let brut = '';
    for await (const m of req) brut += m;
    // NOTE: /token et /revoke reçoivent un formulaire, les événements du JSON
    const corps = brut && (req.headers['content-type'] ?? '').includes('json') ? JSON.parse(brut) : null;
    if (u.pathname === '/token') return envoyer(200, { access_token: 'acces', expires_in: 3600, refresh_token: 'rafraichir', scope: SCOPES.join(' ') });
    if (u.pathname === '/revoke') return envoyer(200, {});
    if (u.pathname === '/calendar/v3/users/me/calendarList') return envoyer(200, { items: [{ id: 'cal-2', summary: 'Recherche' }] });
    const m = u.pathname.match(/^\/calendar\/v3\/calendars\/cal-2\/events(?:\/([^/]+))?$/);
    if (!m) return envoyer(404, { error: { message: 'inconnu' } });
    etat.appels.push({ methode: req.method ?? '', chemin: u.pathname, corps });
    if (etat.panne === 'reseau') return req.socket.destroy();
    if (etat.panne === 'http') return envoyer(500, { error: { message: 'panne' } });
    const id = m[1];
    if (!id && req.method === 'GET') return envoyer(200, { items: [...etat.events.values()].filter(e => e.status !== 'cancelled') });
    if (!id && req.method === 'POST') {
      const e = { ...corps, id: 'g' + ++etat.n, status: 'confirmed', htmlLink: 'https://calendar.example.com/e' };
      etat.events.set(e.id, e);
      return envoyer(200, e);
    }
    const e = etat.events.get(id);
    if (!e) return envoyer(404, { error: { message: 'introuvable' } });
    if (req.method === 'GET') return envoyer(200, e);
    if (req.method === 'PATCH') {
      const prive = { ...e.extendedProperties?.private, ...corps.extendedProperties?.private };
      Object.assign(e, corps, { extendedProperties: { private: prive } });
      return envoyer(200, e);
    }
    if (req.method === 'DELETE') { etat.events.delete(id); return envoyer(204); }
    return envoyer(405, {});
  });
  await new Promise(ok => serveur.listen(0, '127.0.0.1', () => ok(null)));
  // @ts-ignore adresse d'un serveur TCP
  return { url: `http://127.0.0.1:${serveur.address().port}`, serveur, etat };
}

test('rendez-vous : validation, envoi, reprise de Google, rattachement, annulation, panne, suppression', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'suivi-rdv-'));
  const google = await fauxGoogle();
  const { url, proc, port } = await serveurTemporaire(dir, { ...ENV, AGENDA_URL_TEST: google.url });
  try {
    const appel = (chemin, methode = 'GET', corps = undefined) => fetch(url + chemin, { method: methode, redirect: 'manual', headers: { 'Content-Type': 'application/json' }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const lire = async (chemin, methode = 'GET', corps = undefined) => (await appel(chemin, methode, corps)).json();
    const evenements = () => lire('/api/agenda/evenements?du=2026-10-23&au=2026-11-30&frais=1');

    const offre = await lire('/api/offres', 'POST', { titre: 'Comptable', entreprise: 'ClientABC' });
    const contact = await lire('/api/contacts', 'POST', { prenom: 'Camille', nom: 'Durand', fonction: 'RH', telephone: '0600000000' });
    const cand = await lire('/api/candidatures', 'POST', { entreprise: 'ClientABC', poste: 'Comptable', offre_id: offre.id_offre ?? offre.id });
    const offreId = offre.id_offre ?? offre.id;

    // NOTE: agenda non connecté : le RDV est enregistré en local et attend l'envoi
    const local = await appel('/api/rendez_vous', 'POST', { debut: '2026-10-27T10:00', duree: 30, type: 'telephone', candidature_id: cand.id });
    assert.equal(local.status, 201);
    const premier = await local.json();
    assert.equal(premier.synchro, 'a_envoyer');
    assert.equal(premier.google_id, null);
    assert.equal(premier.titre, 'Entretien, ClientABC, Comptable');
    assert.equal((await lire('/api/state')).rendez_vous.length, 1);

    // ANCHOR: validations
    assert.equal((await appel('/api/rendez_vous', 'POST', { debut: '2026-13-27T10:00' })).status, 400);
    assert.equal((await appel('/api/rendez_vous', 'POST', { debut: '2026-10-27' })).status, 400);
    assert.equal((await appel('/api/rendez_vous', 'POST', { debut: '2026-10-27T10:00', duree: 2 })).status, 400);
    assert.equal((await appel('/api/rendez_vous', 'POST', { debut: '2026-10-27T10:00', type: 'pigeon' })).status, 400);
    assert.equal((await appel('/api/rendez_vous', 'POST', { debut: '2026-10-27T10:00', lien_visio: 'javascript:alert(1)' })).status, 400);
    assert.equal((await appel('/api/rendez_vous', 'POST', { debut: '2026-10-27T10:00', google_id: 'x' })).status, 400);
    assert.equal((await appel('/api/rendez_vous', 'POST', { debut: '2026-10-27T10:00', synchro: 'ok' })).status, 400);
    assert.equal((await appel('/api/rendez_vous', 'POST', { debut: '2026-10-27T10:00', contact_id: 'k-inconnu' })).status, 400);
    assert.equal((await appel('/api/rendez_vous', 'POST', { debut: '2026-10-27T10:00', offre_id: 'inconnue' })).status, 400);
    assert.equal((await appel('/api/rendez_vous', 'POST', { debut: '2026-10-27T10:00', candidature_id: 'inconnue' })).status, 400);
    assert.equal((await appel('/api/rendez_vous/r-inconnu', 'PATCH', { duree: 30 })).status, 404);

    // Connexion à Google et choix du calendrier
    const r1 = await appel('/api/agenda/connexion');
    const state = new URL(r1.headers.get('location') ?? '').searchParams.get('state');
    await appel(`/api/agenda/retour?state=${state}&code=code-1`);
    assert.equal((await appel('/api/agenda', 'PUT', { calendrier_id: 'cal-2' })).status, 200);

    // Le RDV resté à envoyer part à la prochaine lecture des événements
    await evenements();
    const envoye = await lire(`/api/rendez_vous/${premier.id}`);
    assert.equal(envoye.synchro, 'ok');
    assert.match(envoye.google_id, /^g\d+$/);

    // ANCHOR: création envoyée avec contact, note et marque de suivi
    const rdv = await lire('/api/rendez_vous', 'POST', {
      titre: 'Entretien RH', debut: '2026-10-28T14:30', duree: 45, type: 'visio', lien_visio: 'https://visio.example.com/abc', lieu: 'Villeneuve',
      note: 'Apporter le CV', offre_id: offreId, candidature_id: cand.id, contact_id: contact.id,
    });
    assert.equal(rdv.synchro, 'ok');
    const cree = google.etat.events.get(rdv.google_id);
    assert.equal(cree.summary, 'Entretien RH');
    assert.equal(cree.start.dateTime, '2026-10-28T14:30:00');
    assert.equal(cree.end.dateTime, '2026-10-28T15:15:00');
    assert.equal(cree.start.timeZone, 'Europe/Paris');
    assert.equal(cree.extendedProperties.private.suivi, rdv.id);
    assert.match(cree.description, /Apporter le CV/);
    assert.match(cree.description, /Visio : https:\/\/visio\.example\.com\/abc/);
    assert.match(cree.description, /Contact : Camille Durand, RH, 0600000000/);

    // Modification locale : PATCH vers Google
    const modifie = await lire(`/api/rendez_vous/${rdv.id}`, 'PATCH', { duree: 60, lieu: 'Rivière' });
    assert.equal(modifie.synchro, 'ok');
    assert.equal(google.etat.events.get(rdv.google_id).location, 'Rivière');
    assert.equal(google.etat.events.get(rdv.google_id).end.dateTime, '2026-10-28T15:30:00');

    // ANCHOR: déplacé dans Google : la nouvelle heure est reprise et journalisée
    Object.assign(google.etat.events.get(rdv.google_id), { start: { dateTime: '2026-10-29T16:00:00+01:00' }, end: { dateTime: '2026-10-29T17:30:00+01:00' } });
    const liste = await evenements();
    const rattache = liste.evenements.find(e => e.id === rdv.google_id);
    assert.equal(rattache.rdv, rdv.id);
    const repris = await lire(`/api/rendez_vous/${rdv.id}`);
    assert.equal(repris.debut, '2026-10-29T16:00');
    assert.equal(repris.duree, 90);
    const journal = await lire('/api/journal?entite=rendez_vous');
    assert.ok(journal.some(j => j.entite === 'rendez_vous' && j.entite_id === rdv.id && j.champ === 'debut' && j.apres === '2026-10-29T16:00'));

    // ANCHOR: événement créé directement dans Google : externe, puis rattaché (marque de suivi ajoutée côté Google)
    google.etat.events.set('ext1', { id: 'ext1', status: 'confirmed', summary: 'Appel ProjetX', start: { dateTime: '2026-10-30T11:00:00+01:00' }, end: { dateTime: '2026-10-30T11:30:00+01:00' }, hangoutLink: 'https://meet.example.com/xyz' });
    const externe = (await evenements()).evenements.find(e => e.id === 'ext1');
    assert.equal(externe.rdv, null);
    assert.equal((await appel('/api/rendez_vous/rattacher', 'POST', {})).status, 400);
    assert.equal((await appel('/api/rendez_vous/rattacher', 'POST', { google_id: 'ext1', contact_id: 'k-inconnu' })).status, 400);
    const rattachement = await appel('/api/rendez_vous/rattacher', 'POST', { google_id: 'ext1', contact_id: contact.id, offre_id: offreId });
    assert.equal(rattachement.status, 201);
    const rattachee = await rattachement.json();
    assert.equal(rattachee.titre, 'Appel ProjetX');
    assert.equal(rattachee.debut, '2026-10-30T11:00');
    assert.equal(rattachee.duree, 30);
    assert.equal(rattachee.type, 'visio');
    assert.equal(rattachee.synchro, 'ok');
    assert.equal(google.etat.events.get('ext1').extendedProperties.private.suivi, rattachee.id);
    assert.equal((await appel('/api/rendez_vous/rattacher', 'POST', { google_id: 'ext1' })).status, 409);
    assert.equal((await evenements()).evenements.find(e => e.id === 'ext1').rdv, rattachee.id);

    // ANCHOR: supprimé dans Google : le RDV passe en annulé, il n'est pas supprimé localement
    google.etat.events.delete(rattachee.google_id);
    await evenements();
    assert.equal((await lire(`/api/rendez_vous/${rattachee.id}`)).synchro, 'annule');
    // Modifier un RDV annulé le recrée dans Google
    const recree = await lire(`/api/rendez_vous/${rattachee.id}`, 'PATCH', { note: 'Rappeler' });
    assert.equal(recree.synchro, 'ok');
    assert.notEqual(recree.google_id, 'ext1');
    assert.ok(google.etat.events.has(recree.google_id));

    // ANCHOR: pannes : réseau = à renvoyer, refus de Google = erreur, nouvel essai à la lecture suivante
    google.etat.panne = 'reseau';
    const hors = await lire('/api/rendez_vous', 'POST', { titre: 'Hors ligne', debut: '2026-11-03T09:00' });
    assert.equal(hors.synchro, 'a_envoyer');
    google.etat.panne = 'http';
    const refus = await lire('/api/rendez_vous', 'POST', { titre: 'Refusé', debut: '2026-11-04T09:00' });
    assert.equal(refus.synchro, 'erreur');
    google.etat.panne = '';
    await evenements();
    assert.equal((await lire(`/api/rendez_vous/${hors.id}`)).synchro, 'ok');
    assert.equal((await lire(`/api/rendez_vous/${refus.id}`)).synchro, 'erreur');

    // ANCHOR: suppression : Google d'abord, le RDV local reste si Google échoue
    google.etat.panne = 'http';
    assert.equal((await appel(`/api/rendez_vous/${hors.id}`, 'DELETE')).status, 502);
    assert.equal((await appel(`/api/rendez_vous/${hors.id}`)).status, 200);
    google.etat.panne = '';
    const gid = (await lire(`/api/rendez_vous/${hors.id}`)).google_id;
    assert.equal((await appel(`/api/rendez_vous/${hors.id}`, 'DELETE')).status, 200);
    assert.equal(google.etat.events.has(gid), false);
    assert.equal((await appel(`/api/rendez_vous/${hors.id}`)).status, 404);
    assert.equal((await appel(`/api/rendez_vous/${hors.id}`, 'DELETE')).status, 404);
    // ?local=1 : suppression ici seulement, l'événement Google reste
    const gidRefus = (await lire(`/api/rendez_vous/${refus.id}`)).google_id;
    assert.equal(gidRefus, null);
    assert.equal((await appel(`/api/rendez_vous/${refus.id}?local=1`, 'DELETE')).status, 200);

    // ANCHOR: liens : la suppression d'une candidature ou d'un contact garde le RDV, lien mis à vide
    assert.equal((await appel(`/api/candidatures/${cand.id}`, 'DELETE')).status, 200);
    assert.equal((await appel(`/api/contacts/${contact.id}`, 'DELETE')).status, 200);
    const apres = await lire(`/api/rendez_vous/${rdv.id}`);
    assert.equal(apres.candidature_id, null);
    assert.equal(apres.contact_id, null);
    assert.equal(apres.offre_id, offreId);
    const creations = (await lire('/api/journal?entite=rendez_vous')).filter(j => j.action === 'creation');
    assert.ok(creations.length >= 4);
    assert.ok(port > 0);
  } finally {
    proc.kill();
    google.serveur.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
