// ANCHOR: comparaison du salaire ou du TJM d'une offre avec l'attente saisie dans Admin (Trajets)

export type Remuneration = { montant: number; unite: 'an' | 'jour' };

const HEURES_AN = 1820; // NOTE: 35 h × 52 semaines, pour ramener un taux horaire à l'année
const nombres = (s: string) => (s.replace(/\s/g, '').replace(/,/g, '.').match(/\d+(\.\d+)?/g) ?? []).map(Number);

// Texte de salaire d'une offre (annuel brut, mensuel, horaire, jour) en montant annuel ou journalier, null si illisible
export function lireRemuneration(salaire: string | null | undefined): Remuneration | null {
  if (!salaire) return null;
  const n = nombres(String(salaire).replace(/sur\s*\d+(,5)?\s*mois/gi, ''));
  if (!n.length) return null;
  const moyen = n.length > 1 ? (n[0] + n[1]) / 2 : n[0];
  const t = String(salaire).toLowerCase();
  if (/jour|tjm/.test(t)) return { montant: moyen, unite: 'jour' };
  if (/mensuel/.test(t)) return { montant: moyen * 12, unite: 'an' };
  if (/horaire|heure/.test(t)) return { montant: moyen * HEURES_AN, unite: 'an' };
  if (/annuel|an\b/.test(t)) return { montant: moyen, unite: 'an' };
  // Montant sans unité : un petit nombre est un taux horaire, sinon un annuel
  return { montant: moyen < 200 ? moyen * HEURES_AN : moyen, unite: 'an' };
}

export type Ecart = { pourcent: number; attente: number; unite: 'an' | 'jour'; couleur: string };

// Écart relatif à l'attente (-1 à +1 et plus), couleur du rouge (-20 % ou moins) au vert (+10 % ou plus)
export function calculerEcart(salaire: string | null | undefined, attenteAnnuelle = 0, tjm = 0): Ecart | null {
  const r = lireRemuneration(salaire);
  if (!r) return null;
  const attente = r.unite === 'jour' ? tjm : attenteAnnuelle;
  if (!attente) return null;
  const ratio = (r.montant - attente) / attente;
  const t = Math.min(1, Math.max(0, (ratio + 0.2) / 0.3));
  return { pourcent: Math.round(ratio * 100), attente, unite: r.unite, couleur: `hsl(${Math.round(t * 130)} 65% 38%)` };
}

export const libelleEcart = (e: Ecart) =>
  `${e.pourcent > 0 ? '+' : ''}${e.pourcent} % vs attente (${e.attente.toLocaleString('fr-FR')} €${e.unite === 'jour' ? ' / jour' : ' / an'})`;
