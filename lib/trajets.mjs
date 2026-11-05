// Points de départ des trajets (domicile, etc.), consommation et prix du carburant, utilisés par la fiche offre pour afficher distance et coût.
// Enregistrés dans le kv `trajets`. Chaque point a une adresse saisie, le libellé trouvé par le géocodeur de l'État et ses coordonnées (trouvés par l'interface).

export class ErreurTrajets extends Error {}

const MAX_DEPARTS = 10;

// NOTE: valeurs par défaut tant que rien n'est enregistré : aucun point de départ, l'utilisateur ajoute le sien dans l'onglet Admin
export const TRAJETS_PAR_DEFAUT = {
  departs: [],
  carburant: 'Gazole',
  prix_litre: 2.3,
  conso_100: 6, // NOTE: valeur provisoire, à régler selon le véhicule
  peage_jour: 0, // ANCHOR: valeurs préremplies à la création d'un lieu de trajet (candidature), modifiables lieu par lieu
  jours_defaut: 0,
  attente_annuelle: 0, // ANCHOR: salaire brut annuel attendu (0 = non renseigné), base de l'écart affiché sur les offres
  peage_km: 0.1, // ANCHOR: tarif moyen du péage en euros par km d'autoroute à péage, pour estimer le péage d'un trajet
  tjm: 0, // NOTE: taux journalier moyen attendu (0 = non renseigné), comparé aux offres payées au jour
};

const texte = (nom, v, max) => {
  if (typeof v !== 'string' || !v.trim()) throw new ErreurTrajets(`${nom} est obligatoire.`);
  const t = v.trim().replace(/\s+/g, ' ');
  if (t.length > max) throw new ErreurTrajets(`${nom}: ${max} caractères au plus.`);
  return t;
};
const nombre = (nom, v, min, max) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new ErreurTrajets(`${nom} doit être un nombre entre ${min} et ${max}.`);
  return v;
};

/** @returns {import('../types.d.ts').Trajets} */
export function validerTrajets(d) {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new ErreurTrajets('Objet JSON attendu.');
  const inconnus = Object.keys(d).filter(k => !['departs', 'carburant', 'prix_litre', 'conso_100', 'peage_jour', 'jours_defaut', 'attente_annuelle', 'tjm', 'peage_km'].includes(k));
  if (inconnus.length) throw new ErreurTrajets(`Champs inconnus: ${inconnus.join(', ')}.`);
  if (!Array.isArray(d.departs)) throw new ErreurTrajets('departs doit être une liste.');
  if (d.departs.length > MAX_DEPARTS) throw new ErreurTrajets(`${MAX_DEPARTS} points de départ au plus.`);
  const departs = d.departs.map(p => {
    if (typeof p !== 'object' || p === null) throw new ErreurTrajets('Point de départ invalide.');
    return {
      nom: texte('Le nom', p.nom, 60),
      adresse: texte('L\'adresse', p.adresse ?? p.ville, 150),
      trouve: typeof p.trouve === 'string' ? p.trouve.slice(0, 150) : '',
      lon: nombre('La longitude', p.lon, -180, 180),
      lat: nombre('La latitude', p.lat, -90, 90),
    };
  });
  return {
    departs,
    carburant: texte('Le carburant', d.carburant, 30),
    prix_litre: nombre('Le prix du litre', d.prix_litre, 0, 10),
    conso_100: nombre('La consommation', d.conso_100, 0, 40),
    // NOTE: champs facultatifs (absents des anciens enregistrements)
    peage_jour: nombre('Le péage par jour', d.peage_jour ?? 0, 0, 500),
    jours_defaut: nombre('Les jours sur place', d.jours_defaut ?? 0, 0, 400),
    attente_annuelle: nombre('L\'attente annuelle', d.attente_annuelle ?? 0, 0, 1000000),
    tjm: nombre('Le TJM', d.tjm ?? 0, 0, 10000),
    peage_km: nombre('Le tarif de péage au km', d.peage_km ?? TRAJETS_PAR_DEFAUT.peage_km, 0, 2),
  };
}

export function lireTrajets(db) {
  const ligne = db.prepare("SELECT valeur FROM kv WHERE cle = 'trajets'").get();
  if (ligne) {
    try {
      const brut = JSON.parse(ligne.valeur);
      // NOTE: ancien format (coût fixe au kilomètre) : points de départ conservés, carburant repris par défaut
      if ('cout_km' in brut) return { trajets: validerTrajets({ departs: brut.departs, carburant: TRAJETS_PAR_DEFAUT.carburant, prix_litre: TRAJETS_PAR_DEFAUT.prix_litre, conso_100: TRAJETS_PAR_DEFAUT.conso_100 }), origine: 'app' };
      return { trajets: validerTrajets(brut), origine: 'app' };
    } catch { /* enregistrement abîmé : retour aux valeurs par défaut */ }
  }
  return { trajets: TRAJETS_PAR_DEFAUT, origine: 'defaut' };
}

export function ecrireTrajets(db, trajets) {
  db.prepare('INSERT INTO kv (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run('trajets', JSON.stringify(trajets));
}
