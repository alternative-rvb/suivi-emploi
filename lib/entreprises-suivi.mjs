// Suivi des entreprises proposées par La Bonne Boite (candidatures spontanées) : gardée, écartée ou contactée, par numéro SIRET.
// Enregistré dans le kv `entreprises_suivi` ({ siret: { statut, nom, ville, maj } }) ; l'API de La Bonne Boite ne garde rien de cela.

export const STATUTS_ENTREPRISE = ['gardee', 'ecartee', 'contactee'];
const SIRET = /^\d{14}$/;
const MAX_ENTREES = 2000;

export class ErreurEntreprises extends Error {}

export function lireSuiviEntreprises(db) {
  const ligne = /** @type {any} */ (db.prepare("SELECT valeur FROM kv WHERE cle = 'entreprises_suivi'").get());
  try {
    const v = ligne ? JSON.parse(ligne.valeur) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

// ANCHOR: statut null retire l'entreprise du suivi (retour à « à trier ») ; renvoie { avant, apres } pour le journal
export function ecrireStatutEntreprise(db, siret, { statut, nom, ville }, maintenant = new Date()) {
  if (!SIRET.test(String(siret))) throw new ErreurEntreprises('Numéro SIRET invalide (14 chiffres).');
  if (statut !== null && !STATUTS_ENTREPRISE.includes(statut)) throw new ErreurEntreprises(`Statut invalide (${STATUTS_ENTREPRISE.join(', ')} ou null).`);
  const suivi = lireSuiviEntreprises(db);
  const avant = suivi[siret]?.statut ?? null;
  if (statut === null) delete suivi[siret];
  else {
    if (!(siret in suivi) && Object.keys(suivi).length >= MAX_ENTREES) throw new ErreurEntreprises(`${MAX_ENTREES} entreprises suivies au plus.`);
    suivi[siret] = { statut, nom: String(nom ?? suivi[siret]?.nom ?? '').slice(0, 120), ville: String(ville ?? suivi[siret]?.ville ?? '').slice(0, 80), maj: maintenant.toISOString() };
  }
  db.prepare("INSERT INTO kv (cle, valeur) VALUES ('entreprises_suivi', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(JSON.stringify(suivi));
  return { avant, apres: statut, suivi };
}
