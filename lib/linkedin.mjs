// ANCHOR: lecture de l'export officiel LinkedIn (ZIP « Obtenir une copie de vos données ») vers une proposition de parcours pour le Profil.
// Rien n'est écrit ici : le serveur renvoie la proposition, l'interface ajoute ce que l'utilisateur coche. Adresse, date de naissance et contacts sont ignorés.
import { execFileSync } from 'node:child_process';
import { lignesCsv } from './csv.mjs';
import { classer, norm } from './offres.mjs';

export class ErreurLinkedin extends Error {}

const FICHIERS = ['Profile', 'Positions', 'Education', 'Certifications', 'Skills', 'Languages'];

const MOIS_NOMS = [
  ['jan', 'janv', 'janvier', 'january'], ['feb', 'fev', 'fevr', 'fevrier', 'february'], ['mar', 'mars', 'march'], ['apr', 'avr', 'avril', 'april'],
  ['may', 'mai'], ['jun', 'juin', 'june'], ['jul', 'juil', 'juillet', 'july'], ['aug', 'aout', 'august'],
  ['sep', 'sept', 'septembre', 'september'], ['oct', 'octobre', 'october'], ['nov', 'novembre', 'november'], ['dec', 'decembre', 'december'],
];

// ANCHOR: « Jan 2020 », « janv. 2020 », « 2020-01 », « 01/2020 » ou « 2020 » (janvier par défaut) vers AAAA-MM, vide si illisible
export function moisLinkedin(texte) {
  const t = norm(String(texte ?? '').trim()).replace(/\./g, '');
  if (!t) return '';
  let r = /^(\d{4})-(\d{1,2})/.exec(t);
  if (r) return `${r[1]}-${r[2].padStart(2, '0')}`;
  r = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (r) return `${r[2]}-${r[1].padStart(2, '0')}`;
  const nomme = /^([a-z]+)\s+(\d{4})$/.exec(t);
  if (nomme) {
    const i = MOIS_NOMS.findIndex(noms => noms.includes(nomme[1]));
    return i < 0 ? '' : `${nomme[2]}-${String(i + 1).padStart(2, '0')}`;
  }
  r = /^(\d{4})$/.exec(t);
  return r ? `${r[1]}-01` : '';
}

const annee = texte => /\d{4}/.exec(String(texte ?? ''))?.[0] ?? '';

// NOTE: colonnes trouvées quelle que soit la casse ou les espaces ; certains fichiers commencent par des lignes de notes avant l'en-tête
function tableau(texte, colonneAttendue) {
  const lignes = lignesCsv(texte);
  const i = lignes.findIndex(l => l.some(c => norm(c).trim() === norm(colonneAttendue)));
  if (i < 0) return [];
  const entete = lignes[i].map(c => norm(c).replace(/\s+/g, ' ').trim());
  return lignes.slice(i + 1).filter(l => l.some(c => c.trim())).map(l => {
    /** @type {Record<string, string>} */
    const o = {};
    entete.forEach((k, j) => { o[k] = (l[j] ?? '').trim(); });
    return o;
  });
}

// Fichiers CSV de l'export (nom sans dossier ni extension vers chemin dans le ZIP)
function contenu(zip) {
  let liste;
  try {
    liste = execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1e7, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').split('\n').filter(Boolean);
  } catch {
    throw new ErreurLinkedin('Fichier illisible : un ZIP d\'export LinkedIn est attendu.');
  }
  /** @type {Map<string, string>} */
  const fichiers = new Map();
  for (const chemin of liste) {
    const nom = chemin.split('/').pop() ?? '';
    const base = FICHIERS.find(f => nom.toLowerCase() === f.toLowerCase() + '.csv');
    if (base && !fichiers.has(base)) fichiers.set(base, chemin);
  }
  return fichiers;
}

const extraire = (zip, chemin) => execFileSync('unzip', ['-p', zip, chemin], { maxBuffer: 5e7, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');

/**
 * Lit le ZIP et renvoie le parcours au format des tables (sans id).
 * @param {string} zip chemin du fichier
 */
export function lireExportLinkedin(zip) {
  const fichiers = contenu(zip);
  if (!fichiers.size) throw new ErreurLinkedin('Aucun fichier LinkedIn reconnu dans ce ZIP (Positions.csv, Education.csv, Skills.csv...).');
  const lire = (nom, colonne) => (fichiers.has(nom) ? tableau(extraire(zip, fichiers.get(nom)), colonne) : []);

  const profil = lire('Profile', 'Headline')[0] ?? {};
  const experiences = lire('Positions', 'Title').filter(p => p.title).map(p => ({
    poste: p.title,
    employeur: p['company name'] ?? '',
    lieu: p.location ?? '',
    type: 'salarie',
    categorie: classer(p.title),
    debut: moisLinkedin(p['started on']),
    fin: moisLinkedin(p['finished on']),
    description: p.description ?? '',
  }));
  const formations = [
    ...lire('Education', 'School Name').filter(e => e['degree name'] || e['school name']).map(e => ({
      type: 'diplome',
      titre: e['degree name'] || e['school name'],
      etablissement: e['degree name'] ? e['school name'] : '',
      debut: annee(e['start date']),
      fin: annee(e['end date']),
      matieres: '',
      note: [e.notes, e.activities].filter(Boolean).join(' '),
    })),
    ...lire('Certifications', 'Name').filter(c => c.name).map(c => ({
      type: 'certification',
      titre: c.name,
      etablissement: c.authority ?? '',
      debut: '',
      fin: annee(c['started on']),
      matieres: '',
      note: '',
    })),
  ];
  const competences = [
    ...lire('Skills', 'Name').filter(s => s.name).map(s => ({ domaine: 'À classer (LinkedIn)', competence: s.name, enseigner: null, executer: null, note: '' })),
    ...lire('Languages', 'Name').filter(l => l.name).map(l => ({ domaine: 'Langues', competence: l.name, enseigner: null, executer: null, note: l.proficiency ?? '' })),
  ];
  return {
    fichiers: [...fichiers.keys()],
    profil: { accroche: profil.headline ?? '', resume: profil.summary ?? '' },
    experiences,
    formations,
    competences,
  };
}

// ANCHOR: proposition d'import : chaque élément est marqué déjà présent (même intitulé normalisé, même employeur et même début pour une expérience)
export function proposerImport(lu, existant) {
  const cle = (...parts) => parts.map(p => norm(p).replace(/[^a-z0-9]+/g, ' ').trim()).join('|');
  const deja = new Set([
    ...existant.experiences.map(x => 'x' + cle(x.poste, x.employeur, x.debut)),
    ...existant.formations.map(f => 'f' + cle(f.titre)),
    ...existant.competences.map(c => 'c' + cle(c.competence)),
  ]);
  const marquer = (prefixe, liste, f) => liste.map(e => ({ ...e, present: deja.has(prefixe + f(e)) }));
  return {
    fichiers: lu.fichiers,
    profil: lu.profil,
    experiences: marquer('x', lu.experiences, x => cle(x.poste, x.employeur, x.debut)),
    formations: marquer('f', lu.formations, f => cle(f.titre)),
    competences: marquer('c', lu.competences, c => cle(c.competence)),
  };
}
