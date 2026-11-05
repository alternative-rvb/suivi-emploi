import { texteSur as pdfSafe } from '../../lib/cv-pdf.mjs';
import { COLONNES_STATS, statsMetier, valeursStat, type BlocRecherche, type LigneJournal } from './actions.ts';
import { CATEGORIES, INTERETS, STATUTS } from './constants.ts';
import { aujourdhui as jour } from './utils.ts';

const COLONNES = [
  ['entreprise', 'Entreprise'], ['poste', 'Poste'], ['description', 'Description courte'], ['statut', 'Statut'],
  ['raison', 'Raison échec'], ['date', 'Date'], ['plateforme', 'Plateforme'], ['interet', 'Intérêt'], ['lien', 'Lien de candidature'], ['notes', 'Notes'],
];

function lignes(candidatures) {
  return [...candidatures].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(d => ({
    id: d.id || '',
    entreprise: d.entreprise || '',
    poste: d.poste || '',
    description: d.description || '',
    raison: d.raison || '',
    statut: STATUTS[d.statut]?.label || d.statut || '',
    date: d.date ? d.date.split('-').reverse().join('/') : '',
    plateforme: d.plateforme || '',
    interet: INTERETS[d.interet] || '',
    lien: d.lien || '',
    notes: d.notes || '',
  }));
}

function csv(candidatures) {
  const q = v => '"' + String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
  const out = [COLONNES.map(c => q(c[1])).join(';')];
  lignes(candidatures).forEach(r => out.push(COLONNES.map(c => q(r[c[0]])).join(';')));
  return '﻿' + out.join('\r\n') + '\r\n';
}

function xml(candidatures) {
  // NOTE: les caractères de contrôle (hors tabulation et sauts de ligne) rendent un XML 1.0 invalide
  const x = v => String(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let out = `<?xml version="1.0" encoding="UTF-8"?>\n<candidatures date_export="${jour()}">\n`;
  candidatures.forEach(d => {
    out += `  <candidature id="${x(d.id || '')}">\n`;
    for (const [k, v] of [['entreprise', d.entreprise], ['poste', d.poste], ['description', d.description], ['raison_echec', d.raison]]) {
      out += `    <${k}>${x(v || '')}</${k}>\n`;
    }
    out += `    <statut code="${x(d.statut || '')}">${x(STATUTS[d.statut]?.label || '')}</statut>\n`;
    for (const [k, v] of [['date', d.date], ['plateforme', d.plateforme], ['lien', d.lien], ['interet', d.interet], ['notes', d.notes]]) {
      out += `    <${k}>${x(v || '')}</${k}>\n`;
    }
    out += '  </candidature>\n';
  });
  return out + '</candidatures>\n';
}

async function pdf(candidatures) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text('Suivi des candidatures', 12, 14);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(pdfSafe(`Export du ${jour().split('-').reverse().join('/')}, ${candidatures.length} candidatures`), 12, 20);
  autoTable(doc, {
    startY: 25,
    head: [COLONNES.map(c => pdfSafe(c[1]))],
    body: lignes(candidatures).map(r => COLONNES.map(c => pdfSafe(r[c[0]]))),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [15, 118, 110], textColor: 255 },
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 48 }, 2: { cellWidth: 20 }, 3: { cellWidth: 17 }, 4: { cellWidth: 24 }, 5: { cellWidth: 18 } },
    margin: { left: 12, right: 12 },
  });
  return doc.output('blob');
}

// ANCHOR: bilan par période (Profil > Bilan, ligne 96) : une ligne par période, une colonne par compteur, totaux en pied
export async function rapportPdf(titre: string, sousTitre: string, colonnes: [string, string][], lignes: Record<string, any>[], totaux: Record<string, any>) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text(pdfSafe(titre), 12, 14);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(pdfSafe(sousTitre), 12, 20);
  autoTable(doc, {
    startY: 25,
    head: [colonnes.map(c => pdfSafe(c[1]))],
    body: lignes.map(l => colonnes.map(c => pdfSafe(l[c[0]] ?? ''))),
    foot: [colonnes.map(c => pdfSafe(totaux[c[0]] ?? ''))],
    styles: { fontSize: 7.5, cellPadding: 1.5, halign: 'right' },
    columnStyles: { 0: { halign: 'left', cellWidth: 34 } },
    headStyles: { fillColor: [15, 118, 110], textColor: 255, halign: 'right' },
    footStyles: { fillColor: [235, 240, 240], textColor: 30, fontStyle: 'bold' },
    margin: { left: 12, right: 12 },
  });
  return doc.output('blob');
}

// NOTE: CSV pour tableur (BOM, points-virgules, guillemets doublés, sauts de ligne aplatis), partagé par la recherche d'emploi et le journal
function tableurCsv(colonnes: [string, string][], lignes: Record<string, any>[]) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
  return '\uFEFF' + [colonnes.map(c => q(c[1])).join(';'), ...lignes.map(l => colonnes.map(c => q(l[c[0]])).join(';'))].join('\r\n') + '\r\n';
}
const jj = (d: string) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');
const hh = (ts: string) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const VERT: [number, number, number] = [15, 118, 110];

// ANCHOR: recherche d'emploi : une ligne par action, avec la candidature à laquelle elle se rattache
const COLONNES_RECHERCHE: [string, string][] = [
  ['numero', "N° d'offre"], ['candidature', 'Date de candidature'], ['employeur', 'Employeur'], ['poste', 'Poste'], ['plateforme', 'Plateforme'],
  ['lieu', 'Lieu'], ['contrat', 'Contrat'], ['envoi', 'Envoi'], ['date', "Date de l'action"], ['texte', 'Action menée'], ['resultat', 'Résultat'],
];
const lignesRecherche = (blocs: BlocRecherche[]) => blocs.flatMap(b => b.lignes.map(l => ({ ...b, candidature: jj(b.date), date: jj(l.date), texte: l.texte, resultat: l.resultat })));
export const rechercheCsv = (blocs: BlocRecherche[]) => tableurCsv(COLONNES_RECHERCHE, lignesRecherche(blocs));

// ANCHOR: justificatif de recherche d'emploi : pour chaque candidature (ordre de la date de candidature), une ligne d'en-tête puis ses actions datées et leur résultat
// NOTE: couleurs des badges du PDF, proches des variables --c-* de style.css (jsPDF ne lit pas le CSS)
type Rvb = [number, number, number];
const COULEURS_METIER: Record<string, Rvb> = {
  comptabilite: [16, 128, 108], formateur_digital: [124, 77, 200], web_design: [214, 64, 138], dev_web: [37, 112, 190], autre: [120, 134, 142],
};
// NOTE: résultat d'une action : vert pour une réussite (entretien, accepté), rouge pour un échec (refusé), gris clair neutre pour l'attente (en cours, sans réponse)
const NEUTRE: Rvb = [226, 230, 232];
const COULEURS_STATUT: Record<string, Rvb> = {
  a_faire: [37, 112, 190], en_cours: NEUTRE, entretien: [46, 125, 50], sans_reponse: NEUTRE, refuse: [198, 40, 40], accepte: [16, 110, 60], ecarte: [120, 134, 142],
};
// NOTE: texte foncé sur un fond clair, blanc sinon
const encre = ([r, g, b]: Rvb) => (0.299 * r + 0.587 * g + 0.114 * b > 170 ? 60 : 255);
const CLE_STATUT = new Map(Object.entries(STATUTS).map(([k, v]) => [v.label, k]));
const couleurStatut = (label: string): Rvb => COULEURS_STATUT[CLE_STATUT.get(label) ?? ''] ?? [120, 134, 142];

// ANCHOR: justificatif PDF : candidatures de la plus ancienne à la plus récente ; badge métier en tête de bloc et statut actuel à droite, résultat de chaque action en badge, statistiques en dernière page, pages numérotées
export async function recherchePdf(periode: string, blocs: BlocRecherche[]) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const tries = [...blocs].sort((a, b) => a.date.localeCompare(b.date) || a.employeur.localeCompare(b.employeur));
  // NOTE: comptes de la période : candidatures envoyées dans la période (les antérieures suivies à part), entretiens obtenus, actions datées dans la période
  const actions = tries.reduce((n, b) => n + b.lignes.filter(l => l.periode).length, 0);
  const envoyees = tries.filter(b => !b.anterieure).length;
  const anterieures = tries.length - envoyees;
  const entretiens = tries.filter(b => b.entretien).length;
  const resume = [`${envoyees} candidature(s) envoyée(s)`, anterieures && `${anterieures} candidature(s) antérieure(s) suivie(s)`, `${entretiens} entretien(s) obtenu(s)`, `${actions} action(s) menée(s)`].filter(Boolean).join(', ');
  doc.setFontSize(15);
  doc.text(pdfSafe("Justificatif de recherche d'emploi"), 12, 15);
  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(pdfSafe(`${periode} : ${resume}. Édité le ${jj(jour())}.`), 12, 22);
  const metierDe = (b: { metier: string }) => (COULEURS_METIER[b.metier] ? b.metier : 'autre');
  const libelleMetier = (m: string) => pdfSafe((CATEGORIES[m] ?? CATEGORIES.autre).label);

  // NOTE: badges mesurés en police du badge (dans didDrawCell la police courante est celle du tableau) ; le texte de la cellule est vidé, le badge le remplace
  const badgeFont = () => { doc.setFontSize(7); doc.setFont('helvetica', 'bold'); };
  badgeFont();
  const largeurTexte = (t: string) => doc.getTextWidth(t) + 3;
  const largeurMetier = Math.max(...Object.keys(COULEURS_METIER).map(m => largeurTexte(libelleMetier(m))));
  const largeurStatut = Math.max(...Object.values(STATUTS).map(v => largeurTexte(pdfSafe(v.label))));
  doc.setFont('helvetica', 'normal');
  type Badge = { texte: string; couleur: Rvb; droite?: boolean };
  const dessiner = (data: any, badges: Map<string, Badge[]>) => {
    if (data.section !== 'body') return;
    const liste = badges.get(`${data.row.index}:${data.column.index}`);
    if (!liste) return;
    badgeFont();
    const h = 4;
    const y = data.cell.y + Math.min(1.4, (data.cell.height - h) / 2);
    for (const { texte, couleur, droite } of liste) {
      const w = largeurTexte(texte);
      const x = droite ? data.cell.x + data.cell.width - 1.6 - w : data.cell.x + 1.6;
      doc.setFillColor(...couleur);
      doc.roundedRect(x, y, w, h, 1.2, 1.2, 'F');
      doc.setTextColor(encre(couleur));
      doc.text(texte, x + 1.5, y + h / 2, { baseline: 'middle' });
    }
  };

  const badges = new Map<string, Badge[]>();
  const body: any[] = [];
  for (const b of tries) {
    const details = [b.plateforme, b.lieu, b.contrat, b.envoi && `envoi : ${b.envoi.toLowerCase()}`].filter(Boolean).join(' · ');
    const m = metierDe(b);
    badges.set(`${body.length}:0`, [{ texte: libelleMetier(m), couleur: COULEURS_METIER[m] }, ...(b.statut ? [{ texte: pdfSafe(b.statut), couleur: couleurStatut(b.statut), droite: true }] : [])]);
    body.push([{ content: pdfSafe(`${b.numero ? `Offre n° ${b.numero}` : "Sans n° d'offre"}   ${jj(b.date)}   ${[b.employeur, b.poste].filter(Boolean).join(' · ')}${details ? `   (${details})` : ''}`), colSpan: 3,
      styles: { fontStyle: 'bold', fillColor: [235, 240, 240], cellPadding: { top: 1.6, bottom: 1.6, left: 1.6 + largeurMetier + 2.5, right: 1.6 + largeurStatut + 2.5 } } }]);
    for (const l of b.lignes) {
      if (l.resultat) badges.set(`${body.length}:2`, [{ texte: pdfSafe(l.resultat), couleur: couleurStatut(l.resultat) }]);
      body.push([pdfSafe(jj(l.date)), pdfSafe(l.texte), '']);
    }
  }
  autoTable(doc, {
    startY: 28,
    head: [['Date', 'Action menée', 'Résultat'].map(pdfSafe)],
    body,
    styles: { fontSize: 8.5, cellPadding: 1.6, minCellHeight: 6.8 },
    columnStyles: { 0: { cellWidth: 26 }, 2: { cellWidth: Math.max(30, largeurStatut + 3.2) } },
    headStyles: { fillColor: VERT, textColor: 255 },
    margin: { left: 12, right: 12, bottom: 14 },
    // NOTE: une ligne n'est jamais coupée entre deux pages, sinon le badge restait seul en bas de page et le bloc repartait sans badge
    rowPageBreak: 'avoid',
    didDrawCell: data => dessiner(data, badges),
  });

  // ANCHOR: statistiques en fin de document : tableau par métier (ligne 222 : réponses, entretiens, échanges moyens, délai de première réponse, total en dernière ligne), puis statut actuel et plateforme côte à côte ; métiers et statuts en badges
  const compter = (cle: (b: BlocRecherche) => string) => {
    const n = new Map<string, number>();
    for (const b of tries) n.set(cle(b) || 'Non renseigné', (n.get(cle(b) || 'Non renseigné') ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const pct = (n: number) => `${Math.round((n / (tries.length || 1)) * 100)} %`;
  const groupes: [string, [string, number][], ((k: string) => Rvb) | null][] = [
    ['Statut actuel', compter(b => pdfSafe(b.statut)), couleurStatut],
    ['Plateforme', compter(b => pdfSafe(b.plateforme)), null],
  ];
  const parMetier = statsMetier(tries);
  const hauteur = (lignes: number) => (lignes + 1) * 6.8;
  const bas = 210 - 14;
  let y = ((doc as any).lastAutoTable?.finalY ?? 28) + 10;
  if (y + 16 + hauteur(parMetier.length) > bas) { doc.addPage(); y = 15; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(30);
  doc.text(pdfSafe('Statistiques'), 12, y);
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text(pdfSafe(`${resume} sur la période.`), 12, y + 6);

  const marquesMetier = new Map<string, Badge[]>();
  parMetier.forEach((s, r) => { if (s.metier) marquesMetier.set(`${r}:0`, [{ texte: libelleMetier(metierDe(s)), couleur: COULEURS_METIER[metierDe(s)] }]); });
  autoTable(doc, {
    startY: y + 10,
    head: [['Métier', ...COLONNES_STATS].map(pdfSafe)],
    body: parMetier.map(s => [s.metier ? '' : 'Total', ...valeursStat(s)].map(pdfSafe)),
    styles: { fontSize: 8.5, cellPadding: 1.6, minCellHeight: 6.8, halign: 'right' },
    columnStyles: { 0: { halign: 'left', cellWidth: largeurMetier + 6 } },
    headStyles: { fillColor: VERT, textColor: 255, halign: 'right' },
    margin: { left: 12, right: 12 },
    pageBreak: 'avoid',
    didParseCell: data => {
      if (data.section === 'head' && data.column.index === 0) data.cell.styles.halign = 'left';
      if (data.section === 'body' && data.row.index === parMetier.length - 1) data.cell.styles.fontStyle = 'bold';
    },
    didDrawCell: data => dessiner(data, marquesMetier),
  });

  // NOTE: les deux tableaux côte à côte partent du même haut, sur une nouvelle page si le plus long ne tient pas
  let y2 = ((doc as any).lastAutoTable?.finalY ?? y) + 8;
  if (y2 + hauteur(Math.max(...groupes.map(g => g[1].length))) > bas) { doc.addPage(); y2 = 15; }
  const largeur = (297 - 24 - 8) / 2;
  groupes.forEach(([titre, lignes, couleur], i) => {
    const marques = new Map<string, Badge[]>();
    if (couleur) lignes.forEach(([k], r) => marques.set(`${r}:0`, [{ texte: k, couleur: couleur(k) }]));
    autoTable(doc, {
      startY: y2,
      head: [[titre, 'Nombre', 'Part'].map(pdfSafe)],
      body: lignes.map(([k, n]) => [couleur ? '' : k, String(n), pct(n)]),
      styles: { fontSize: 8.5, cellPadding: 1.6, minCellHeight: 6.8 },
      columnStyles: { 1: { cellWidth: 18, halign: 'right' }, 2: { cellWidth: 16, halign: 'right' } },
      headStyles: { fillColor: VERT, textColor: 255 },
      margin: { left: 12 + i * (largeur + 8) },
      tableWidth: largeur,
      pageBreak: 'avoid',
      didDrawCell: data => dessiner(data, marques),
    });
  });

  // NOTE: numéro de page en pied, posé à la fin pour connaître le total
  const pages = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110);
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.text(`${i} / ${pages}`, 297 / 2, 210 - 6, { align: 'center' }); }
  return doc.output('blob');
}

// ANCHOR: journal complet : toutes les lignes journalisées, valeurs avant et après comprises
const COLONNES_JOURNAL: [string, string][] = [['date', 'Date'], ['heure', 'Heure'], ['rubrique', 'Rubrique'], ['element', 'Élément'], ['action', 'Action'], ['avant', 'Avant'], ['apres', 'Après']];
const lignesJournalTableau = (lignes: LigneJournal[]) => lignes.map(l => ({ ...l, date: jj(l.jour), heure: hh(l.ts) }));
export const journalCsv = (lignes: LigneJournal[]) => tableurCsv(COLONNES_JOURNAL, lignesJournalTableau(lignes));

export async function journalPdf(periode: string, lignes: LigneJournal[]) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text(pdfSafe('Journal complet'), 12, 14);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(pdfSafe(`${periode} : ${lignes.length} ligne(s). Édité le ${jj(jour())}.`), 12, 20);
  autoTable(doc, {
    startY: 25,
    head: [COLONNES_JOURNAL.map(c => pdfSafe(c[1]))],
    body: lignesJournalTableau(lignes).map(l => COLONNES_JOURNAL.map(c => pdfSafe(l[c[0]]))),
    styles: { fontSize: 7, cellPadding: 1.2, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 11 }, 2: { cellWidth: 22 }, 3: { cellWidth: 60 }, 4: { cellWidth: 50 } },
    headStyles: { fillColor: VERT, textColor: 255 },
    margin: { left: 12, right: 12 },
  });
  return doc.output('blob');
}

export function telecharger(nom, contenu) {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function exporter(format, candidatures) {
  const contenu = format === 'csv' ? csv(candidatures) : format === 'xml' ? xml(candidatures) : await pdf(candidatures);
  telecharger(`suivi-candidatures-${jour()}.${format}`, contenu);
}

// Exposés pour les vérifications
export const _tests = { csv, xml, pdf };
