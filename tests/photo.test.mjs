// ANCHOR: photo de profil : fichier dans data/, refus des contenus qui ne sont pas des images, reprise facultative dans le PDF du CV
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { enregistrerPhoto, lirePhoto, supprimerPhoto, TAILLE_MAX_PHOTO } from '../lib/photo.mjs';
import { composerCv, validerDocument } from '../lib/cv.mjs';
import { cvPdf } from '../lib/cv-pdf.mjs';

function png() {
  const morceau = (type, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(type), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
    return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const brut = Buffer.concat([0, 1].map(() => Buffer.concat([Buffer.from([0]), Buffer.alloc(12, 0x30)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), morceau('IHDR', ihdr), morceau('IDAT', deflateSync(brut)), morceau('IEND', Buffer.alloc(0))]);
}

const ETAT = { profil: { contact: { nom: 'Camille Exemple', ville: 'Ville', email: 'contact@example.com' } }, competences: [], formations: [], experiences: [], projets: [] };

test('photo : enregistrée, relue, remplacée sans doublon, refusée si ce n\'est pas une image ou trop lourde, supprimée', () => {
  const dir = mkdtempSync(join(tmpdir(), 'photo-'));
  try {
    assert.equal(lirePhoto(dir), null);
    assert.throws(() => enregistrerPhoto(dir, Buffer.from('<svg/>')), /PNG ou JPEG/);
    assert.throws(() => enregistrerPhoto(dir, Buffer.alloc(TAILLE_MAX_PHOTO + 1)), /1 Mo/);
    assert.equal(enregistrerPhoto(dir, png()).type, 'PNG');
    assert.equal(lirePhoto(dir)?.type, 'PNG');
    enregistrerPhoto(dir, png());
    assert.deepEqual(readdirSync(dir), ['photo.png']);
    supprimerPhoto(dir);
    assert.equal(lirePhoto(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cvPdf : la photo n\'entre dans le PDF que si le document la demande', async () => {
  const photo = { octets: png(), type: /** @type {'PNG'} */ ('PNG') };
  const base = composerCv(ETAT);
  assert.equal(validerDocument(base).photo, false);
  const sans = await cvPdf(validerDocument(base), { photo });
  const sansFichier = await cvPdf(validerDocument({ ...base, photo: true }));
  const avec = await cvPdf(validerDocument({ ...base, photo: true }), { photo });
  assert.equal(Buffer.from(avec.subarray(0, 5)).toString(), '%PDF-');
  assert.ok(avec.length > sans.length, 'la photo alourdit le PDF');
  assert.ok(Math.abs(sansFichier.length - sans.length) < 200, 'sans fichier de photo, le PDF reste celui sans photo');
});
