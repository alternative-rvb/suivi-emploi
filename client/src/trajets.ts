// ANCHOR: coût d'un aller-retour par jour, partagé par la fiche offre et le tableau des trajets d'une candidature
// Carburant = km aller-retour × consommation ÷ 100 × prix du litre ; péage estimé = km à péage aller-retour × tarif au km
export const coutCarburant = (km: number, coutKm: number) => km * 2 * coutKm;
export const peageEstime = (kmPeage: number | null | undefined, tarifKm: number) => (kmPeage ?? 0) * 2 * tarifKm;
export const coutKm = (t: { prix_litre: number; conso_100: number } | null | undefined) => (t ? t.prix_litre * t.conso_100 / 100 : 0);
