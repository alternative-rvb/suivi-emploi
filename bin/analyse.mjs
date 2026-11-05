// Usage : npm run analyse -- [--limite N] [--refaire] [--rapport]
// Analyse les annonces sans analyse à jour avec le fournisseur choisi dans le .env (ANALYSE_PROVIDER), puis affiche un rapport.
// --rapport : pas d'appel au modèle, seulement les notes par groupe (offres suivies, ignorées, autres) pour vérifier que la note va dans le bon sens.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { etatAnalyse, fournisseurActif, lancerAnalyse, lireAnalyse, offresAAnalyser, ouvrirAnalyses } from '../lib/analyse/index.mjs';
import { ouvrirBase } from '../lib/offres.mjs';
import { chargerEnv } from '../lib/sync.mjs';

// NOTE: les commandes sont dans bin/ ; la base, le .env et data/ sont à la racine du projet
const ici = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = nom => args.includes(`--${nom}`);
const valeur = nom => args[args.indexOf(`--${nom}`) + 1];

chargerEnv(ici);
const db = ouvrirBase(join(ici, 'suivi.db'));
ouvrirAnalyses(db);

function rapport() {
  const lignes = db.prepare(`SELECT o.ignoree, o.categorie, a.reponses,
      (SELECT c.statut FROM candidatures c WHERE c.offre_id = o.id_offre LIMIT 1) AS statut
    FROM offres o JOIN analyses a ON a.id_offre = o.id_offre`).all();
  const groupes = {};
  for (const l of lignes) {
    const note = lireAnalyse(l.reponses)?.note;
    if (note == null) continue;
    const nom = l.statut ? `suivie (${l.statut})` : l.ignoree ? 'ignorée' : 'autre';
    (groupes[nom] ??= []).push(note);
  }
  console.log(`Offres analysées : ${lignes.length}, à faire : ${offresAAnalyser(db).length}`);
  for (const [nom, notes] of Object.entries(groupes).sort()) {
    const moy = notes.reduce((t, n) => t + n, 0) / notes.length;
    console.log(`  ${nom.padEnd(24)} ${String(notes.length).padStart(4)} offre(s)  moyenne ${moy.toFixed(1)}  min ${Math.min(...notes)}  max ${Math.max(...notes)}`);
  }
}

if (!option('rapport')) {
  let f;
  try {
    f = fournisseurActif();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  if (!f) {
    console.error('Analyse désactivée : ajouter ANALYSE_PROVIDER=ollama dans le .env (voir .env.example).');
    process.exit(1);
  }
  const limite = Number(valeur('limite')) || 0;
  console.log(`${f.nom}, modèle ${f.modele}, ${offresAAnalyser(db, { refaire: option('refaire') }).length} offre(s) à analyser${limite ? ` (limite ${limite})` : ''}.`);
  const suivi = setInterval(() => process.stdout.write(`\r  ${etatAnalyse.faits}/${etatAnalyse.total}  `), 2000);
  const r = await lancerAnalyse(db, 'ligne de commande', { fournisseur: f, limite, refaire: option('refaire') });
  clearInterval(suivi);
  console.log(`\r${r.ok ? `Terminé : ${r.faits} analysée(s), ${r.echecs} échec(s), ${(r.duree_ms / 1000).toFixed(0)} s.` : `Échec (${r.code}) : ${r.erreur}`}`);
  if (!r.ok) process.exitCode = 1;
}
rapport();
