// ANCHOR: lettre au format Word (.docx) sans dépendance : quelques fichiers XML (WordprocessingML) zippés à la main avec zlib de Node.
// Mise en page volontairement simple (Calibri 11, une colonne) : c'est une trace modifiable dans Word, le PDF reste l'envoi soigné.
import { crc32, deflateRawSync } from 'node:zlib';
import { lignesEntete, paragraphesDe } from './lettre.mjs';

// --- Archive ZIP (méthode deflate, sans chiffrement ni ZIP64) ---

/** @param {{ nom: string, donnees: Uint8Array | string }[]} fichiers @returns {Buffer} */
export function zip(fichiers) {
  const locaux = [];
  const centraux = [];
  let decalage = 0;
  // NOTE: date fixe (1er janvier 2020) : une même lettre donne toujours la même archive
  const heure = 0;
  const date = ((2020 - 1980) << 9) | (1 << 5) | 1;
  for (const f of fichiers) {
    const nom = Buffer.from(f.nom, 'utf8');
    const brut = Buffer.isBuffer(f.donnees) ? f.donnees : Buffer.from(f.donnees);
    const compresse = deflateRawSync(brut);
    const crc = crc32(brut);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(heure, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compresse.length, 18); local.writeUInt32LE(brut.length, 22); local.writeUInt16LE(nom.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(heure, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compresse.length, 20); central.writeUInt32LE(brut.length, 24); central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    locaux.push(local, nom, compresse);
    centraux.push(central, nom);
    decalage += local.length + nom.length + compresse.length;
  }
  const tailleCentral = centraux.reduce((s, b) => s + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(fichiers.length, 8); fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(tailleCentral, 12); fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, ...centraux, fin]);
}

// --- Document Word ---

const xml = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
// NOTE: un paragraphe Word par ligne de bloc, sauts de ligne internes rendus par <w:br/>
const run = (texte, { gras = false, couleur = '', taille = 0 } = {}) => {
  const props = [gras && '<w:b/>', couleur && `<w:color w:val="${couleur}"/>`, taille && `<w:sz w:val="${taille}"/>`].filter(Boolean).join('');
  return String(texte).split('\n').map((l, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(l)}</w:t></w:r>`).join('');
};
const para = (contenu, { droite = false, apres = 0, retrait = 0 } = {}) => `<w:p><w:pPr>${apres ? `<w:spacing w:after="${apres}"/>` : ''}${retrait ? `<w:ind w:left="${retrait}"/>` : ''}${droite ? '<w:jc w:val="right"/>' : ''}</w:pPr>${contenu}</w:p>`;
const EMU_MM = 36000;

/**
 * @param {ReturnType<typeof import('./lettre.mjs').validerLettre>} doc
 * @param {{ signature?: { octets: Uint8Array, type: 'PNG' | 'JPEG', largeur: number, hauteur: number } | null }} [options]  largeur et hauteur en pixels
 * @returns {Buffer}
 */
export function lettreDocx(doc, { signature = null } = {}) {
  const e = doc.entete;
  const corps = [
    // NOTE: entête conventionnelle : coordonnées en noir, une par ligne, sans titre ni site
    para(run(lignesEntete(e).join('\n')), { apres: 360 }),
    doc.destinataire && para(run(doc.destinataire), { droite: true, apres: 240 }),
    doc.lieu_date && para(run(doc.lieu_date), { droite: true, apres: 360 }),
    doc.objet && para(run('Objet : ', { gras: true }) + run(doc.objet, { gras: true }), { apres: 240 }),
    ...paragraphesDe(doc.texte).map(p => para(run(p), { apres: 160 })),
  ];
  // NOTE: bloc de signature calé à droite : nom et image alignés à gauche sur le même retrait (page A4 de 9412 twips de large utile, bloc de 3400)
  const RETRAIT_SIGNATURE = 6012;
  corps.push(para(run(e.nom), { retrait: RETRAIT_SIGNATURE }));
  const avecImage = Boolean(signature && doc.signature);
  if (avecImage && signature) {
    const ratio = Math.min(40 / signature.largeur, 18 / signature.hauteur);
    const cx = Math.round(signature.largeur * ratio * EMU_MM);
    const cy = Math.round(signature.hauteur * ratio * EMU_MM);
    corps.push(para(`<w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Signature"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="Signature"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdSignature"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`, { retrait: RETRAIT_SIGNATURE }));
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${corps.filter(Boolean).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1247" w:right="1247" w:bottom="1247" w:left="1247" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const ext = signature?.type === 'JPEG' ? 'jpeg' : 'png';
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;
  return zip([
    { nom: '[Content_Types].xml', donnees: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${avecImage ? `<Default Extension="${ext}" ContentType="image/${ext}"/>` : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { nom: '_rels/.rels', donnees: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { nom: 'docProps/core.xml', donnees: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(doc.objet ? `Lettre de motivation : ${doc.objet}` : 'Lettre de motivation')}</dc:title><dc:creator>${xml(e.nom)}</dc:creator></cp:coreProperties>` },
    { nom: 'word/document.xml', donnees: document },
    { nom: 'word/styles.xml', donnees: styles },
    { nom: 'word/_rels/document.xml.rels', donnees: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${avecImage ? `<Relationship Id="rIdSignature" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/signature.${ext}"/>` : ''}</Relationships>` },
    ...(avecImage && signature ? [{ nom: `word/media/signature.${ext}`, donnees: signature.octets }] : []),
  ]);
}
