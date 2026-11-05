# Journal des versions

Toutes les évolutions notables de l'application sont décrites ici, de la plus récente à la plus ancienne. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et la numérotation suit le [versionnage sémantique](https://semver.org/lang/fr/) :

- correctif : 1.0.1 ;
- nouvelle fonction compatible : 1.1.0 ;
- changement qui demande une action de votre part : 2.0.0.

Pour mettre à jour votre installation, voir la section « Mettre à jour l'application » du [guide d'utilisation](docs/guide-utilisation.md).

## [Non publié]

## [1.2.1] - 2026-11-05

#### Ajouté

- Fichier `AGENTS.md` pour installer ou modifier le projet avec un assistant de code : étapes, vérifications, ce qu'il doit demander (zone, clés) et ce qu'il ne doit jamais lire ni exposer.

## [1.2.0] - 2026-11-05

#### Ajouté

- Sauvegarde complète au démarrage : la variable `SUIVI_SAUVEGARDE_SCRIPT` lance le script de sauvegarde de votre choix (par exemple une copie du projet vers un dossier synchronisé).
- Politique de sécurité (`SECURITY.md`) : comment signaler une faille de façon privée.

## [1.1.0] - 2026-11-05

#### Ajouté

- Pied de page discret avec un lien vers le portfolio de l'auteur et un lien vers le code source sur GitHub.

#### Modifié

- Les commandes en ligne (`sync`, `analyse`, `rapport`, `cv`, `demo`) sont rangées dans le dossier `bin/`. Elles se lancent toujours avec `npm run ...`, sans changement pour vous.
- La distance des offres dans le score se règle dans le `.env` (`SUIVI_ORIGINES`, `SUIVI_DEPARTEMENTS_DISTANCE`, `SUIVI_LIEU_BONUS`) au lieu d'être fixée dans le code. Sans ces lignes, le score garde la règle « proche » tout ou rien : ajoutez `SUIVI_ORIGINES` pour retrouver les distances.
- Documentation : prérequis détaillés (outils obligatoires et facultatifs, conseils pour Windows et WSL) et tableau de ce qui fonctionne quand un service manque.

#### Supprimé

- Le double clic sur le logo (son de corne, tremblement et pluie de billets) : le son n'avait pas de licence connue.

## [1.0.0] - 2026-11-05

Première version publique.

#### Ajouté

- Offres d'emploi récupérées depuis l'API France Travail, triées par métier et par un score de pertinence (compétences, distance, fraîcheur), avec épingle de 14 jours, offres vues, écartées ou expirées, et saisie manuelle des offres trouvées ailleurs.
- Candidatures : statuts, tâches et relances, historique des échanges, contacts, rendez-vous, trajets et coût du déplacement, exports CSV, XML et PDF.
- Profil : parcours, compétences avec niveaux, projets, diplômes, langues, import de l'export LinkedIn.
- CV sur mesure par métier ou par offre, composé à partir du Profil et contrôlé contre un CV de référence, exporté en PDF ; lettres de motivation.
- Accueil : ce qui est à faire aujourd'hui, offres épinglées, chiffres clés, journal du jour, défis et badges.
- Bilan de la recherche par jour, semaine ou mois, avec justificatif PDF des actions menées.
- Candidatures spontanées : entreprises qui recrutent souvent autour de chez vous (API La Bonne Boite, facultative).
- Marché local : offres pour 100 demandeurs par métier dans votre département, avec tendance sur 8 trimestres (API Marché du travail, facultative).
- Agenda, avec synchronisation Google Agenda facultative.
- Analyse des annonces par un modèle de langage local (facultative).
- Démonstration sur une base fictive : `npm run demo`.
- Sauvegarde quotidienne automatique de la base.
