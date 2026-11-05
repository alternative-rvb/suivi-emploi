// ANCHOR: lieux de travail d'une candidature (destinations des trajets), stockés en JSON dans candidatures.lieux
// Chaque lieu : { id, nom, adresse, lon, lat, jours, peage } (peage = montant aller-retour par jour, en euros, saisi à la main)

export class ErreurLieux extends Error {}

const MAX_LIEUX = 8;

const texte = (nom, v, max, requis) => {
  if (typeof v !== 'string') throw new ErreurLieux(`${nom} doit être une chaîne.`);
  const t = v.trim().replace(/\s+/g, ' ');
  if (requis && !t) throw new ErreurLieux(`${nom} est obligatoire.`);
  if (t.length > max) throw new ErreurLieux(`${nom} : ${max} caractères au plus.`);
  return t;
};
const nombre = (nom, v, min, max) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new ErreurLieux(`${nom} doit être un nombre entre ${min} et ${max}.`);
  return v;
};

// Valide et normalise la liste reçue (champs inconnus refusés), renvoie la liste à stocker
/** @type {(d: unknown) => import('../types.d.ts').Lieu[]} */
export function validerLieux(d) {
  if (!Array.isArray(d)) throw new ErreurLieux('lieux doit être une liste.');
  if (d.length > MAX_LIEUX) throw new ErreurLieux(`${MAX_LIEUX} lieux au plus.`);
  const ids = new Set();
  return d.map(l => {
    if (typeof l !== 'object' || l === null || Array.isArray(l)) throw new ErreurLieux('Lieu invalide.');
    const inconnus = Object.keys(l).filter(k => !['id', 'nom', 'adresse', 'lon', 'lat', 'jours', 'peage'].includes(k));
    if (inconnus.length) throw new ErreurLieux(`Champs inconnus dans un lieu : ${inconnus.join(', ')}.`);
    const id = texte('L\'id du lieu', l.id, 40, true);
    if (ids.has(id)) throw new ErreurLieux(`Identifiant de lieu en double : ${id}.`);
    ids.add(id);
    const lon = l.lon ?? null;
    const lat = l.lat ?? null;
    if ((lon === null) !== (lat === null)) throw new ErreurLieux('lon et lat vont ensemble.');
    return {
      id,
      nom: texte('Le nom du lieu', l.nom, 80, true),
      adresse: texte('L\'adresse', l.adresse ?? '', 200, false),
      lon: lon === null ? null : nombre('lon', lon, -180, 180),
      lat: lat === null ? null : nombre('lat', lat, -90, 90),
      jours: nombre('jours', l.jours ?? 0, 0, 400),
      peage: nombre('peage', l.peage ?? 0, 0, 500),
    };
  });
}

// Lecture d'une valeur stockée : liste vide si le JSON est absent ou illisible
export function lireLieux(brut) {
  try {
    const l = JSON.parse(brut || '[]');
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}
