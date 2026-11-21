# Guide d'utilisation

Ce guide suit une journée de recherche d'emploi, de l'ouverture de l'application à la relance d'une candidature. Pour le détail de chaque écran, de l'API et de la base, voir la [référence complète](reference.md).

Chaque fonction qui demande une explication a un bouton « ? » à droite de son titre : il ouvre une aide courte, dans l'application.

## Le principe en 30 secondes

1. Les **offres** arrivent (synchronisation automatique ou saisie à la main) et sont triées par un score de pertinence.
2. Vous décidez pour chaque offre : la garder à l'œil (épingle), l'écarter, ou postuler.
3. Quand vous postulez, une **candidature** est créée : elle porte le statut, les tâches, les échanges et les rendez-vous.
4. L'accueil vous dit chaque jour ce qui est à faire.

Rien n'est envoyé à votre place : l'application suit et prépare, c'est vous qui envoyez.

## Votre journée type

#### 1. Ouvrir l'accueil (onglet Aujourd'hui)

- En haut, le nombre de choses à traiter aujourd'hui : relances en retard, tâches du jour, entretiens.
- Les quatre chiffres clés : à traiter, en attente de réponse, entretiens, nouvelles offres des 2 derniers jours.
- Le bouton « Actualiser » relance la synchronisation des offres. Le résumé repliable à côté indique l'état de la synchro et de l'analyse IA, avec la durée du dernier passage, une durée moyenne et le temps estimé pour les offres encore en attente d'analyse, de quoi savoir combien de temps patienter.
- Les offres épinglées vous rappellent combien de jours il reste pour agir. Le calendrier et les rendez-vous proches sont à droite.
- Plus bas : les candidatures à faire par métier, le bilan du jour, le journal du jour et les défis.

#### 2. Trier les nouvelles offres (onglet Offres)

- La liste est à gauche, la fiche à droite. Le chiffre vert est le score de pertinence : il croise vos compétences, la distance, la fraîcheur de l'annonce et, si l'analyse est active, les exigences relevées.
- Le contrat compte aussi. Dans Profil > Recherche d'offres, le bloc « Type de recherche et score » indique ce que vous cherchez : un emploi (CDI, CDD de 12 mois et plus), une alternance ou un stage. Une offre avec un autre contrat perd des points (15 par défaut) au-delà d'une distance réglable (40 km par défaut, 0 pour l'appliquer partout). En alternance ou en stage, le diplôme exigé ne baisse pas le score. En alternance, la recherche France Travail ne demande que les contrats d'apprentissage et de professionnalisation ; pour un stage, ajoutez « stage » à vos mots-clés, l'API n'a pas de filtre dédié.
- Les pastilles filtrent par métier ; « Filtres et tri » affine par zone, contrat ou non-vues. Le filtre « Nouvelles » garde les offres marquées New : détectées depuis moins de 3 jours et pas encore vues.
- Pour chaque offre, trois réponses possibles :
  - **Écarter** : elle quitte la liste (la case « Écartées » la ramène).
  - **Épingler** : vous la gardez 14 jours pour y revenir.
  - **Postuler** : vous passez aux étapes de la fiche (annonce, CV, envoi).
- Raccourcis : `v` marque l'offre comme vue, `x` signale qu'elle a expiré.
- Une offre trouvée ailleurs (autre site, bouche à oreille) s'ajoute avec le bouton « Offre ».
- Le bouton « Spontanées » propose des entreprises qui recrutent souvent, sans offre publiée (voir plus bas).

#### 3. Postuler

- La fiche d'une offre suit les étapes : Vue, Épingler, Annonce, CV, Postulé. La prochaine étape est mise en avant.
- L'onglet **CV/LM** compose un CV sur mesure à partir de votre Profil, sans rien inventer : il choisit et ordonne ce qui existe. Il peut aussi préparer une lettre de motivation.
- Vous envoyez le dossier sur le site de l'employeur ou par courriel, puis vous créez la candidature depuis l'offre : elle prend le statut voulu et garde le lien avec l'annonce.

#### 4. Suivre ses candidatures (onglet Candidatures)

- Chaque candidature a un statut : À faire, En cours, Entretien, Sans réponse, Refusé, Accepté, Écarté.
- Dans la fiche :
  - **Tâches** : la prochaine étape avec une échéance (le bouton « Relance dans 7 j » en crée une en un clic).
  - **Historique** : notez chaque échange (appel, courriel, entretien) avec ce qui s'est dit.
  - **Rendez-vous** : entretiens et appels, avec trajet et coût du déplacement si vous avez réglé vos points de départ.
  - **Contacts** : les personnes rencontrées dans cette entreprise.
  - **Informations d'envoi** : date, plateforme, version du CV utilisée.
- Les modifications s'enregistrent toutes seules environ une seconde après la dernière frappe. Le message « Non enregistré » indique la cause et propose de réessayer.

#### 5. Faire le point (Profil > Bilan)

- Le bilan compte vos actions par jour, semaine ou mois : offres triées, candidatures envoyées, échanges, tâches faites.
- Les boutons CSV et PDF produisent un justificatif de recherche d'emploi, avec la liste datée des actions menées.

## Les autres outils

#### Candidatures spontanées

Le bouton « Spontanées » de l'onglet Offres liste les entreprises à fort potentiel d'embauche autour de chez vous, pour un métier et un rayon choisis. Pour chacune : **Garder**, **Contactée** ou **Écarter**. Votre décision est mémorisée par entreprise. Cette fonction demande d'activer La Bonne Boite (voir « Configuration »).

#### Marché local

Sur l'accueil, la carte « Marché local » compare pour chaque métier le nombre d'offres au nombre de demandeurs inscrits dans votre département. Elle aide à voir où se concentrer : une barre longue et le mot « Porteur » signalent un métier où il y a plus d'offres que de demandeurs ; « Très disputé » signale l'inverse. La petite courbe montre la tendance sur 8 trimestres. C'est un ordre de grandeur, pas une promesse d'embauche. Cette carte demande d'activer le Marché du travail (voir « Configuration »).

#### Profil

Votre parcours (expériences, formations, compétences avec niveaux, projets, langues) vit dans l'onglet Profil. C'est la source de tous vos CV : plus il est complet et précis, meilleurs sont les CV et le score des offres. Vous pouvez importer l'export officiel LinkedIn pour le remplir.

Le menu à gauche du Profil range ses parties en trois étapes, dans l'ordre du travail (sur téléphone, une liste déroulante le remplace) :

- **Renseigner** : Parcours, Coordonnées, Compétences, Projets, Diplômes et certifications, Titres enseignés.
- **Filtrer et optimiser** : Poids des puces de chaque expérience par CV visé, Recherche d'offres (zones, mots-clés, mots et contrats exclus, employeurs surveillés, type de recherche emploi, alternance ou stage, métiers recherchés), Trajets et revenu (points de départ et leur carte, zone de recherche, coût du trajet, salaire et TJM attendus), Modèles CV et lettre, Synthèse et badges.
- **Autre** : To-do et veille, Bilan.

Le bloc « Métiers recherchés » de Recherche d'offres choisit, dans un catalogue de neuf métiers, ceux que vous visez, du plus important au moins important. Le premier ajoute 14 points au score des offres, puis un de moins à chaque rang. Les colonnes de « Candidatures à faire », les pastilles de l'onglet Offres, les CV et lettres par métier, les poids des puces et le marché local suivent cette liste. Une offre d'un métier absent de la liste est rangée dans « Autre ». Sans métier choisi, tout le catalogue est proposé et aucun métier ne compte dans le score.

Un métier absent du catalogue se crée avec le bouton « Créer un métier » : un nom, l'intitulé à afficher sur le CV, les mots à chercher dans le titre des annonces et, si besoin, des mots à exclure, un code ROME et une couleur. Un mot est cherché en début de mot, sans tenir compte des accents ni des majuscules : « boulang » trouve boulanger et boulangère. L'aperçu affiche combien de vos offres seraient reconnues, avec quelques titres d'exemple. Le métier rejoint ensuite la liste comme les autres, puis « Enregistrer les métiers » valide le tout. Une offre dont le titre contient ses mots est rangée dans ce métier, pour ce profil seulement, avant les métiers du catalogue. Les boutons crayon et corbeille de la ligne modifient ou suppriment le métier créé (20 au plus par profil).

> [!NOTE]
> Sans code ROME, un métier créé n'apparaît ni dans le marché local ni dans les candidatures spontanées, qui interrogent France Travail par ce code.

#### Plusieurs profils

Une même installation peut suivre plusieurs recherches, par exemple un emploi et une alternance, ou la recherche d'une autre personne. Le bouton de profil de la barre du haut (pastille de couleur, nom affiché quand la barre passe sur deux lignes) ouvre la liste des profils :

- Cliquer un profil l'ouvre : la page se recharge avec ses candidatures, son parcours, ses CV, ses lettres, ses contacts et ses réglages.
- « Nouveau profil » crée un profil vide et l'ouvre. Réglez ensuite sa recherche dans Profil > Recherche d'offres et sa zone dans Profil > Trajets et revenu.
- Le crayon renomme un profil ou change sa couleur, la corbeille le supprime avec tout ce qui lui appartient, après confirmation. Le profil par défaut et le profil ouvert ne se suppriment pas.

Les offres trouvées sont communes, mais chaque profil a son propre état (vue, écartée, épinglée, note). Le profil choisi est gardé par le navigateur, sans mot de passe.

> [!WARNING]
> Les profils ne sont pas protégés : toute personne qui ouvre l'application peut passer d'un profil à l'autre.

#### Contacts et Agenda

Les contacts (recruteurs, anciens collègues) se relient aux offres et aux candidatures. L'agenda affiche vos rendez-vous, et peut se synchroniser avec Google Agenda si vous le connectez dans Admin.

#### Admin

Réglages globaux de l'application, dans l'ordre du chemin des offres : sources d'offres, analyse par l'IA, plateformes qui obligent à recréer un compte, puis connexion Google Agenda. Les réglages qui vous sont propres (recherche, trajets, revenu attendu) sont dans le Profil, étape Filtrer et optimiser.

## Configuration

Les réglages techniques passent par le fichier `.env` à la racine, jamais versionné. La zone de recherche se règle dans le Profil, pas dans le `.env`. Chaque variable est commentée dans `.env.example`.

| Je veux... | Variables |
|------------|-----------|
| Récupérer les offres de France Travail | `FT_CLIENT_ID`, `FT_CLIENT_SECRET` |
| Activer les candidatures spontanées | `FT_SCOPE_BONNEBOITE` |
| Activer la carte Marché local | `FT_SCOPE_MARCHE` |
| Copier la base chaque jour dans un autre dossier | `SUIVI_EXPORT_DIR` |
| Lancer votre propre script de sauvegarde au démarrage | `SUIVI_SAUVEGARDE_SCRIPT` |
| Analyser les annonces avec un modèle local | `ANALYSE_PROVIDER` et suivantes |

Après toute modification du `.env`, relancez le serveur.

## Sauvegardes et restauration

- Au démarrage, le serveur copie `suivi.db` dans `data/backups/` (une copie par jour).
- Avant une mise à jour de la structure de la base, une copie supplémentaire est faite automatiquement.
- Pour restaurer : arrêtez le serveur, remplacez `suivi.db` par la copie voulue, relancez.

## Mettre à jour l'application

Les nouveautés de chaque version sont décrites dans le [journal des versions](../CHANGELOG.md).

```bash
git pull
npm install
npm run build
npm start
```

Si la nouvelle version change la structure de la base, la mise à jour se fait seule au démarrage, après une copie de sauvegarde dans `data/backups/`. Vos données ne sont jamais effacées.

## Questions fréquentes

**Une offre que je connais n'apparaît pas.** Elle n'est peut-être pas dans la zone ou les mots-clés réglés dans Profil > Recherche d'offres, ou elle a été écartée : cochez « Écartées » dans les filtres. Sinon, ajoutez-la à la main avec « Offre ».

**« Serveur injoignable ».** Le serveur n'est pas démarré (`npm start`) ou tourne sur un autre port.

**Une nouvelle fonction n'apparaît pas après une mise à jour.** Le serveur tourne sur l'ancien code : arrêtez-le et relancez-le, puis rechargez la page.

**Je veux voir l'application avec des données d'exemple.** Lancez `npm run demo` : une base fictive jetable est utilisée, votre vraie base n'est pas touchée.

**Où sont mes données ?** Dans `suivi.db` à la racine. Elles ne quittent jamais votre ordinateur, sauf source d'offres, agenda ou modèle distant que vous configurez vous-même.
