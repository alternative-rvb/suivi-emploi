# Suivi emploi : référence complète

Ce document détaille tout le fonctionnement (utilisation, API, base de données). Pour démarrer, lisez d'abord le [README](../README.md).

Votre carrière à porter de clics : une application locale pour suivre ses offres d'emploi et ses candidatures, de la première lecture d'une annonce jusqu'à la réponse de l'employeur.

Tout tourne sur votre machine, sur `127.0.0.1`. Aucune donnée ne quitte l'ordinateur, sauf si vous configurez vous-même une source d'offres, Google Agenda ou un modèle de langage distant.

## Fonctionnalités

- Offres : récupération auprès de l'API France Travail (un webhook n8n peut servir de secours), classement par catégorie, score de pertinence, filtres, épingle de 14 jours, marquage vue, écartée ou expirée, offres saisies à la main.
- Parcours d'une offre en étapes : Vue, Épingler, Annonce, CV sur mesure, Postulé, avec partage de l'annonce et rappel quand la plateforme oblige à recréer un compte.
- Qualifications relevées dans l'annonce par un modèle de langage local (facultatif), comparées aux compétences du Profil.
- Candidatures : statuts, tâches et relances, échanges, contacts, rendez-vous, trajets et coût du déplacement.
- Profil : parcours, compétences avec niveaux, projets, diplômes, import de l'export LinkedIn.
- CV sur mesure par offre, contrôlé contre un CV de référence, exporté en PDF.
- Agenda : synchronisation facultative avec Google Agenda.
- Bilan et rapports par jour, semaine ou mois, journal de toutes les actions, défis et badges pour garder le rythme.
- Exports CSV, XML et PDF.

## Stack

| Couche | Choix |
|--------|-------|
| Runtime | Node.js 24 ou plus (modules ES) |
| Base de données | SQLite via le module intégré `node:sqlite`, fichier `suivi.db` |
| Serveur | `node:http`, sans framework, API JSON minimale |
| Interface | React 19, TypeScript et Vite, CSS maison (variables, thème clair et sombre), police Inter locale |
| Typage | TypeScript pour l'interface, JSDoc vérifié par `tsc` pour le serveur (`npm run typecheck`), types de données dans `types.d.ts` |
| Markdown | react-markdown et remark-gfm (notes, conseils, to-do) |
| Export PDF | jsPDF et jspdf-autotable (chargés à la demande) |
| Export CSV et XML | Générés dans le navigateur, sans dépendance |
| Développement | `concurrently` pour lancer le serveur et Vite ensemble |

## Prérequis

| Outil | Obligatoire ? | Rôle | Vérifier |
|-------|---------------|------|----------|
| Node.js 24 ou plus | Oui | Serveur, SQLite intégré (`node:sqlite`), construction de l'interface | `node -v` |
| npm (livré avec Node) | Oui | Installation des dépendances et commandes `npm run ...` | `npm -v` |
| git | Conseillé | Récupérer le projet et ses mises à jour (`git pull`) | `git --version` |
| `pdftotext` (paquet `poppler-utils`) | Non | Lire le CV de référence dans l'onglet CV | `pdftotext -v` |
| Ollama ou un serveur compatible OpenAI | Non | Analyse des annonces par un modèle de langage | voir `.env.example` |

Systèmes : l'application est développée et testée sous Linux (Ubuntu) et sous Windows avec WSL2. Sous Windows, WSL2 est la voie recommandée.

Pour installer Node 24 sans toucher au Node du système, on utilise [nvm](https://github.com/nvm-sh/nvm) : `nvm install 24`, puis `nvm use 24` dans le dossier du projet.

Éviter de placer le dossier dans un dossier synchronisé (Dropbox, cloud personnel) ou sur un partage réseau : `node_modules/` contient de nombreux petits fichiers et SQLite gère mal les verrous de fichier.

#### Windows et WSL : le piège du double npm

Quand Node est installé à la fois sous Windows et dans WSL, le `npm` de Windows peut passer devant celui de WSL (le `PATH` de Windows est ajouté à celui de WSL). Symptômes : `sh: 1: concurrently: not found`, ou un `node_modules` abîmé.

- Vérifier : `which npm` doit donner un chemin Linux (par exemple `~/.nvm/...`), jamais un dossier du disque Windows monté dans WSL.
- Corriger pour la session : `source ~/.nvm/nvm.sh`, puis relancer la commande.
- Corriger durablement : charger nvm dans `~/.bashrc` ou `~/.zshrc` (l'installateur de nvm le propose).
- Ne jamais lancer `npm install` ni le serveur depuis Windows sur un dossier WSL : SQLite gère mal les verrous à travers le partage réseau qui relie Windows à WSL.

## Ce qui marche sans quoi (modes dégradés)

L'application démarre toujours, même sans configuration. Chaque service manquant désactive une fonction précise, avec un message qui donne la cause ; le reste fonctionne.

| Si ceci manque ou ne répond pas | Ce qui se passe | Solution de repli |
|---------------------------------|-----------------|-------------------|
| Fichier `.env` | Aucune synchronisation des offres | Offres saisies à la main (bouton « Offre ») ; tout le suivi fonctionne |
| Clés France Travail refusées ou API en panne | Synchronisation impossible, cause affichée dans l'onglet Offres | Secours n8n s'il est configuré (`SUIVI_PROVIDERS`), sinon les offres déjà en base restent affichées |
| Accès Internet | Pas de nouvelles offres, ni de trajets par la route, ni de carte | Offres en base, distances estimées à vol d'oiseau majorées de 30 % |
| Service d'itinéraire (OSRM) | Pas de distance ni de durée par la route | Distance à vol d'oiseau majorée de 30 %, marquée « estimée » |
| `pdftotext` | Le CV de référence ne peut pas être lu | Le CV se compose et s'exporte quand même, sans contrôle contre la référence |
| Modèle de langage (Ollama) | Pas d'analyse des annonces | Score de pertinence calculé sans les exigences relevées |
| Google Agenda non connecté | Pas de synchronisation de l'agenda | Agenda local de l'application |
| `FT_SCOPE_BONNEBOITE` ou `FT_SCOPE_MARCHE` | Pas de candidatures spontanées ni de carte Marché local | Fonction désactivée, avec un message qui indique la variable à renseigner |
| Serveur arrêté | Interface injoignable | `npm run cv` produit un CV en PDF directement depuis `suivi.db` |
| `SUIVI_EXPORT_DIR` absent | Pas de copie externe de la base | Sauvegarde quotidienne locale dans `data/backups/`, toujours active |

## Installation

```bash
npm install
```

Copier ensuite `.env.example` vers `.env` et renseigner les clés de la source d'offres choisie (voir « Mettre à jour les offres »), puis construire l'interface :

```bash
cp .env.example .env
npm run build
```

`build` construit l'interface dans `dist/`. La première synchronisation remplit les offres.

## Lancer l'application

#### Développement

```bash
npm run dev
```

Lance le serveur d'API (port 3000, relancé à chaque modification de `server.mjs`) et Vite (port 5173, rechargement à chaud). Ouvrir http://localhost:5173. Si cette adresse ne répond pas depuis Windows alors que le serveur tourne, le port est sans doute dans une plage réservée par Hyper-V (`netsh interface ipv4 show excludedportrange protocol=tcp`). Cause habituelle : la valeur `MaxUserPort` sous `HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters`, posée par exemple par l'option de performance de l'installateur Nmap, qui étend les ports dynamiques à 1024-65534. En PowerShell administrateur, supprimer cette valeur, lancer `netsh int ipv4 set dynamicport tcp start=49152 num=16384` (et la même chose pour `ipv6`), puis redémarrer Windows.

#### Usage normal

```bash
npm run build
npm start
```

Le serveur sert l'interface construite et l'API sur http://localhost:3000. Le port se change avec la variable `PORT`. Arrêt avec `Ctrl+C`.

Un lien direct vers un onglet fonctionne avec un fragment : `#auj`, `#offres`, `#cand`, `#cv`, `#profil` ou `#admin`.

La barre d'onglets compte deux groupes : le flux de travail (Aujourd'hui, Offres, Candidatures, CV, Contacts, Agenda) et, à droite, Profil et Admin. Dans le Parcours, une étiquette de compétence ouvre Profil > Compétences avec la recherche remplie.

## Utilisation

#### Onglet Aujourd'hui

La première carte, Candidatures à faire, présente une colonne par métier (comptabilité, formateur digital, web design, développement web) avec les trois offres actives (ni écartées, ni expirées, ni déjà suivies) les mieux notées par le score de pertinence, la plus récente d'abord à score égal. Le compteur donne les nouvelles offres du jour, au total et par métier, marquées Nouvelle dans la liste. Un clic ouvre l'offre. Le bilan du jour sépare les offres et les candidatures, le journal du jour a sa propre carte, les défis et la progression viennent en dernier.

#### Profil > Bilan

Rapport d'activité par jour, semaine ou mois (par défaut 14 jours, 4 semaines ou 12 mois), intervalle réglable avec les champs Du et Au. Les totaux sont regroupés en Offres, Candidatures (vues, créées, envoyées, statuts...) et Tâches. Un graphique en colonnes empilées montre les actions par période (offres triées, candidatures envoyées, échanges, tâches faites ; offres détectées dans l'infobulle), à partir du début du journal, puis le tableau donne une ligne par période. Une candidature compte comme envoyée quand elle est créée avec un statut d'envoi ou passe à « En cours » ; pour les créations antérieures au statut journalisé, quand elle est envoyée et datée du jour de sa création. Boutons CSV (tableur, point-virgule) et PDF (A4 paysage, totaux en pied).

Dessous, la carte Actions menées liste toutes les actions de recherche d'emploi tirées du journal, en arborescence : une ligne « date - numéro d'offre - résumé » (intitulé et employeur courts, numéro copiable, absent pour une offre saisie à la main, plateforme indiquée hors France Travail ; actions sur l'offre suivie et sur sa candidature réunies), puis ses actions en retrait avec l'heure. Ce qui ne touche aucune offre (profil, CV, tâches globales) est rangé dans « Autres actions ». Pastilles de filtre par rubrique (Candidatures, Échanges, Tâches, Offres, CV, Profil), bouton Actions CSV pour la liste affichée, et le PDF reprend cette liste après les compteurs (justificatif de recherche). Les phrases sont les mêmes que celles du journal du jour de l'accueil.

#### Onglet Candidatures

- Chiffres clés, blocs Conseils et To-do en Markdown (repliables et modifiables).
- Filtres par statut (À faire, En cours, Entretien, Sans réponse, Refusé, Accepté, Écarté), recherche, tri par date et filtre "Prioritaires seulement" (intérêt important).
- Ajout, modification, suppression. Les notes acceptent le Markdown (gras, listes, liens cliquables) avec aperçu.
- Offre France Travail liée : dans la fenêtre de candidature, le champ "Offre France Travail liée" propose des suggestions d'après l'entreprise et le poste, et permet de chercher une offre par titre, entreprise, ville ou numéro. On peut lier, changer ou retirer l'offre. Une offre déjà liée à une autre candidature apparaît grisée. La carte d'une candidature liée porte la mention "Offre FT" et affiche l'offre avec un lien vers sa fiche.
- Exports CSV, XML et PDF.
- Enregistrement automatique environ une seconde après la dernière modification. L'interface n'envoie que les champs modifiés, candidature par candidature : une modification faite en parallèle par l'API n'est jamais écrasée. Au retour sur la fenêtre du navigateur, les changements faits côté serveur sont rechargés, sauf si des modifications attendent encore d'être enregistrées.
- Le message "Non enregistré" indique la cause (serveur arrêté, valeur refusée) et propose "Réessayer". Si le serveur est injoignable, un nouvel essai a lieu toutes les 10 secondes. Une candidature supprimée par l'API pendant qu'on la modifie est recréée, une candidature créée des deux côtés sous le même identifiant garde la version du serveur.

#### Onglet Offres

- Le bouton "Actualiser", en haut de l'accueil, relance la synchronisation, avec un indicateur de chargement, le résultat ("N nouvelle(s) offre(s)") et, à côté, le résumé repliable de la récupération des offres et de l'analyse IA. Les offres déjà en base restent affichées.
- Le bouton "Offre", à côté du champ de recherche, saisit une offre à la main.
- Filtres par catégorie, zone, type de contrat, recherche libre et offres écartées.
- La fiche d'une offre propose un parcours en étapes reliées par un trait : Vue, Épingler (optionnel), Annonce, CV sur mesure, Postulé. La prochaine étape est mise en avant, les étapes faites sont cochées, et Expirée, Écarter et Partager (feuille de partage du système, sinon copie du lien de l'annonce) restent à part, en icônes seules quand la place manque. Comme France Travail renvoie le plus souvent vers le site de l'employeur ou une autre plateforme, un lien « Postuler sur le site » apparaît une fois le CV fait, avec la plateforme saisie dans « Postuler via » et un rappel quand elle n'a jamais servi.
- Le bouton Suivre crée une candidature au statut "À faire", reliée à l'offre par son numéro.
- Le bouton d'écartement retire l'offre de la liste, la case "Écartées" la fait réapparaître.
- "Marquer comme vue" (raccourci `v`) estompe l'offre dans la liste, le filtre "Non vues" ne garde que les autres. Le filtre "Nouvelles" ne garde que les offres détectées aujourd'hui (le compteur des nouvelles de l'accueil y mène).
- "Expirée" (raccourci `x`) signale une annonce qui n'est plus disponible : elle quitte la liste, la case "Expirées" la fait réapparaître.

#### Épingle d'offre

Le marque-page d'une carte d'offre (ou le bouton Épingler de la fiche) garde l'offre 14 jours à traiter : elle est protégée de la purge, le filtre Épinglées la retrouve, et le bloc Offres épinglées de l'accueil la rappelle, la plus urgente en tête. Une épingle ne remonte jamais une offre en tête de liste. Elle tombe seule au bout de 14 jours, à la création d'une candidature liée ou quand l'offre est écartée.

#### Qualifications de l'offre

À l'ouverture d'une offre, le modèle local relève les compétences demandées, mises en cache par annonce. Chacune est au Profil (vert), proche d'une compétence existante ou absente : un clic l'ajoute au Profil avec son niveau (2 à 5) ou l'ignore. Sans `ANALYSE_PROVIDER`, le bloc n'apparaît pas.

#### Onglet CV

Le CV est composé à partir du Profil (expériences, diplômes, compétences, langues), jamais rédigé : le « sur mesure » choisit, ordonne et condense ce qui existe, sans rien ajouter.

- Cible : CV général, un métier (comptabilité, formateur digital, web design, développement web) ou une offre précise. Pour un métier ou une offre, les expériences sans lien sont réduites à une ligne (la période reste, pas de trou) et les compétences du métier ou trouvées dans l'annonce passent en tête.
- CV de référence : le PDF actuel, envoyé une fois. Chaque employeur, intitulé, diplôme, année et fait concret du CV composé doit s'y retrouver, sinon il est signalé (absent en rouge, partiel ou seulement présent au Profil en orange). Un écart ne bloque jamais l'export.
- Entête (nom, coordonnées) : premier onglet de Profil (Coordonnées), aussi modifiable directement dans l'aperçu du CV, gardée dans la base locale. Sans nom, l'export est refusé ; téléphone, email ou ville manquants et CV de référence absent sont signalés sans bloquer.
- Accroches par cible : saisies une fois sous l'aperçu.
- Télécharger le PDF enregistre une version (instantané figé, retéléchargeable) et, si une candidature est associée, remplit son champ Version du CV.
- Boutons « CV sur mesure » dans le détail d'une offre et dans le bloc Informations d'envoi d'une candidature : ouvrent cette partie avec la cible présélectionnée.
- Secours sans serveur : `npm run cv -- --cible metier --categorie comptabilite` (ou `--offre ID`, `--document doc.json` pour un document personnalisé, `--json` pour l'afficher sans PDF, `--sortie fichier.pdf`). Lit `suivi.db` en lecture seule, écrit le PDF dans `data/cv/` et n'enregistre aucune version.

## Mettre à jour les offres

#### Synchronisation des offres (usage courant)

Par défaut, l'app interroge l'API France Travail (provider `france-travail`) avec les mots-clés, zones et contrats exclus de la veille, mémorisés lors d'une synchro n8n. Un webhook n8n qui expose vos offres peut servir de secours (provider `n8n`, facultatif, contrat décrit en tête de `lib/providers/index.mjs`).

1. Copier `.env.example` vers `.env`, puis renseigner `FT_CLIENT_ID` et `FT_CLIENT_SECRET` (API directe) et, pour le secours, `SUIVI_API_TOKEN` avec le jeton de votre webhook n8n (Header Auth). Le `.env` n'est jamais versionné.
2. La synchronisation se fait ensuite d'elle-même au démarrage du serveur (sans bloquer : si aucune source n'est joignable, l'application démarre avec les données locales et le signale), à la demande avec le bouton "Actualiser" de l'accueil, ou en ligne de commande avec `npm run sync`.

#### Providers d'offres

Chaque source d'offres est un module de `lib/providers/` (`france-travail.mjs`, API directe, `n8n.mjs`, webhook de la veille). La variable `SUIVI_PROVIDERS` du `.env` liste ceux qui sont actifs, séparés par des virgules (défaut `france-travail,n8n` : France Travail en principal, n8n en secours, utilisé seulement si le direct échoue ; la première synchro directe a besoin de la configuration de veille déjà mémorisée par n8n, et `FT_CLIENT_ID` et `FT_CLIENT_SECRET` doivent être dans le `.env`). Ils s'exécutent dans l'ordre, un échec n'empêche pas les autres (l'onglet Offres signale alors une synchro partielle), et un provider marqué `secours` ne tourne que si aucun provider principal n'a réussi. Un provider sans zones ni exclusions propres reprend la dernière configuration de veille mémorisée. Le contrat d'un provider (format des offres, règle des identifiants) est détaillé en tête de `lib/providers/index.mjs`.

Une seule synchronisation tourne à la fois : un second déclenchement pendant qu'une synchro est en cours reçoit le même résultat. La fusion se fait par `id_offre`, elle ne crée donc jamais de doublon.

Si `SUIVI_EXPORT_DIR` désigne un dossier existant, le serveur y dépose aussi, au démarrage, une copie du jour `suivi-AAAA-MM-JJ.db` (7 gardées). Si `SUIVI_SAUVEGARDE_SCRIPT` désigne un script exécutable (chemin relatif au projet ou absolu), le serveur le lance en arrière-plan au démarrage, dans le dossier du projet, avec `SAUVEGARDE_MIN_MINUTES=30` pour qu'il puisse s'abstenir s'il a tourné récemment ; son message s'affiche dans la console et un échec ne bloque jamais le serveur. Pour copier la base dans un tel script, passer par `sqlite3 suivi.db "VACUUM INTO 'copie.db'"` plutôt que par une copie brute du fichier, qui peut être en cours d'écriture. La commande sauvegarde `suivi.db` (une copie par jour dans `data/backups/`), appelle le webhook et fusionne les offres avec les mêmes règles que l'import. Les erreurs courantes sont expliquées dans le message : 403 pour un jeton ou un nom d'en-tête incorrect, "API injoignable" pour un problème réseau. Le nom de l'en-tête se change avec `SUIVI_API_HEADER`.

#### Journal des actions et rapports

Toute écriture faite dans l'app ou par l'API est enregistrée dans la table `journal`, datée à la seconde (`ts`, en UTC) avec le jour dans le fuseau local (`jour`, `SUIVI_FUSEAU`, défaut `Europe/Paris`) : création, suppression, et pour chaque champ modifié la valeur avant et après. Sont couverts les offres (vue, écartée, expirée, saisie à la main, notes), les candidatures (dont les changements de statut), les tâches (dont « faite ») et les échanges. Les actions faites avant la mise en place du journal ne sont pas datées et ne peuvent pas être reconstituées : le rapport indique la date de la première ligne (`journal_depuis`).

`npm run rapport` affiche les 14 derniers jours (`-- --semaine` pour 4 semaines, `-- --mois` pour 12 mois, `-- --du 2026-10-01 --au 2026-10-31` pour une période, `-- --csv` pour un export tableur). Compteurs : offres détectées, vues, écartées, expirées, saisies, candidatures créées, changements de statut, entretiens, refus, acceptations, tâches créées et faites, échanges. Une offre remise à « non vue » n'est pas comptée.

#### Analyse des annonces par un modèle de langage (facultatif)

Un modèle local lit le texte des annonces en arrière-plan, après chaque synchro, et répond à des questions fermées : niveau du poste, diplôme exigé, années d'expérience demandées, cabinet d'expertise comptable, télétravail, salaire cité, logiciels. Le modèle ne donne jamais de note : chaque valeur chiffrée doit citer l'annonce, le code vérifie la citation, puis calcule la note de 0 à 100 avec les poids de `POIDS` dans `lib/analyse/questions.mjs`. Ces poids se règlent sans refaire d'appel au modèle, la note étant recalculée à la lecture. Les réponses sont gardées dans la table `analyses` (créée au démarrage), refaites seulement si l'annonce change ou si la consigne change de version.

Le fournisseur est interchangeable : `ollama` (modèle local) ou `openai-compatible` (LM Studio, llama.cpp, vLLM...), choisi par `ANALYSE_PROVIDER` dans le `.env` (variables dans `.env.example`). Sans cette variable, l'analyse est désactivée. Ollama est lancé automatiquement s'il est installé et arrêté. Une adresse hors de la machine est refusée sans `ANALYSE_DISTANT=1`, car le profil et les annonces partent dans chaque requête. Ajouter un fournisseur : créer `lib/analyse/<id>.mjs` (contrat en tête de `lib/analyse/index.mjs`) et l'inscrire dans `FOURNISSEURS`.

`npm run analyse -- --limite 30` analyse les 30 offres les plus récentes sans analyse à jour, `--refaire` reprend tout, `--rapport` n'appelle pas le modèle et compare les notes des offres suivies, ignorées et autres.

Le même fournisseur sert à deux analyses ponctuelles, lancées à la demande (`lib/analyse/synthese.mjs`, table `syntheses`) :

- Profil vu par un RH (en tête de Profil > Synthèse et badges) : le modèle, placé en responsable RH expérimenté, lit le Profil : Coordonnées sans téléphone ni email, Parcours avec accroche, résumé, expériences et années par métier, Compétences avec leurs niveaux, et les seuls diplômes et certifications obtenus (les titres professionnels enseignés sont écartés, le modèle les prenait pour des certifications du candidat). Il dit à quel type de profil cela correspond et pour quelles structures, donne une séniorité, une synthèse, des points forts, ce qu'un recruteur questionnerait en entretien, des métiers visés et des mots-clés. Un point fort dont la preuve ne se retrouve pas mot pour mot dans le Profil est écarté, un mot-clé absent du texte aussi. Le CV de référence (PDF) n'est pas lu.
- Plateformes à compte obligatoire (onglet Admin) : liste des plateformes qui imposent de recréer un compte pour postuler (par exemple une plateforme de missions freelance). Une offre dont la plateforme, la source, l'employeur ou le lien correspond reçoit une icône dans la liste, une pastille « Compte à créer sur X » dans la fiche et un rappel à l'étape de postulation.
- Sujets de veille proposés (onglet Admin, au-dessus des réglages de recherche) : le modèle lit les candidatures et les réglages actuels et propose des mots-clés, zones, employeurs surveillés et mots exclus. Une zone ou un employeur doit venir des candidatures, un mot exclu ne peut pas recouvrir un mot-clé, une valeur déjà présente dans les réglages n'est jamais proposée. Les propositions cochées rejoignent le brouillon des réglages, qui s'enregistre ensuite avec le bouton habituel.

Chaque résultat est gardé avec une empreinte des données lues : l'interface signale qu'il est à relancer quand le Profil ou les candidatures ont changé, ou quand `VERSION_SYNTHESE` augmente.

## Google Agenda (facultatif)

La carte Prochains rendez-vous de l'accueil affiche les événements des 14 prochains jours d'un calendrier Google choisi dans Admin. La connexion passe directement par l'API Google Calendar, sans n8n ni dépendance. Sans les variables ci-dessous, la carte n'apparaît pas.

#### Préparation dans Google Cloud (une seule fois)

1. Créer un projet dédié sur [console.cloud.google.com](https://console.cloud.google.com/projectcreate).
2. Activer l'[API Google Calendar](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) pour ce projet.
3. Dans [Google Auth Platform](https://console.cloud.google.com/auth/overview), renseigner le Branding (nom, email, page d'accueil, règles de confidentialité et conditions d'utilisation sur un domaine que vous possédez, domaine autorisé), choisir l'audience Externe puis **publier l'application en production** : en mode Test, Google retire l'accès au bout de 7 jours.
4. Dans Accès aux données, ajouter les deux scopes `https://www.googleapis.com/auth/calendar.calendarlist.readonly` (liste des agendas) et `https://www.googleapis.com/auth/calendar.events.owned` (événements des agendas dont vous êtes propriétaire).
5. Dans Clients, créer un client OAuth de type **Application de bureau** (la redirection vers `127.0.0.1` est alors autorisée sans réglage).
6. Recopier l'ID client et le code secret dans `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), puis relancer le serveur.

Un calendrier dédié (par exemple « Recherche d'emploi », créé dans les [paramètres de Google Agenda](https://calendar.google.com/calendar/r/settings/createcalendar)) garde l'agenda personnel à part.

#### Connexion

Dans Admin > Google Agenda, Connecter Google Agenda ouvre la page de Google. L'avertissement « application non validée » est normal pour une application personnelle (Paramètres avancés, puis Accéder). Les deux autorisations doivent rester cochées, sinon l'accès est refusé et retiré. De retour dans Admin, choisir le calendrier suivi. Le jeton de rafraîchissement est conservé dans `data/google-agenda.json` (lisible par vous seul, hors de `suivi.db` et des sauvegardes), le jeton d'accès reste en mémoire. Déconnecter retire l'accès chez Google et supprime ce fichier.

## Règles de fusion des offres

Elles sont dans `lib/offres.mjs`, utilisé par `bin/sync.mjs` et le serveur.

- Les lignes vides sont ignorées.
- Seules les offres détectées durant les 31 derniers jours (comme la recherche France Travail) sont gardées (constante `JOURS_MAX`). Les offres plus anciennes déjà en base sont supprimées, sauf si une candidature les référence.
- Seules les zones (départements) réglées dans l'onglet Admin sont retenues.
- Les titres contenant un mot de la table `exclusions` sont écartés, ainsi que gérant, directeur et expert-comptable.
- Une offre est dite proche si son département est `SUIVI_DEPARTEMENT_PROCHE` et sa ville figure dans `SUIVI_VILLES_PROCHES` (variables du `.env`, facultatives). Sans ces réglages, aucune offre n'est proche.
- Distance dans le score (facultatif) : `SUIVI_ORIGINES` donne un ou plusieurs points de départ « latitude,longitude » séparés par des points-virgules, `SUIVI_DEPARTEMENTS_DISTANCE` les départements dont les communes sont chargées pour situer les offres (par défaut `SUIVI_DEPARTEMENT_PROCHE`), et `SUIVI_LIEU_BONUS` un lieu qui ajoute 3 points aux offres situées à 15 km ou moins. L'interface les lit par `GET /api/zone`. Sans `SUIVI_ORIGINES`, le score garde la zone « proche » tout ou rien.
- Catégories, par mots-clés sur le titre et dans cet ordre : comptabilite, web_design, dev_web, formateur_digital, autre. Les règles sont dans le tableau `CATEGORIES`. Les développeurs Java, C++, .NET et assimilés sont rangés dans "autre".

## Structure du dossier

```text
suivi-emploi/
  server.mjs            serveur local : API JSON et interface construite (npm start, npm run dev)
  bin/                  commandes en ligne (npm run ...)
    sync.mjs            synchronisation des offres (npm run sync)
    analyse.mjs         analyse des annonces par le modèle de langage (npm run analyse)
    rapport.mjs         bilan d'activité en texte ou CSV (npm run rapport)
    cv.mjs              secours : CV en PDF depuis suivi.db quand le serveur est arrêté (npm run cv)
    demo.mjs            démonstration sur une base fictive temporaire (npm run demo)
  lib/                  logique métier partagée par le serveur, les commandes, l'interface et les tests
    offres.mjs          schéma et migrations de la base, classement et fusion des offres
    sync.mjs            synchronisation, sauvegarde du jour, chargement du .env
    providers/          sources d'offres (france-travail.mjs, n8n.mjs)
    analyse/            analyse des annonces et lettres par un modèle de langage
    agenda/             Google Agenda (OAuth et API Calendar, sans dépendance)
    cv.mjs, cv-pdf.mjs  composition, contrôle et mise en page PDF du CV
    lettre.mjs          lettres de motivation (et lettre-pdf.mjs, docx.mjs pour les exports)
    ft-jeton.mjs        jeton francetravail.io partagé (bonneboite.mjs, marche.mjs)
    ...                 un module par sujet : contrat, zone, trajets, journal, reglages, listes, texte...
  client/               interface React (Vite)
    index.html
    src/main.tsx        point d'entrée
    src/App.tsx         onglets, thème, enregistrement automatique
    src/api.ts          appels à l'API
    src/components/     écrans et cartes
    src/style.css       système de design
  tests/                tests node:test (npm test), sans réseau
  docs/                 guide d'utilisation, référence, captures
  types.d.ts            types de données partagés (candidature, offre, tâche...)
  tsconfig.json         vérification de types de server.mjs, bin/ et lib/
  vite.config.js        configuration de Vite (racine client/, sortie dist/)
  .env.example          modèle de configuration (le .env n'est pas versionné)
  CHANGELOG.md          journal des versions

  non versionnés :
  suivi.db              votre base SQLite
  data/                 sauvegardes, CV, photo, signature, exports
  dist/                 interface construite (npm run build)
```

## Base de données

| Table | Contenu |
|-------|---------|
| `offres` | Offres récentes, avec catégorie, zone, indicateurs `proche`, `ignoree`, `vue` et `expiree`, `source`, `postuler_via`, `description` (notes) et `annonce` (texte de l'offre, venu de la veille). Id `man-...` pour une offre saisie à la main |
| `taches` | Tâches par candidature ou globales (échéance, faite) |
| `echanges` | Historique des échanges d'une candidature (date, canal, sens, résumé) |
| `candidatures` | Suivi, avec `offre_id` pour le lien avec une offre, `lieux` (JSON, destinations des trajets) et `maj_locale` pour protéger les modifications faites dans l'application |
| `competences` | Compétences du Profil : domaine, intitulé, niveaux `enseigner` et `executer` (0 à 5 ou vide), contexte, `valide`, `ordre` |
| `formations` | Titres préparés, diplômes et certifications (`type` : `titre_pro`, `diplome`, `certification`), établissement, `debut` et `fin` (AAAA ou AAAA-MM, fin vide avec un début = en cours), `matieres` (anciennes matières en texte libre, à reclasser) |
| `experiences` | Parcours : poste, employeur, lieu, `type` (salarié, freelance, formateur, autre), `categorie` (même liste que les offres), `debut` et `fin` (AAAA-MM, fin vide = en cours), description |
| `experience_competences` | Liens entre une expérience et les compétences mobilisées |
| `projets` | Portfolio : nom, lien, nature, début AAAA-MM, part de l'IA (aucune, assistée, déléguée), technologies sans compétence dédiée, description |
| `projet_competences` | Liens entre un projet et les compétences mobilisées (le nombre de projets d'une compétence est calculé) |
| `formation_competences` | Compétences enseignées dans un titre (`titre_pro`), choisies dans Profil > Titres enseignés |
| `cv_references` | CV de référence envoyés (nom du fichier, date, pages, texte extrait par `pdftotext`), le plus récent fait foi |
| `lettre_brouillons`, `lettre_versions` | Lettre de motivation en cours (texte, matrice, origine) et lettres exportées avec leur contrôle |
| `cv_versions` | CV exportés : nom, cible, catégorie, offre et candidature, référence utilisée, nombre d'écarts et d'avertissements, instantané JSON du document et du contrôle |
| `contacts` | Interlocuteurs : prénom, nom (l'un des deux obligatoire), fonction, entreprise, adresse, téléphone, email, note, date d'ajout, couleur (reprise sur ses rendez-vous), épingle (remonté en tête de la liste) |
| `contact_candidatures` | Liens entre un contact et une candidature, sans passer par une offre (cascade des deux côtés) |
| `contact_offres` | Liens entre un contact et les offres qui le concernent (clés étrangères en cascade : supprimer l'offre ou le contact retire le lien) |
| `rendez_vous` | Rendez-vous (début, durée, type, lieu, lien visio, note), liés à une offre, une candidature et un contact (lien mis à vide si l'un d'eux est supprimé), identifiant de l'événement Google et état de synchronisation |
| `kv` | `profil` (accroche, résumé, `accroches` par cible, `contact` de l'entête du CV), conseils (`conseils`) et to-do (`todo`) en Markdown, plus `veille`, `reglages`, `trajets` et `agenda` (calendrier Google suivi : `calendrier_id`, `calendrier_nom`) |

Schéma en version 30 (`enseignements` de `candidatures` v29, texte libre, vide par défaut, copie de la base avant, `lieu` de `formations` v28, ville et département en texte libre, copie de la base avant, `poids` de `competences` v27, JSON `{ métier: 0 à 3 }`, vide par défaut = niveau seul, copie de la base avant, clés `metier:<métier>` des lettres génériques v26, ancien `angle:` renommé avec copie de la base avant, `generation` de `lettre_brouillons` v25, `poids` de `experiences` v24, `lettre_brouillons` et `lettre_versions` v23, `offre_competences` v20, `epinglee_le` de `offres` v21, `intitules` de `experiences` v22, détail dans `.doc/donnees.md`), précédé de la version 15 (colonnes `couleur` v14 et `epingle` v15 de `contacts`), précédé de la version 13 (table `contact_candidatures`), elle-même précédée de la version 12 : clés étrangères sur les liens des candidatures, tâches, échanges, versions de CV et analyses, contraintes `CHECK` sur les statuts, intérêts et catégories, liens vides remplacés par NULL (tables reconstruites, copie de la base dans `data/backups/` avant). Schéma en version 11 : tables `contacts`, `contact_offres` et `rendez_vous`, rien à reprendre. Une offre liée à un contact ou à un rendez-vous n'est jamais retirée par la purge des 21 jours ni par les réglages. Version 10 : `annees` (texte libre) remplacé par `debut` et `fin`, l'ancien texte est converti quand il est lisible, sinon conservé dans la remarque (copie de la base avant). Version 9 : table `formation_competences`, les matières en texte libre d'un titre enseigné sont rattachées à une compétence quand une seule correspond (le reste demeure dans `matieres`, à reclasser, copie de la base avant). Version 8 : tables `cv_references` et `cv_versions`, rien à reprendre. Version 7 : à la première ouverture, les anciennes clés kv `skills` et `titres` sont recopiées dans `competences` et `formations` (ids et ordre conservés, copie de la base dans `data/backups/` avant), puis supprimées.

Lecture rapide depuis le dossier du projet :

```bash
node --no-warnings -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('suivi.db');console.log(db.prepare('select categorie, count(*) n from offres group by 1').all())"
```

## API

Les corps de requête et de réponse sont en JSON. Les erreurs renvoient `{ "erreur": "message" }` avec le code HTTP adapté : 400 (données invalides), 404 (inconnu), 405 (méthode non autorisée), 409 (identifiant déjà pris), 502 ou 503 (synchronisation impossible).

#### Candidatures

| Méthode et chemin | Rôle |
|-------------------|------|
| `GET /api/candidatures` | Liste. Filtres optionnels : `statut`, `interet`, `offre_id`, `q` (recherche dans entreprise, poste, description, notes) |
| `POST /api/candidatures` | Crée une candidature. `entreprise` et `poste` obligatoires, `statut` par défaut `a_faire`, `date` par défaut aujourd'hui, `id` généré si absent. Répond 201 |
| `GET /api/candidatures/:id` | Une candidature |
| `PATCH /api/candidatures/:id` | Modifie uniquement les champs envoyés |
| `DELETE /api/candidatures/:id` | Supprime |
| `POST /api/candidatures/:id/vue` | Journalise la consultation de la candidature (une fois par jour au plus, rien n'est modifié), envoyé par la fiche ouverte depuis 3 secondes |

Champs : `entreprise`, `poste`, `description`, `statut` (`a_faire`, `en_cours`, `entretien`, `sans_reponse`, `refuse`, `accepte`, `ecarte`), `raison`, `date` (AAAA-MM-JJ), `plateforme`, `lien` (adresse http ou https du formulaire ou de l'annonce où la candidature a été envoyée, ou vide ; un `PUT /api/state` sans ce champ conserve le lien existant), `interet` (`important`, `fort`, `moyen`, `faible` ou vide), `notes` (Markdown), `offre_id` (identifiant d'une offre existante, ou `null` pour retirer le lien ; une offre ne peut être liée qu'à une seule candidature, sinon 400), `lieux` (liste de huit lieux au plus pour les trajets, chacun `{ id, nom, adresse, lon, lat, jours, peage }` où `peage` est le montant aller-retour par jour en euros ; `lon` et `lat` vont ensemble ou restent `null`, 400 si un champ est inconnu ou invalide ; un `PUT /api/state` sans ce champ conserve les lieux existants). Toute écriture marque la ligne `maj_locale`, ce qui la protège des imports.

#### Offres

| Méthode et chemin | Rôle |
|-------------------|------|
| `GET /api/offres` | Liste, avec `candidature_id` si l'offre est suivie. Filtres optionnels : `categorie`, `contrat`, `zone` (`proche`, `83`, `13`), `q`, `suivie` (`0` ou `1`), `ignorees` (`0` ou `1`), `vues` (`0` ou `1`), `expirees` (`0` ou `1`), `manuelles` (`0` ou `1`), `epinglees` (`1`), `source`, `limite` et `decalage` |
| `GET /api/offres/:id` | Une offre |
| `POST /api/offres` | Ajoute une offre à la main (`titre` obligatoire), catégorie et zone calculées |
| `PATCH /api/offres/:id` | Modifie `ignoree`, `vue`, `expiree`, `epinglee` (booléen, épingle de 14 jours), `postuler_via`, `description` ; tous les champs, dont `annonce`, pour une offre manuelle |
| `GET, POST /api/offres/:id/competences` | Compétences demandées par l'annonce, relevées par le modèle local (`ANALYSE_PROVIDER`) : GET lit l'état avec le statut calculé à la lecture (au Profil, proche, absente, ignorée), POST lance l'extraction (`?refaire=1` pour la refaire, file d'attente d'une analyse à la fois). Jamais de niveau proposé par le modèle |
| `GET /api/candidatures/:id/competences-offre` | Les mêmes compétences, consultables après la purge de l'offre |
| `POST /api/offres/:id/verifier` | Contrôle unitaire d'une offre France Travail à l'ouverture : `{ statut: en_ligne \| cloturee \| inconnu, protegee, marquee }`. Clôturée et libre : marquée Expirée (journalisée, décochable) ; liée à une candidature, un contact, un rendez-vous ou épinglée : alerte seulement. Mémo de 6 h par offre |
| `DELETE /api/offres/:id` | Supprime une offre manuelle non liée |
| `GET, POST /api/taches` et `/api/echanges` | Liste (filtres `candidature_id`, `faite`) et création |
| `GET, PATCH, DELETE /api/taches/:id` et `/api/echanges/:id` | Lecture, modification partielle, suppression |
| `GET, POST /api/competences`, `/api/formations`, `/api/experiences` et `/api/projets` | Parcours du Profil : liste et création. Une expérience ou un projet porte `competences` (tableau d'ids, 400 si l'un est inconnu) |
| `GET, PATCH, DELETE /api/competences/:id` (et formations, experiences, projets) | Lecture, modification partielle, suppression. Supprimer une compétence la retire des expériences et des projets |
| `GET, POST /api/contacts` | Contacts : liste et création. `offres` et `candidatures` sont des tableaux d'ids d'offres et de candidatures (400 si l'un est inconnu, un contact peut n'avoir aucun lien), filtres `offre_id` et `candidature_id`, `email` et `telephone` sont contrôlés, un prénom ou un nom est obligatoire |
| `GET, PATCH, DELETE /api/contacts/:id` | Lecture, modification partielle, suppression (les offres liées sont conservées) |
| `GET, POST /api/cv/reference` | CV de référence : `GET` renvoie le plus récent avec son texte (`null` sans référence) ; `POST` reçoit le PDF tel quel (`?fichier=nom.pdf`), 400 si ce n'est pas un PDF ou s'il n'a pas de texte (scanné), 503 sans `pdftotext`, la référence précédente étant conservée dans tous les cas |
| `POST /api/cv/composer` | `{ cible: general, metier ou offre, categorie?, offre_id? }`. Renvoie `{ document, controle, reference, nom }` sans rien écrire. Sans analyse de l'offre (Ollama en panne), le ciblage se fait sur le titre et l'annonce, sinon sur la catégorie |
| `POST /api/cv/assembler` | `{ offre_id }` : le modèle local (`ANALYSE_PROVIDER`) choisit le métier et les compétences du Profil à mettre en avant pour l'offre, en identifiants seulement, avec un motif ; renvoie `{ metier, competences, competences_noms, motif, modele, duree_ms }`, n'écrit rien. 503 si l'analyse est désactivée, 422 annonce trop courte, 502 modèle injoignable. `POST /api/cv/composer` accepte ensuite `prioritaires` (ids du Profil) pour la cible `offre` |
| `POST /api/cv/pdf` | `{ document, candidature_id?, nom? }` : document de `composer`, éventuellement personnalisé. Contrôle refait côté serveur, renvoie le PDF et enregistre la version (en-têtes `X-Cv-Version`, `X-Cv-Nom` encodé, `X-Cv-Ecarts`, `X-Cv-Avertissements`). 400 si le document est mal formé ou sans nom, 500 sans version enregistrée si le PDF échoue |
| `GET /api/cv/versions`, `GET, DELETE /api/cv/versions/:id`, `GET /api/cv/versions/:id/pdf` | Versions exportées : liste, détail avec l'instantané, suppression, PDF refait à l'identique |
| `POST /api/lettre/rediger` | Brouillon de lettre de motivation par le modèle local (`{ offre_id, matrice, force? }`), n'écrit rien |
| `POST /api/lettre/preparer`, `GET /api/lettre/preparer/:id` | Brouillon de l'offre préparé en arrière-plan (après l'assemblage du CV), écrit seulement si la lettre est encore vide ; état `attente`, `ok`, `echec` ou `existe` |
| `GET, PUT /api/lettre/style` | Bibliothèque de style : angles d'accroche (par métier) et formules à éviter, lus par le modèle local, Claude et le contrôle |
| `GET, PUT /api/lettre/matrice` | Matrice par défaut (ton, longueur, blocs Vous, Moi, point faible, Nous, conclusion, compétences) |
| `GET, PUT /api/lettre/brouillons/:cle` | Texte en cours d'une lettre (clé = id de l'offre ou de la candidature, `metier:<métier>` pour une lettre générique), `PUT` partiel avec `origine` et `base_maj_le` (409 si périmé) |
| `POST /api/lettre/controler` | Contrôle des faits et de la méthode, n'écrit rien |
| `POST /api/lettre/pdf`, `POST /api/lettre/docx` | Export, version enregistrée et liée à la candidature (en-têtes `X-Lettre-Version`, `X-Lettre-Nom`, `X-Lettre-Ecarts`, `X-Lettre-Avertissements`) |
| `GET /api/lettre/versions`, `GET, DELETE /api/lettre/versions/:id`, `GET /api/lettre/versions/:id/pdf` et `/docx` | Lettres exportées |
| `GET, POST, DELETE /api/signature` | Image de signature (PNG ou JPEG, 500 Ko au plus, gardée dans `data/`) |
| `GET, POST, DELETE /api/photo` | Photo de profil (PNG ou JPEG, 1 Mo au plus, gardée dans `data/`), reprise dans le bouton Profil et, si le document CV a `photo: true`, dans l'entête du PDF |
| `POST /api/import/linkedin` | Corps : le ZIP de l'export LinkedIn (20 Mo au plus). Renvoie une proposition (profil, expériences, formations, compétences, chacune marquée `present`) sans rien écrire |

#### Google Agenda

| Méthode et chemin | Rôle |
|-------------------|------|
| `GET /api/agenda` | État : `configure` (variables présentes), `connecte`, `depuis`, `calendrier_id` et `calendrier_nom` |
| `PUT /api/agenda` | `{ calendrier_id }` : calendrier suivi, vérifié dans la liste de Google (400 s'il est inconnu, `''` pour aucun) |
| `GET /api/agenda/connexion` | Redirige vers Google (PKCE). `?retour=` : origine locale de l'interface où revenir |
| `GET /api/agenda/retour` | Retour de Google : enregistre le jeton puis redirige vers Admin avec `?agenda=connecte` ou `?agenda_erreur=` |
| `POST /api/agenda/deconnexion` | Révoque l'accès chez Google et supprime le jeton (le calendrier choisi est gardé) |
| `GET /api/agenda/calendriers` | Agendas dont vous êtes propriétaire |
| `GET /api/agenda/evenements` | Événements du calendrier suivi, `?du=AAAA-MM-JJ&au=AAAA-MM-JJ` (défaut : aujourd'hui et 14 jours, un an au plus), cache d'une minute, `&frais=1` pour l'ignorer. 409 sans calendrier choisi |
| `GET /api/rendez_vous`, `POST /api/rendez_vous` | Rendez-vous : `titre`, `debut` (AAAA-MM-JJTHH:MM, heure de Paris, obligatoire), `duree` (5 à 1440 min), `type` (`telephone`, `visio`, `sur_place`, `autre`), `lieu`, `lien_visio`, `note`, `offre_id`, `candidature_id`, `contact_id`. Enregistré d'abord ici, puis envoyé à Google ; `synchro` vaut `ok`, `a_envoyer` (renvoi automatique), `erreur` ou `annule`. `google_id`, `synchro` et `cree` ne s'envoient pas (400). Filtres de la liste : `offre_id`, `candidature_id`, `contact_id`, `du` et `au` (AAAA-MM-JJ, bornes incluses). Un rendez-vous peut n'avoir aucun lien |
| `GET`, `PATCH`, `DELETE /api/rendez_vous/:id` | Lecture, modification (renvoyée à Google) et suppression (Google d'abord, 502 s'il échoue, `?local=1` pour ne supprimer qu'ici) |
| `POST /api/rendez_vous/rattacher` | `{ google_id, offre_id?, candidature_id?, contact_id? }` : range un événement créé directement dans Google avec une offre, une candidature ou un contact (409 s'il l'est déjà) |

Erreurs : 503 sans `GOOGLE_CLIENT_ID` ou `GOOGLE_CLIENT_SECRET`, 401 si l'accès a été retiré chez Google (reconnexion nécessaire), 502 si Google est injoignable.

#### Synchronisation et état

| Méthode et chemin | Rôle |
|-------------------|------|
| `GET /api/plateformes` | Liste des plateformes qui obligent à recréer un compte pour postuler (`{ plateformes }`) |
| `PUT /api/plateformes` | Remplace la liste (tableau de noms, doublons et vides ignorés, 400 si invalide) |
| `GET /api/entreprises?rome=M1805&distance=30&depart=0` | Entreprises à fort potentiel d'embauche (API La Bonne Boite) autour d'un point de départ des trajets, `{ actif, depart, total, entreprises }`. `actif: false` sans `FT_SCOPE_BONNEBOITE`, 400 sans point de départ ou avec un code ROME invalide, 502 si l'API refuse ou est injoignable. Lecture seule, résultat gardé 6 h en mémoire |
| `GET /api/entreprises/suivi` | Décisions sur les entreprises (`{ suivi: { siret: { statut, nom, ville, maj } } }`), statuts `gardee`, `ecartee`, `contactee` |
| `PUT /api/entreprises/suivi/:siret` | Corps `{ statut, nom?, ville? }` : enregistre le statut (`null` le retire), 400 si SIRET ou statut invalide, journalisé |
| `GET /api/marche` | Offres et demandeurs d'emploi (catégorie A) des quatre métiers visés dans le département de la zone proche (`SUIVI_DEPARTEMENT_PROCHE`, sinon 13), `{ actif, jour, departement, territoire, metiers }` (chaque métier avec `historique` sur 8 trimestres et `evolution_pct` sur un an). `actif: false` sans `FT_SCOPE_MARCHE`. Gardé dans le kv `marche_cache`, rafraîchi une fois par jour, `?force=1` relance l'appel ; si l'API échoue, les derniers chiffres reviennent avec `obsolete: true`. 502 si l'API refuse ou est injoignable sans données gardées |
| `GET /api/reglages` | Réglages de recherche (`zones`, `mots_cles`, `mots_exclus`, `contrats_exclus`, `entreprises`) et leur `origine` (`app`, `veille` ou `aucun`) |
| `PUT /api/reglages` | Enregistre les réglages (tous les champs obligatoires, 400 si invalides), retire les offres devenues hors zone ou exclues. `?apercu=1` renvoie le nombre d'offres retirables sans rien écrire |
| `POST /api/sync` | Lance la synchronisation et renvoie le résultat (`stats.nouvelles`, `enBase`, ...). 502 si les sources sont injoignables ou refusent les clés, 503 si le `.env` est absent |
| `GET /api/zone` | Zone de distance du score lue dans le `.env` : `origines` et `bonus` en `[lon, lat]`, `departements` (voir `lib/zone.mjs`) |
| `GET /api/sync` | État : synchro en cours, résultat ou erreur de la dernière (`code` : `config`, `reseau`, `auth`, `http`, `format`). `expiration` : `{ marquees, ignoree }`, offres France Travail disparues de la recherche marquées Expirées (chaque absente est d'abord confirmée clôturée par l'API détail ; `ignoree` : `incomplete`, `reglages`, `volume`, `vide` ou `sans_controle` quand un garde-fou a empêché le marquage) |
| `GET /api/rapport` | Rapport d'activité : `?du=AAAA-MM-JJ&au=AAAA-MM-JJ&grain=jour`, `semaine` (lundi à dimanche) ou `mois`, `&format=csv` pour un export. 400 si une date ou le grain est invalide |
| `GET /api/journal` | Événements bruts du journal, du plus récent au plus ancien : `?du`, `au`, `entite` (`offre`, `candidature`, `tache`, `echange`, `contact`, `rendez_vous`, `cv`, `cv_reference`...), `id`, `limite` |
| `GET /api/analyse` | Fournisseur actif (sans clé), nombre d'offres analysées et restantes, passage en cours ou dernier résultat |
| `POST /api/analyse` | Lance un passage d'analyse en arrière-plan (202), `?refaire=1` reprend toutes les offres. 503 si l'analyse est désactivée ou mal configurée |
| `GET /api/ia` | Profil synthétique et sujets de veille en cache (`resultat`, `date`, `modele`, `a_jour`), analyse en cours ou dernière erreur |
| `POST /api/ia/profil`, `POST /api/ia/veille` | Lance l'analyse en arrière-plan (202). 503 si l'analyse est désactivée, 404 pour un autre nom |
| `GET /api/state` | Candidatures, tâches, échanges, contacts, rendez-vous, compétences, formations, expériences, profil, conseils et to-do, plus `cvReference` (sans le texte) et `cvVersions` |
| `PUT /api/state` | Écrit les clés envoyées (`profil`, `conseils`, `todo`, et `candidatures` en création ou modification). Ne supprime jamais de candidature. `skills` ou `titres` (ancienne interface) : 400, la page est à recharger |

Le serveur écoute sur `127.0.0.1` uniquement et refuse toute requête dont l'en-tête `Host` n'est pas `localhost` ou `127.0.0.1`.

## Sauvegardes

Au démarrage, le serveur copie `suivi.db` vers `data/backups/suivi-AAAA-MM-JJ.db` (date locale) si la copie du jour n'existe pas encore. Une synchro ou un enregistrement des réglages fait cette copie par `VACUUM INTO` quand la base est déjà ouverte, pour qu'elle reste cohérente. Pour restaurer, arrêter le serveur et remplacer `suivi.db` par la copie voulue.

## Confidentialité et git

La base contient des notes de candidature, des retours d'entretien et des prénoms de recruteurs. Le `.gitignore` exclut donc `suivi.db`, `data/`, `dist/` et `node_modules/`. Seuls le code, le `package.json` et la documentation sont versionnés. Ne jamais ajouter ces dossiers à un dépôt distant : le dépôt public ne contient que le code, les tests et la documentation.

## Dépannage

- Onglet CV « contrôle impossible » : aucun CV de référence envoyé, ou `pdftotext` absent (`sudo apt install poppler-utils`). L'export reste possible.
- Profil > CV, nouvelles routes « Route inconnue » : le serveur tourne sur une ancienne version de `server.mjs`, le relancer.

- "Serveur injoignable" dans l'interface : le serveur n'est pas démarré (`npm run dev` ou `npm start`) ou le port diffère.
- `Interface non construite : lancer npm run build` sur http://localhost:3000 : le dossier `dist/` n'existe pas encore.
- "Synchronisation impossible" : le message donne la cause. "Configuration absente" : créer le `.env` (voir `.env.example`). "Clés France Travail refusées" : vérifier `FT_CLIENT_ID` et `FT_CLIENT_SECRET`. "Jeton refusé" (secours n8n) : vérifier `SUIVI_API_TOKEN` et, si besoin, `SUIVI_API_HEADER` par rapport au credential de votre webhook. "Serveur n8n injoignable" ou "webhook ... répondu 404" : le serveur n8n ou le workflow est arrêté ou non publié. L'application reste utilisable avec les offres déjà en base.
- `Port already in use` : un autre serveur tourne déjà, l'arrêter ou changer `PORT`.
