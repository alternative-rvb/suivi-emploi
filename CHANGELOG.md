# Journal des versions

Toutes les évolutions notables de l'application sont décrites ici, de la plus récente à la plus ancienne. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et la numérotation suit le [versionnage sémantique](https://semver.org/lang/fr/) :

- correctif : 1.0.1 ;
- nouvelle fonction compatible : 1.1.0 ;
- changement qui demande une action de votre part : 2.0.0.

Pour mettre à jour votre installation, voir la section « Mettre à jour l'application » du [guide d'utilisation](docs/guide-utilisation.md).

## [Non publié]

## [1.3.2] - 2026-11-12

### Ajouté

- README : un schéma du parcours d'une candidature, de l'arrivée des offres jusqu'au bilan.

## [1.3.1] - 2026-11-10

### Corrigé

- Documentation de référence : la section du schéma de la base renvoie vers `SCHEMA_SQL` de `lib/offres.mjs` au lieu d'un fichier absent du dépôt.

## [1.3.0] - 2026-11-10

### Corrigé

- Analyse des annonces : « diplômé ou autodidacte » n'est plus compté comme un diplôme exigé, et les logiciels que l'annonce ne cite pas sont écartés. Les annonces sont réanalysées au prochain passage.
- Écrans moyens (de 861 à 1240 px de large) : la barre du haut ne déborde plus et le logo n'est plus écrasé, les onglets passent sur une seconde ligne ; les colonnes collantes restent sous la barre.
- Admin : une erreur au lancement de l'analyse par l'IA s'affiche dans sa carte, et non plus sous Sources d'offres. Au Profil, les liens d'une partie vers une autre (Poids des puces, Parcours, Coordonnées) ramènent en haut de page.

### Modifié

- Onglet CV et lettre : l'historique des versions affiche l'heure et l'auteur (algorithme, modèle local, Claude ou vous), et se place sous le contrôle, à côté de l'aperçu.
- Onglet CV et lettre : les cartes générique et sur mesure de la colonne de gauche se replient et se déplient, côté CV comme côté lettre. La carte en cours est dépliée à l'ouverture et à chaque changement, l'autre repliée, et chacune garde un résumé de son choix (cible, métier, offre) une fois repliée.
- Profil > Modèles CV et lettre : l'aperçu du haut du CV garde la mise en page de l'onglet CV et lettre, réduit à la place disponible, et passe sous le formulaire sur les écrans moyens. Le menu latéral du Profil sépare ses trois groupes par un petit trait.
- Profil : menu latéral groupé en trois étapes numérotées (Renseigner, Filtrer et optimiser, Autre), toutes les parties visibles et accessibles d'un clic ; sur téléphone, une liste déroulante le remplace. Recherche d'offres explique en tête le rôle des listes et la marche à suivre.
- Les réglages de recherche (zones, mots-clés, mots et contrats exclus, employeurs surveillés) et les suggestions de l'IA pour ces listes passent de l'onglet Admin à Profil > Recherche d'offres. Les trajets et le revenu attendu (points de départ, coût du trajet, salaire et TJM) suivent le même chemin, vers Profil > Trajets et revenu. Admin ne garde que les réglages globaux de l'application, rangés dans l'ordre du chemin des offres : sources, analyse par l'IA, plateformes à compte obligatoire, puis Google Agenda.
- Le poids des puces a sa propre partie, Profil > Poids des puces, avec toutes les expériences sur une page, au lieu d'une grille dans le formulaire de chaque expérience.
- Admin : la section « Instructions envoyées au modèle » résume ce que fait le modèle local à chaque étape (analyse des annonces, compétences de l'offre, CV, lettre, profil vu par un RH, suggestions pour la recherche) et dans quel écran.
- Analyse des annonces en cours : l'état raconte chaque étape (démarrage du modèle, offre lue et depuis quand, résultat de la précédente, temps restant estimé, origine du passage) au lieu d'un simple compteur.

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
