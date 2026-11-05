import { MARSEILLE_ARRONDISSEMENTS } from './marseille.ts';

// ANCHOR: géographie de la fiche offre : centre d'une commune, trajet par la route, coût
// NOTE: services externes appelés depuis le navigateur (geo.api.gouv.fr, router.project-osrm.org). Seuls des centres de communes partent.

// Numéro d'arrondissement d'une ville « Marseille 8e » (0 si non précisé, null si ce n'est pas Marseille)
export function arrondissementMarseille(ville) {
  const m = /^marseille\b\s*(\d{1,2})?/i.exec((ville || '').trim());
  if (!m) return null;
  const n = m[1] ? parseInt(m[1], 10) : 0;
  return n >= 0 && n <= 16 ? n : 0;
}

// NOTE: France Travail abrège « Saint » en « ST » (ST REMY DE PROVENCE) et geo.api.gouv.fr ne reconnaît pas l'abréviation
const nettoyerVille = ville => ville.replace(/\s+\d{1,2}(e|er)?(\s+arrondissement)?$/i, '').replace(/\bST(E)?\b/gi, (_, e) => (e ? 'Sainte' : 'Saint')).trim();

const centres = new Map<any, any>();
export function centreCommune(ville, dep) {
  const nom = nettoyerVille(ville);
  const cle = `${dep}|${nom.toLowerCase()}`;
  if (!centres.has(cle)) {
    centres.set(cle, fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(nom)}${dep ? `&codeDepartement=${encodeURIComponent(dep)}` : '&boost=population'}&fields=centre&limit=1`)
      .then(r => (r.ok ? r.json() : []))
      .then(l => l[0]?.centre?.coordinates || null)
      .catch(() => null));
  }
  return centres.get(cle);
}

// Adresse libre vers coordonnées et libellé (géocodeur de l'État). Renvoie null si rien n'est trouvé
export async function geocoderAdresse(adresse) {
  // NOTE: le pays final est retiré, le géocodeur le prendrait pour un nom de rue (Rue Mendès France, Boulevard Anatole France)
  const q = adresse.replace(/[,\s]+france\s*$/i, '').trim() || adresse;
  const r = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=1`);
  if (!r.ok) throw new Error('Service de recherche d\'adresse indisponible');
  const f = (await r.json()).features?.[0];
  if (!f || f.properties.score < 0.4) return null;
  return { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], label: f.properties.label };
}

// Centre du plus grand morceau d'un arrondissement de Marseille ([lon, lat])
export function centreArrondissement(n) {
  const f = MARSEILLE_ARRONDISSEMENTS.features.find(x => x.properties.n === n);
  if (!f) return null;
  const aire = r => Math.abs(r.reduce((t, q, i) => t + q[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * q[1], 0));
  const r = f.geometry.coordinates.map(p => p[0]).sort((u, v) => aire(v) - aire(u))[0];
  const xs = r.map(q => q[0]), ys = r.map(q => q[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

export const vol = ([lo1, la1], [lo2, la2]) => {
  const rad = d => d * Math.PI / 180;
  const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};

// Distance (km) et durée (min) par la route (OSRM). Sans réponse : distance à vol d'oiseau majorée de 30 %, marquée `estime`
const trajets = new Map<any, any>();
export function itineraire(de, vers) {
  const cle = `${de}|${vers}`;
  if (!trajets.has(cle)) {
    trajets.set(cle, fetch(`https://router.project-osrm.org/route/v1/driving/${de[0]},${de[1]};${vers[0]},${vers[1]}?overview=false`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const t = j?.routes?.[0];
        if (!t) throw new Error('pas de route');
        return { km: t.distance / 1000, min: Math.round(t.duration / 60), estime: false };
      })
      .catch(() => ({ km: vol(de, vers) * 1.3, min: null, estime: true })));
  }
  return trajets.get(cle);
}

// ANCHOR: kilomètres d'autoroute à péage d'un trajet (Valhalla, serveur public d'OpenStreetMap), null sans réponse. Estimation : le prix se déduit avec un tarif au km réglé dans Admin.
const peages = new Map<any, any>();
export function kmPeage(de, vers): Promise<number | null> {
  const cle = `${de}|${vers}`;
  if (!peages.has(cle)) {
    const corps = { locations: [{ lon: de[0], lat: de[1] }, { lon: vers[0], lat: vers[1] }], costing: 'auto', directions_options: { units: 'kilometers' } };
    peages.set(cle, fetch('https://valhalla1.openstreetmap.de/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const m = j?.trip?.legs?.[0]?.maneuvers;
        return m ? m.filter(x => x.toll).reduce((s, x) => s + x.length, 0) : null;
      })
      .catch(() => null));
  }
  return peages.get(cle);
}

// ANCHOR: comme itineraire, avec en plus le tracé ([lat, lon] par point, prêt pour Leaflet) ; sans réponse du service, trace vaut null
const traces = new Map<any, any>();
export function itineraireTrace(de, vers) {
  const cle = `${de}|${vers}`;
  if (!traces.has(cle)) {
    traces.set(cle, fetch(`https://router.project-osrm.org/route/v1/driving/${de[0]},${de[1]};${vers[0]},${vers[1]}?overview=full&geometries=geojson`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const t = j?.routes?.[0];
        if (!t) throw new Error('pas de route');
        return { km: t.distance / 1000, min: Math.round(t.duration / 60), estime: false, trace: t.geometry.coordinates.map(([lo, la]) => [la, lo]) };
      })
      .catch(() => ({ km: vol(de, vers) * 1.3, min: null, estime: true, trace: null })));
  }
  return traces.get(cle);
}

// ANCHOR: centres des communes des départements de la zone de distance (GET /api/zone, réglée dans le .env, voir lib/zone.mjs), pour la distance du score de pertinence
// NOTE: un appel à geo.api.gouv.fr par département, gardé dans localStorage 30 jours ; sans réglage, sans réseau ni cache, le score garde la zone « proche » tout ou rien
let DEPARTEMENTS_ZONE: string[] = [];
let ORIGINES: [number, number][] = [];
let LIEU_BONUS: [number, number] | null = null;
const CLE_CENTRES = 'suivi.centres-communes.v1';
const normaliserCommune = (n: string) => String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\bsaint(e)?\b/g, m => (m === 'sainte' ? 'ste' : 'st')).replace(/[^a-z0-9]+/g, ' ').trim();
const centresZone = new Map<string, [number, number]>();
let chargement: Promise<void> | null = null;

/** Clé de recherche d'une offre (département, ville nettoyée) dans les centres de la zone */
export const cleCommune = (dep: string, ville: string) => `${dep}|${normaliserCommune(nettoyerVille(ville || ''))}`;

export function chargerCentresZone(): Promise<void> {
  if (chargement) return chargement;
  chargement = (async () => {
    try {
      const r = await fetch('/api/zone');
      const z = r.ok ? await r.json() : null;
      DEPARTEMENTS_ZONE = Array.isArray(z?.departements) ? z.departements : [];
      ORIGINES = Array.isArray(z?.origines) ? z.origines : [];
      LIEU_BONUS = Array.isArray(z?.bonus) ? z.bonus : null;
    } catch { /* serveur injoignable : aucune distance */ }
    if (!DEPARTEMENTS_ZONE.length || (!ORIGINES.length && !LIEU_BONUS)) return;
    try {
      const gardes = JSON.parse(localStorage.getItem(CLE_CENTRES) || 'null');
      if (gardes && Date.now() - gardes.at < 30 * 24 * 3600e3) {
        for (const [k, v] of gardes.centres) centresZone.set(k, v);
        // NOTE: un cache qui ne couvre pas tous les départements de la zone (ancienne version, écriture partielle) est refusé et rechargé
        if (DEPARTEMENTS_ZONE.every(dep => [...centresZone.keys()].some(k => k.startsWith(`${dep}|`)))) return;
        centresZone.clear();
      }
    } catch { centresZone.clear(); /* cache absent ou illisible */ }
    try {
      for (const dep of DEPARTEMENTS_ZONE) {
        const reponse = await fetch(`https://geo.api.gouv.fr/communes?codeDepartement=${dep}&fields=nom,centre&limit=500`);
        // NOTE: une réponse en erreur ou vide ne doit jamais être gardée en cache 30 jours (il manquerait tout un département)
        const l = reponse.ok ? await reponse.json() : [];
        if (!l.length) throw new Error(`communes du ${dep} indisponibles`);
        for (const c of l) {
          if (!c.centre?.coordinates) continue;
          const nom = normaliserCommune(c.nom);
          centresZone.set(`${dep}|${nom}`, c.centre.coordinates);
          // NOTE: France Travail écrit « Rochelle », « Baule », « Sables-d'Olonne » sans l'article de « La Rochelle », « La Baule », « Les Sables-d'Olonne »
          const sans = nom.replace(/^(la|le|les|l) /, '');
          if (sans !== nom && !centresZone.has(`${dep}|${sans}`)) centresZone.set(`${dep}|${sans}`, c.centre.coordinates);
        }
      }
      try { localStorage.setItem(CLE_CENTRES, JSON.stringify({ at: Date.now(), centres: [...centresZone] })); } catch { /* stockage plein ou refusé */ }
    } catch { centresZone.clear(); chargement = null; }
  })();
  return chargement;
}

// NOTE: points de départ du .env (SUIVI_ORIGINES), distance à vol d'oiseau majorée de 30 % pour approcher la route
export function distanceZoneKm(o: { departement?: string; ville?: string }): number | null {
  const c = centresZone.get(cleCommune(o.departement || '', o.ville || ''));
  return c && ORIGINES.length ? Math.round(Math.min(...ORIGINES.map(p => vol(p, c))) * 1.3) : null;
}

// NOTE: lieu bonus facultatif du .env (SUIVI_LIEU_BONUS) : pas une origine du score, sa distance ne sert qu'à un petit bonus discret
export function distanceLieuBonusKm(o: { departement?: string; ville?: string }): number | null {
  const c = centresZone.get(cleCommune(o.departement || '', o.ville || ''));
  return c && LIEU_BONUS ? Math.round(vol(LIEU_BONUS, c) * 1.3) : null;
}
