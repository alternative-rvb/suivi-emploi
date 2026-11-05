// Journal des actions : chaque création, modification et suppression faite dans l'app (ou par l'API) est datée à la seconde.
// ANCHOR: table append-only, créée au démarrage hors migration du schéma (comme analyses). Une ligne par champ modifié, avec la valeur avant et après,
// pour répondre à « combien d'offres vues cette semaine », « quand cette candidature est passée en entretien », etc.
// Le jour est stocké dans le fuseau SUIVI_FUSEAU (défaut Europe/Paris) : une action à 23 h 30 compte pour son jour local, pas pour le jour UTC.

const FUSEAU = () => process.env.SUIVI_FUSEAU || 'Europe/Paris';
const MAX = 300;

export function ouvrirJournal(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    jour TEXT NOT NULL,
    entite TEXT NOT NULL,
    entite_id TEXT NOT NULL DEFAULT '',
    libelle TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    champ TEXT NOT NULL DEFAULT '',
    avant TEXT NOT NULL DEFAULT '',
    apres TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS journal_jour ON journal (jour);
  CREATE INDEX IF NOT EXISTS journal_entite ON journal (entite, entite_id);`);
}

// Jour local AAAA-MM-JJ d'un instant
export const jourLocal = (date, fuseau = FUSEAU()) => new Intl.DateTimeFormat('en-CA', { timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

const texte = v => {
  if (v === true) return '1';
  if (v === false) return '0';
  const s = v == null ? '' : String(v);
  return s.length > MAX ? s.slice(0, MAX) + '…' : s;
};

// Champs dont la valeur diffère entre deux états, sous la forme [{ champ, avant, apres }]
export function differences(avant, apres, champs) {
  /** @type {{ champ: string, avant: string, apres: string }[]} */
  const liste = [];
  for (const champ of champs) {
    const a = texte(avant?.[champ]);
    const b = texte(apres?.[champ]);
    if (a !== b) liste.push({ champ, avant: a, apres: b });
  }
  return liste;
}

// Enregistre un événement. changements : [{ champ, avant, apres }] (modification), vide pour une création, une suppression ou un événement système.
export function journaliser(db, /** @type {{ entite: string, id?: string, libelle?: string, action: string, changements?: { champ: string, avant: string, apres: string }[], quand?: Date }} */ { entite, id = '', libelle = '', action, changements = [], quand = new Date() }) {
  const ligne = db.prepare('INSERT INTO journal (ts, jour, entite, entite_id, libelle, action, champ, avant, apres) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const ts = quand.toISOString();
  const jour = jourLocal(quand);
  const base = [ts, jour, entite, String(id), texte(libelle).slice(0, 120), action];
  if (!changements.length) ligne.run(...base, '', '', '');
  else for (const c of changements) ligne.run(...base, c.champ, c.avant, c.apres);
}

// --- Rapports ---
const ENVOYEES = new Set(['en_cours', 'entretien', 'sans_reponse', 'refuse', 'accepte']);
export const COMPTEURS = ['offres_detectees', 'offres_vues', 'offres_ecartees', 'offres_expirees', 'offres_saisies', 'candidatures_vues', 'candidatures_creees', 'candidatures_envoyees', 'changements_statut', 'entretiens', 'refus', 'acceptees', 'taches_creees', 'taches_faites', 'echanges'];

const jourDate = j => new Date(`${j}T00:00:00Z`);
const iso = d => d.toISOString().slice(0, 10);

// Lundi de la semaine d'un jour AAAA-MM-JJ
export function lundi(jour) {
  const d = jourDate(jour);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
}

// Numéro de semaine ISO 8601 (ex. 2026-S43)
export function semaineIso(jour) {
  const d = jourDate(lundi(jour));
  d.setUTCDate(d.getUTCDate() + 3); // jeudi de la semaine : il décide de l'année ISO
  const debut = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const n = Math.ceil(((d.getTime() - debut.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-S${String(n).padStart(2, '0')}`;
}

// ANCHOR: rapport par jour, par semaine (lundi à dimanche) ou par mois (période = premier jour du mois). Les actions viennent du journal, les offres détectées de la date de détection de la veille.
// Le journal n'existe que depuis sa première ligne (debut) : avant, les actions ne sont pas datées et les compteurs valent 0.
export function rapport(db, /** @type {{ du?: string, au?: string, grain?: string }} */ { du, au, grain = 'jour' } = {}) {
  const aujourdhui = jourLocal(new Date());
  if (!au) au = aujourdhui;
  if (!du) {
    const d = jourDate(au);
    if (grain === 'mois') { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 11); } else d.setUTCDate(d.getUTCDate() - (grain === 'semaine' ? 27 : 13));
    du = iso(d);
  }
  const cle = j => (grain === 'semaine' ? lundi(j) : grain === 'mois' ? j.slice(0, 8) + '01' : j);
  const lignes = new Map();
  const vide = () => Object.fromEntries(COMPTEURS.map(c => [c, 0]));
  // Toutes les périodes de l'intervalle apparaissent, même sans action
  for (let d = jourDate(du); iso(d) <= au; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = cle(iso(d));
    if (!lignes.has(k)) lignes.set(k, { periode: k, ...(grain === 'semaine' ? { semaine: semaineIso(k) } : grain === 'mois' ? { mois: k.slice(0, 7) } : {}), ...vide() });
  }
  const ajouter = (jour, compteur, n = 1) => { const l = lignes.get(cle(jour)); if (l) l[compteur] += n; };
  // NOTE: créations antérieures au statut journalisé (ligne 101) : envoyée si la candidature l'est aujourd'hui et datée du jour de création (même repli que client/src/actions.ts)
  const actuelles = new Map(db.prepare('SELECT id, statut, date FROM candidatures').all().map(c => [String(c.id), c]));

  for (const r of db.prepare('SELECT jour, entite, entite_id, action, champ, avant, apres FROM journal WHERE jour BETWEEN ? AND ?').all(du, au)) {
    if (r.entite === 'offre') {
      if (r.action === 'creation') ajouter(r.jour, 'offres_saisies');
      else if (r.champ === 'vue' && r.apres === '1') ajouter(r.jour, 'offres_vues');
      else if (r.champ === 'ignoree' && r.apres === '1') ajouter(r.jour, 'offres_ecartees');
      else if (r.champ === 'expiree' && r.apres === '1') ajouter(r.jour, 'offres_expirees');
    } else if (r.entite === 'candidature') {
      // NOTE: envoyée = créée avec un statut d'envoi, ou passée à « en cours » depuis un statut d'avant envoi
      if (r.action === 'creation') {
        ajouter(r.jour, 'candidatures_creees');
        const c = actuelles.get(r.entite_id);
        if (r.champ === 'statut' ? ENVOYEES.has(r.apres) : Boolean(c && ENVOYEES.has(c.statut) && c.date === r.jour)) ajouter(r.jour, 'candidatures_envoyees');
      } else if (r.action === 'consultation') ajouter(r.jour, 'candidatures_vues');
      else if (r.champ === 'statut') {
        if (r.apres === 'en_cours' && !ENVOYEES.has(r.avant)) ajouter(r.jour, 'candidatures_envoyees');
        ajouter(r.jour, 'changements_statut');
        if (r.apres === 'entretien') ajouter(r.jour, 'entretiens');
        else if (r.apres === 'refuse') ajouter(r.jour, 'refus');
        else if (r.apres === 'accepte') ajouter(r.jour, 'acceptees');
      }
    } else if (r.entite === 'tache') {
      if (r.action === 'creation') ajouter(r.jour, 'taches_creees');
      else if (r.champ === 'faite' && r.apres === '1') ajouter(r.jour, 'taches_faites');
    } else if (r.entite === 'echange' && r.action === 'creation') ajouter(r.jour, 'echanges');
  }
  for (const r of db.prepare('SELECT date_detection AS jour, COUNT(*) n FROM offres WHERE date_detection BETWEEN ? AND ? GROUP BY 1').all(du, au)) ajouter(r.jour, 'offres_detectees', r.n);

  const debut = db.prepare('SELECT MIN(ts) ts FROM journal').get().ts;
  return { du, au, grain, fuseau: FUSEAU(), journal_depuis: debut ?? null, periodes: [...lignes.values()] };
}

// CSV pour tableur français : séparateur point-virgule, BOM pour les accents
export function rapportCsv(r) {
  const cols = ['periode', ...(r.grain === 'semaine' ? ['semaine'] : r.grain === 'mois' ? ['mois'] : []), ...COMPTEURS];
  return '﻿' + [cols.join(';'), ...r.periodes.map(l => cols.map(c => l[c]).join(';'))].join('\n') + '\n';
}

// Événements bruts, du plus récent au plus ancien
export function evenements(db, /** @type {{ du?: string, au?: string, entite?: string, id?: string, limite?: number }} */ { du, au, entite, id, limite = 200 } = {}) {
  const where = [];
  const params = [];
  if (du) { where.push('jour >= ?'); params.push(du); }
  if (au) { where.push('jour <= ?'); params.push(au); }
  if (entite) { where.push('entite = ?'); params.push(entite); }
  if (id) { where.push('entite_id = ?'); params.push(id); }
  return db.prepare(`SELECT * FROM journal${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`).all(...params, Math.min(Math.max(Number(limite) || 200, 1), 5000));
}
