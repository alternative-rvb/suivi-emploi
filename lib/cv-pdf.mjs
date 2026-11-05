// ANCHOR: mise en page PDF d'un CV composé par lib/cv.mjs (jspdf, A4 portrait, une colonne sobre proche du CV de référence)
// Utilisée par le serveur (POST /api/cv/pdf) et par bin/cv.mjs (secours sans serveur) : le PDF est le même partout.
import { codePostalVille } from './coordonnees.mjs';
import { villeMission } from './cv.mjs';

const MARGE = 16;
const LARGEUR = 210 - 2 * MARGE;
const BAS = 297 - 14;
/** @type {[number, number, number]} */
const ACCENT = [15, 118, 110];
/** @type {[number, number, number]} */
const GRIS = [95, 99, 104];
/** @type {[number, number, number]} */
const NOIR = [33, 33, 33];
/** @type {[number, number, number]} */
const GRIS_ENTETE = [70, 74, 78];

// NOTE: les polices standard de jsPDF couvrent le latin-1 (plus œ, € et la puce) : on remplace ou retire le reste
export const texteSur = t => String(t ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/[‐‑−]/g, '-').replace(/…/g, '...').replace(/[  ]/g, ' ').replace(/→/g, '->')
  .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≠/g, '!=').replace(/[≈∼]/g, '~')
  .replace(/[^\u0000-ÿŒœ€•]/g, '');

/** @param {ReturnType<typeof import('./cv.mjs').validerDocument>} doc @param {{ photo?: { octets: Uint8Array, type: 'PNG' | 'JPEG' } | null }} [options] */
async function construire(doc, { photo = null } = {}) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setProperties({ title: texteSur(`CV ${doc.entete.nom}`), author: texteSur(doc.entete.nom) });
  let y = MARGE;

  /** @type {(taille: number, graisse?: string, couleur?: [number, number, number]) => void} */
  const style = (taille, graisse = 'normal', couleur = NOIR) => { pdf.setFont('helvetica', graisse); pdf.setFontSize(taille); pdf.setTextColor(...couleur); };
  const hauteur = taille => taille * 0.42;
  const place = h => { if (y + h > BAS) { pdf.addPage(); y = MARGE; } };
  // Paragraphe coupé à la largeur, avec retrait éventuel (puces)
  const paragraphe = (texte, { taille = 9.5, graisse = 'normal', couleur = NOIR, retrait = 0, align = 'left', apres = 1, largeur = LARGEUR, centre = 105 } = {}) => {
    if (!String(texte ?? '').trim()) return;
    style(taille, graisse, couleur);
    for (const ligne of pdf.splitTextToSize(texteSur(texte), largeur - retrait)) {
      place(hauteur(taille));
      const x = align === 'center' ? centre : MARGE + retrait;
      pdf.text(ligne, x, y + hauteur(taille) * 0.8, { align: align === 'center' ? 'center' : 'left' });
      y += hauteur(taille) * 1.18;
    }
    y += apres;
  };
  // NOTE: libellé en gras puis texte courant, la première ligne se partage la largeur et les suivantes reprennent toute la largeur
  const ligneEtiquetee = (etiquette, texte, { taille = 9.5, apres = 1 } = {}) => {
    style(taille, 'bold');
    const debut = `${texteSur(etiquette)} : `;
    const l = pdf.getTextWidth(debut);
    style(taille);
    const premiere = pdf.splitTextToSize(texteSur(texte), LARGEUR - l);
    const [tete, ...reste] = premiere;
    const suite = reste.length ? pdf.splitTextToSize(texteSur(texte).slice(tete.length).trim(), LARGEUR) : [];
    place(hauteur(taille));
    style(taille, 'bold');
    pdf.text(debut, MARGE, y + hauteur(taille) * 0.8);
    style(taille);
    pdf.text(tete ?? '', MARGE + l, y + hauteur(taille) * 0.8);
    y += hauteur(taille) * 1.18;
    for (const t of suite) { place(hauteur(taille)); pdf.text(t, MARGE, y + hauteur(taille) * 0.8); y += hauteur(taille) * 1.18; }
    y += apres;
  };
  // NOTE: une puce reste entière : si elle ne tient pas en bas de page, elle passe tout entière à la page suivante
  const puce = texte => {
    style(9.5);
    place(hauteur(9.5) * 1.18 * pdf.splitTextToSize(texteSur(texte), LARGEUR - 5).length);
    style(9.5, 'normal', ACCENT);
    pdf.text('•', MARGE + 1.5, y + hauteur(9.5) * 0.8);
    paragraphe(texte, { retrait: 5, apres: 0.4 });
  };
  // NOTE: 30 mm réservés par défaut : un titre de rubrique ne reste jamais seul en bas de page avec une ligne (18 mm pour la rubrique Langues, une seule ligne)
  const rubrique = (titre, reserve = 30) => {
    place(reserve);
    y += 3;
    style(11.5, 'bold', ACCENT);
    pdf.text(texteSur(titre), MARGE, y + 4);
    y += 6;
    pdf.setDrawColor(...ACCENT);
    pdf.setLineWidth(0.3);
    pdf.line(MARGE, y, MARGE + LARGEUR, y);
    y += 3;
  };
  // Ligne titre à gauche, période à droite
  const ligneTitre = (gauche, droite, { taille = 10.5 } = {}) => {
    style(9, 'normal', GRIS);
    const l = droite ? pdf.getTextWidth(texteSur(droite)) + 4 : 0;
    style(taille, 'bold');
    const lignes = pdf.splitTextToSize(texteSur(gauche), LARGEUR - l);
    place(hauteur(taille) * lignes.length + 1);
    lignes.forEach((t, i) => pdf.text(t, MARGE, y + hauteur(taille) * (0.8 + i * 1.18)));
    if (droite) { style(9, 'normal', GRIS); pdf.text(texteSur(droite), MARGE + LARGEUR, y + hauteur(taille) * 0.8, { align: 'right' }); }
    y += hauteur(taille) * 1.18 * lignes.length + 0.5;
  };

  // ANCHOR: entête (nom, titre, coordonnées)
  const e = doc.entete;
  // NOTE: nom en casse normale (moins criard que les majuscules), coordonnées à 9 points dans un gris plus foncé pour rester lisibles à l'impression
  // ANCHOR: photo facultative (doc.photo et fichier présent) à gauche de l'entête, dans une case de 19 x 24 mm ; le texte se centre dans la largeur restante et la hauteur de l'entête ne change pas. Sans photo (ou sans fichier), l'entête reste celle d'origine.
  const avecPhoto = Boolean(photo && doc.photo);
  const decalage = avecPhoto ? 25 : 0;
  const entete = { align: 'center', largeur: LARGEUR - decalage, centre: MARGE + decalage + (LARGEUR - decalage) / 2 };
  const debutEntete = y;
  if (avecPhoto && photo) {
    const prop = pdf.getImageProperties(photo.octets);
    const r = Math.min(19 / prop.width, 24 / prop.height);
    pdf.addImage(photo.octets, photo.type, MARGE, debutEntete, prop.width * r, prop.height * r);
  }
  paragraphe(e.nom, { taille: 18, graisse: 'bold', ...entete, apres: 0.5 });
  paragraphe(e.titre || doc.accroche, { taille: 11, couleur: ACCENT, ...entete, apres: 0.5 });
  paragraphe([codePostalVille(e), e.telephone, e.email].filter(Boolean).join('  •  '), { taille: 9, couleur: GRIS_ENTETE, ...entete, apres: 0 });
  paragraphe([e.site, e.linkedin, doc.categorie === 'comptabilite' ? '' : e.github].filter(Boolean).join('  •  '), { taille: 9, couleur: GRIS_ENTETE, ...entete, apres: 0 });
  paragraphe(e.mention, { taille: 9, couleur: GRIS_ENTETE, ...entete, apres: 0 });
  // NOTE: la photo ne descend jamais le CV : l'entête n'est allongée que s'il manque quelques millimètres sous elle
  if (avecPhoto) y = Math.max(y, debutEntete + 25);

  if (doc.resume || (e.titre && doc.accroche)) {
    rubrique('Profil');
    if (e.titre && doc.accroche) paragraphe(doc.accroche, { graisse: 'bold', apres: 1.5 });
    for (const p of doc.resume.split(/\n\s*\n/)) paragraphe(p.replace(/\s*\n\s*/g, ' '), { apres: 1.5 });
  }

  if (doc.experiences.length) {
    rubrique('Expérience professionnelle');
    for (const x of doc.experiences) {
      ligneTitre(x.poste, x.periode);
      paragraphe([x.employeur, x.lieu].filter(Boolean).join(', '), { taille: 9, graisse: 'italic', couleur: GRIS, apres: x.condensee ? 2 : 0.8 });
      for (const p of x.puces) puce(p);
      if (x.missions.length) puce(`Missions récentes en PACA : ${x.missions.map(m => `${m.employeur}${villeMission(m)}, ${m.poste} (${m.periode})`).join(' ; ')}`);
      if (!x.condensee || x.puces.length) y += 2;
    }
  }

  if (doc.formation.length || doc.titres_prepares.length) {
    rubrique('Formation et diplômes');
    for (const f of doc.formation) {
      ligneTitre([f.titre, f.etablissement, f.lieu].filter(Boolean).join(', '), f.annees, { taille: 9.5 });
      if (f.note) paragraphe(f.note, { taille: 8.5, couleur: GRIS, apres: 0.5 });
    }
    if (doc.titres_prepares.length) paragraphe(`Titres préparés en tant que formateur : ${doc.titres_prepares.join(', ')}`, { taille: 9, couleur: GRIS, apres: 0.5 });
  }

  if (doc.competences.length) {
    rubrique('Compétences et outils');
    for (const c of doc.competences) {
      if (!c.liste.length) continue;
      ligneEtiquetee(c.domaine, c.liste.join(' · '));
    }
  }

  if (doc.langues.length) {
    rubrique('Langues', 18);
    paragraphe(doc.langues.map(l => (l.niveau ? `${l.langue} (${l.niveau})` : l.langue)).join(', '));
  }

  // NOTE: numéro de page seulement quand le CV dépasse une page
  const pages = pdf.getNumberOfPages();
  if (pages > 1) for (let i = 1; i <= pages; i++) { pdf.setPage(i); style(8, 'normal', GRIS); pdf.text(`${i} / ${pages}`, 105, 297 - 7, { align: 'center' }); }
  return pdf;
}

/** @param {ReturnType<typeof import('./cv.mjs').validerDocument>} doc @param {{ photo?: { octets: Uint8Array, type: 'PNG' | 'JPEG' } | null }} [options] @returns {Promise<Uint8Array>} */
export async function cvPdf(doc, options = {}) {
  return new Uint8Array((await construire(doc, options)).output('arraybuffer'));
}

/** Nombre de pages du PDF d'un CV (même mise en page que cvPdf), pour tenir un CV sur mesure en 2 pages
 * @param {ReturnType<typeof import('./cv.mjs').validerDocument>} doc */
export async function nombrePages(doc) {
  return (await construire(doc)).getNumberOfPages();
}
