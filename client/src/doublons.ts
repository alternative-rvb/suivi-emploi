import { norm } from './utils.ts';

// ANCHOR: rapprochement entre offres et candidatures, pour ne pas faire deux fois le travail (même annonce vue sur Glassdoor puis France Travail)
// Trois niveaux, du plus sûr au plus faible :
//   lien      la candidature pointe vers l'offre (offre_id)
//   numero    le numéro de l'offre est écrit dans la candidature (plateforme, notes, poste...)
//   employeur même employeur, sans certitude que ce soit la même annonce

// NOTE: mots sans valeur pour comparer deux noms d'employeur
const VIDES = new Set(['sas', 'sasu', 'sarl', 'eurl', 'sa', 'scop', 'group', 'groupe', 'france', 'societe', 'cabinet', 'agence', 'entreprise', 'de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'the', 'and']);

const jetons = texte => norm(String(texte || '').replace(/\([^)]*\)/g, ' '))
  .split(/[^a-z0-9]+/)
  .filter(t => t.length > 1 && !VIDES.has(t));

// Vrai si les mots de l'un sont tous dans l'autre et que le plus court contient un mot assez distinctif
function memeEmployeur(a, b) {
  if (!a.length || !b.length) return false;
  const [petit, grand] = a.length <= b.length ? [a, b] : [b, a];
  return petit.some(t => t.length >= 5) && petit.every(t => grand.includes(t));
}

const estManuelle = o => o.id_offre.startsWith('man-');

// Renvoie { parOffre : id_offre vers { type, cand }, parCandidature : id candidature vers l'offre correspondante }
export function rapprocher(offres, candidatures) {
  const parOffre = new Map<any, any>();
  const parCandidature = new Map<any, any>();
  const index = new Map<string, any>((offres || []).map(o => [o.id_offre, o]));
  const lisibles = (candidatures || []).filter(c => c.statut !== 'ecarte');
  const recentes = [...lisibles].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const textes = recentes.map(c => ({
    c,
    mots: new Set(norm(`${c.id} ${c.plateforme || ''} ${c.notes || ''} ${c.description || ''} ${c.poste || ''}`).split(/[^a-z0-9]+/).filter(Boolean)),
    employeur: jetons(c.entreprise),
  }));

  // Lien explicite, toutes candidatures confondues (même écartées avant envoi)
  for (const c of candidatures || []) {
    const o = c.offre_id && index.get(c.offre_id);
    if (o) {
      parOffre.set(o.id_offre, { type: 'lien', cand: c });
      parCandidature.set(c.id, o);
    }
  }

  for (const o of offres || []) {
    if (parOffre.has(o.id_offre) || estManuelle(o)) continue;
    const numero = norm(o.id_offre);
    const parNumero = numero.length >= 5 && /\d/.test(numero) ? textes.find(t => t.mots.has(numero)) : null;
    if (parNumero) {
      parOffre.set(o.id_offre, { type: 'numero', cand: parNumero.c });
      if (!parCandidature.has(parNumero.c.id)) parCandidature.set(parNumero.c.id, o);
      continue;
    }
    const employeur = jetons(o.entreprise);
    const memeEntreprise = employeur.length ? textes.find(t => memeEmployeur(employeur, t.employeur)) : null;
    if (memeEntreprise) parOffre.set(o.id_offre, { type: 'employeur', cand: memeEntreprise.c });
  }
  return { parOffre, parCandidature };
}

// ANCHOR: annonces republiées. France Travail republie parfois la même annonce sous un nouvel identifiant (même titre, employeur et lieu).
// On ne regroupe que si l'employeur est connu : sans employeur, deux annonces identiques peuvent venir d'entreprises différentes.
// Renvoie { principales : Set des id_offre à afficher, groupes : id_offre principale vers { n, ids } }.
// La principale est une offre déjà suivie si le groupe en contient une (prefere), sinon la plus récente.
export function regrouperAnnonces(offres, prefere: (id: string) => boolean = () => false) {
  const parCle = new Map<any, any>();
  const principales = new Set<any>();
  for (const o of offres || []) {
    if (estManuelle(o) || !String(o.entreprise || '').trim()) {
      principales.add(o.id_offre);
      continue;
    }
    const cle = [o.titre, o.entreprise, o.lieu].map(x => norm(String(x || '')).replace(/\s+/g, ' ').trim()).join('|');
    if (!parCle.has(cle)) parCle.set(cle, []);
    parCle.get(cle).push(o);
  }
  const groupes = new Map<any, any>();
  for (const membres of parCle.values()) {
    membres.sort((a, b) => Number(prefere(b.id_offre)) - Number(prefere(a.id_offre))
      || (b.date_detection || '').localeCompare(a.date_detection || '')
      || b.id_offre.localeCompare(a.id_offre));
    const [principale] = membres;
    principales.add(principale.id_offre);
    if (membres.length > 1) groupes.set(principale.id_offre, { n: membres.length, ids: membres.map(m => m.id_offre) });
  }
  return { principales, groupes };
}
