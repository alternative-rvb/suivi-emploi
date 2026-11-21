# Journal des versions

Toutes les évolutions notables de l'application sont décrites ici, de la plus récente à la plus ancienne. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et la numérotation suit le [versionnage sémantique](https://semver.org/lang/fr/) :

- correctif : 1.0.1 ;
- nouvelle fonction compatible : 1.1.0 ;
- changement qui demande une action de votre part : 2.0.0.

Pour mettre à jour votre installation, voir la section « Mettre à jour l'application » du [guide d'utilisation](docs/guide-utilisation.md).

## [Non publié]

## [1.4.0] - 2026-11-21

### Ajouté

- Accueil : le résumé de la synchro et de l'analyse IA affiche la durée du dernier passage et une durée moyenne (10 dernières synchros, 50 dernières analyses du modèle), avec le temps estimé pour les offres encore à analyser. Le temps restant apparaît dès la première offre d'un passage.
- Profil > Recherche d'offres : un bloc « Type de recherche et score » pour chercher un emploi, une alternance ou un stage. Les offres dont le contrat ne correspond pas perdent des points au score, sans être masquées, et le nombre de points et la distance à partir de laquelle ils s'appliquent se règlent.
- En mode alternance ou stage, le diplôme exigé par une annonce ne baisse plus le score.
- En mode alternance, la synchronisation France Travail ne cherche que les contrats d'apprentissage et de professionnalisation, et le libellé du contrat garde cette nature.
- Les contrats d'apprentissage, de professionnalisation et les stages sont reconnus dans le libellé du contrat.
- Plusieurs profils dans une même installation, par exemple pour chercher un emploi et une alternance, ou pour qu'une autre personne suive sa recherche : chaque profil a ses candidatures, son parcours, ses lettres, ses CV et ses réglages, les offres restent communes. Le bouton de profil de la barre du haut (pastille de couleur) ouvre la liste des profils : changer de profil, en créer, renommer ou supprimer un profil (avec confirmation). Les routes acceptent aussi le préfixe `/api/p/<profil>/`.
- Option `--profil` des commandes `npm run cv`, `npm run analyse` et `npm run rapport`.
- La démonstration (`npm run demo`) contient deux profils fictifs, emploi et alternance.
- Profil > Trajets et revenu : un bloc « Zone de recherche » règle la zone proche, les points de départ des distances, les départements à charger et le lieu bonus, pour chaque profil. Les points de départ peuvent être repris des trajets.
- La synchronisation cherche aussi les offres de chaque profil qui a ses propres réglages de recherche.
- Profil > Recherche d'offres : un bloc « Métiers recherchés » choisit, dans un catalogue de neuf métiers (formateur digital, web design, développement web, comptabilité, marketing digital, ressources humaines, commercial, assistanat administratif, logistique), ceux que vise chaque profil, dans l'ordre. L'ordre donne les points du score ; les colonnes de « Candidatures à faire », les filtres des offres, les CV, les lettres, les poids des puces et le marché local suivent cette liste.
- Métiers recherchés : le bouton « Créer un métier » ajoute un métier hors catalogue (nom, intitulé du CV, mots à chercher dans le titre des annonces, mots à exclure, code ROME facultatif, couleur), avec un aperçu des offres reconnues avant l'enregistrement. Les offres dont le titre contient ces mots sont rangées dans ce métier pour ce profil seulement ; un métier créé se modifie ou se supprime depuis la même liste. Sans code ROME, il n'apparaît pas dans le marché local ni dans les candidatures spontanées.

### Modifié

- Barre du haut : l'onglet Profil affiche votre prénom (premier mot du nom affiché des coordonnées) et le sélecteur de profil affiche le nom du profil, bornés à 12 caractères. Admin n'affiche plus que son icône sur une ligne, et les icônes des onglets se masquent entre 1241 et 1359 px pour que tout tienne.
- Accueil : le bouton Actualiser garde son libellé pendant la synchro (il est seulement désactivé), l'état restant indiqué par le résumé à côté. Le chargement de la carte Marché local reprend la forme de la carte.
- À la première ouverture, la base passe en version 31 : un profil « Mon profil » est créé, toutes les données existantes lui sont rattachées et rien ne change dans l'usage. Une copie de la base est faite avant dans `data/backups/`.
- Puis en version 32 : les offres restent communes, mais ce que chaque profil en fait (vue, écartée, épinglée, note, zone proche) lui est propre. L'état actuel des offres est repris pour le profil par défaut, après une copie de la base.
- La zone du `.env` (`SUIVI_DEPARTEMENT_PROCHE`, `SUIVI_VILLES_PROCHES`, `SUIVI_ORIGINES`, `SUIVI_DEPARTEMENTS_DISTANCE`, `SUIVI_LIEU_BONUS`) est recopiée une fois dans la zone du profil par défaut, puis se règle dans l'interface.
- Changer les zones ou les mots exclus d'un profil retire les offres concernées de ce profil seulement.
- Puis en version 33 : une offre peut recevoir n'importe quel métier du catalogue, les offres rangées dans « Autre » sont reclassées, et le profil par défaut d'une base existante garde ses quatre métiers d'avant. Une offre d'un métier que le profil ne vise pas reste affichée dans « Autre ». Copie de la base avant la migration.
- Profil > Trajets et revenu regroupe désormais la carte : les points de départ s'affichent au-dessus d'une carte qui les montre et les nomme, puis viennent la zone de recherche, le coût du trajet et le revenu attendu. La partie « Carte » du menu Autre disparaît.
- Zone de recherche : le département proche, les départements des distances, les points de départ du score et le lieu bonus se choisissent dans des listes (départements par leur nom, points de départ déjà enregistrés), une saisie libre restant possible.
- Trajets et revenu : le carburant se choisit dans une liste et les champs sont alignés en grille, libellé au-dessus.
- Profil > Recherche d'offres commence par « Ce que vous cherchez » (type de recherche et score, métiers recherchés), puis « Offres reçues » (suggestions de l'IA et les cinq listes).
- Profil > Diplômes et certifications et Titres enseignés : chaque ligne devient une fiche lisible, sans tableau qui déborde.
- Profil > Compétences : chaque compétence s'affiche en carte (niveaux, poids, projets, contexte), sans colonnes écrasées.
- Profil > Parcours : les champs Missions et Résumé grandissent avec leur texte.

### Corrigé

- Onglet Offres : le filtre « Nouvelles » montre exactement les offres marquées New (détectées depuis moins de 3 jours et pas encore vues), au lieu des seules offres du jour. L'accueil compte les nouvelles avec la même règle.

## [1.3.4] - 2026-11-12

### Ajouté

- README : un sommaire cliquable sous l'introduction.

## [1.3.3] - 2026-11-12

### Corrigé

- README : les traits du schéma du parcours restent visibles sur fond sombre.

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
