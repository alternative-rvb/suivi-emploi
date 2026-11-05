// ANCHOR: mise en page PDF d'une lettre de motivation (jspdf, A4 portrait, une page visée), mêmes polices et couleurs que le CV (lib/cv-pdf.mjs)
import { texteSur } from './cv-pdf.mjs';
import { lignesEntete, paragraphesDe } from './lettre.mjs';

const MARGE = 22;
const LARGEUR = 210 - 2 * MARGE;
const BAS = 297 - 16;
/** @type {[number, number, number]} */
const NOIR = [33, 33, 33];

/**
 * @param {ReturnType<typeof import('./lettre.mjs').validerLettre>} doc
 * @param {{ signature?: { octets: Uint8Array, type: 'PNG' | 'JPEG' } | null }} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function lettrePdf(doc, { signature = null } = {}) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setProperties({ title: texteSur(doc.objet ? `Lettre de motivation : ${doc.objet}` : 'Lettre de motivation'), author: texteSur(doc.entete.nom) });
  let y = MARGE;
  /** @type {(taille: number, graisse?: string, couleur?: [number, number, number]) => void} */
  const style = (taille, graisse = 'normal', couleur = NOIR) => { pdf.setFont('helvetica', graisse); pdf.setFontSize(taille); pdf.setTextColor(...couleur); };
  const hauteur = taille => taille * 0.42;
  const place = h => { if (y + h > BAS) { pdf.addPage(); y = MARGE; } };
  const bloc = (texte, { taille = 10.5, graisse = 'normal', couleur = NOIR, align = 'left', apres = 0, interligne = 1.3 } = {}) => {
    if (!String(texte ?? '').trim()) return;
    style(taille, graisse, couleur);
    for (const ligne of String(texte).split('\n').flatMap(l => pdf.splitTextToSize(texteSur(l), align === 'right' ? LARGEUR / 2 : LARGEUR))) {
      place(hauteur(taille) * interligne);
      pdf.text(ligne, align === 'right' ? MARGE + LARGEUR : MARGE, y + hauteur(taille) * 0.8, { align: align === 'right' ? 'right' : 'left' });
      y += hauteur(taille) * interligne;
    }
    y += apres;
  };

  // ANCHOR: expéditeur en haut à gauche, destinataire à droite, puis lieu et date à droite
  const e = doc.entete;
  // NOTE: entête conventionnelle d'une lettre française : coordonnées en noir, une par ligne, sans titre ni site ni couleur (le CV porte l'accroche)
  bloc(lignesEntete(e).join('\n'), { interligne: 1.25, apres: 12 });
  bloc(doc.destinataire, { align: 'right', interligne: 1.25, apres: 8 });
  bloc(doc.lieu_date, { align: 'right', apres: 8 });
  if (doc.objet) {
    style(10.5, 'bold');
    const etiquette = 'Objet : ';
    const l = pdf.getTextWidth(etiquette);
    const lignes = pdf.splitTextToSize(texteSur(doc.objet), LARGEUR - l);
    lignes.forEach((t, i) => { place(hauteur(10.5) * 1.3); if (i === 0) pdf.text(etiquette, MARGE, y + hauteur(10.5) * 0.8); pdf.text(t, MARGE + l, y + hauteur(10.5) * 0.8); y += hauteur(10.5) * 1.3; });
    y += 7;
  }
  for (const p of paragraphesDe(doc.texte)) bloc(p, { apres: 3.5, interligne: 1.35 });

  // NOTE: bloc de signature calé à droite, nom et image sur le même bord gauche (image de 40 x 18 mm au plus) ; sans image, le nom seul
  y += 2;
  const nom = texteSur(String(e.nom ?? '').trim());
  const avecImage = Boolean(signature && doc.signature);
  const prop = avecImage && signature ? pdf.getImageProperties(signature.octets) : null;
  const ratio = prop ? Math.min(40 / prop.width, 18 / prop.height) : 0;
  const l = prop ? prop.width * ratio : 0;
  const h = prop ? prop.height * ratio : 0;
  style(10.5);
  const x0 = MARGE + LARGEUR - Math.max(pdf.getTextWidth(nom), l);
  place(hauteur(10.5) * 1.3 + (prop ? h + 2 : 0));
  if (nom) {
    pdf.text(nom, x0, y + hauteur(10.5) * 0.8);
    y += hauteur(10.5) * 1.3 + 1;
  }
  if (prop && signature) {
    pdf.addImage(signature.octets, signature.type, x0, y, l, h);
    y += h + 1;
  }
  return new Uint8Array(pdf.output('arraybuffer'));
}
