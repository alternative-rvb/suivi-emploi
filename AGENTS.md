# AGENTS.md

Ce fichier guide un assistant de code (Claude Code, Codex, Cursor et autres) qui doit installer ou modifier ce projet pour un utilisateur. Il est lu en premier : suivez-le avant d'improviser.

## Le projet en bref

Application locale de suivi des offres d'emploi et des candidatures. Node 24 (modules ES), SQLite intégré (`node:sqlite`), serveur `node:http` sans framework, interface React 19 + TypeScript + Vite. Tout tourne sur la machine de l'utilisateur, dans une base `suivi.db` à la racine. Documentation : `README.md` (démarrage), `docs/guide-utilisation.md` (usage), `docs/reference.md` (API, base, dépannage).

## Installer pour l'utilisateur

Étapes dans l'ordre, en vérifiant chaque résultat avant la suivante.

1. **Prérequis** : `node -v` doit afficher 24 ou plus, `git --version` doit répondre.
   - Node trop ancien ou absent : proposer [nvm](https://github.com/nvm-sh/nvm) (`nvm install 24`), sans toucher au Node du système sans accord.
   - Sous Windows avec WSL2 : travailler dans WSL, dans un dossier Linux (pas sous `/mnt/c`). `which npm` doit donner un chemin Linux. En shell non interactif, charger Node d'abord (`source ~/.nvm/nvm.sh`).
   - Ne jamais lancer Node côté Windows sur ce dossier : SQLite y gère mal les verrous de fichiers.
2. **Dépendances** : `npm install`.
3. **Essai sans configuration** : `npm run demo`, puis ouvrir http://localhost:3100. La démo utilise une base fictive jetable et ne touche à rien. Critère de réussite : la page d'accueil s'affiche avec des offres et des candidatures d'exemple.
4. **Usage réel** (seulement si l'utilisateur le demande) :
   - `cp .env.example .env`, `npm run build`, `npm start`, puis http://localhost:3000.
   - L'application démarre sans aucune clé : l'utilisateur peut saisir ses offres à la main.
5. **Vérification finale** : `npm run typecheck`, `npm test` et `npm run build` doivent passer.

## Ce qu'il faut demander à l'utilisateur, jamais deviner

- **Sa zone** (`SUIVI_DEPARTEMENT_PROCHE`, `SUIVI_VILLES_PROCHES`, éventuellement `SUIVI_ORIGINES` en latitude,longitude) : lui poser la question, ne pas inventer une région ni copier les exemples de `.env.example`.
- **Ses clés d'API** (`FT_CLIENT_ID`, `FT_CLIENT_SECRET` de francetravail.io, clés Google Agenda, `ANALYSE_CLE`) : il les crée lui-même et les écrit lui-même dans `.env`. Ne jamais lui demander de les coller dans le chat, ne jamais les lire, les afficher ni les passer en argument de commande. Une fois qu'il confirme, vérifier seulement la présence du nom de la variable, jamais sa valeur.
- **Les options facultatives** (candidatures spontanées, marché local, Google Agenda, analyse par un modèle) : les proposer, ne pas les activer d'office. Chaque variable est commentée dans `.env.example`, le détail est dans `docs/reference.md`.
- **L'analyse des annonces par un modèle** envoie les annonces et le profil au modèle : ne la pointer que vers une adresse locale (Ollama) sauf décision explicite de l'utilisateur.

## Interdits

- Lire, afficher, copier ou versionner `.env`, `suivi.db`, `data/` : ils contiennent des données personnelles et des clés (déjà exclus par `.gitignore`).
- Écraser ou supprimer `suivi.db` sans accord et sans copie préalable.
- Exposer le serveur sur Internet ou sur le réseau local (il écoute sur `127.0.0.1`, c'est voulu), ou désactiver les protections du serveur (CSP, vérification d'origine).
- Ajouter une dépendance sans en parler à l'utilisateur.
- Mettre des données personnelles (nom, adresse, lieu, contenu de candidature) en dur dans le code, les tests ou les exemples : tout réglage personnel passe par `.env` ou la base.
- Pousser sur un dépôt ou lancer `git commit` sans demande de l'utilisateur.

## Modifier le code

- Avant de commiter : `npm run typecheck`, `npm test`, `npm run build`.
- Tester sur une copie jetable ou sur un autre port (`PORT=3200`), jamais sur la base réelle de l'utilisateur.
- Les données sont lues et écrites par l'API du serveur (`/api/...`), pas directement dans `suivi.db`, pour que `maj_locale` soit posé.
- Toute modification de l'interface adapte l'effet squelette de chargement (`client/src/components/Squelettes.tsx`, `client/src/gabarit.tsx`).
- Le journal des versions est `CHANGELOG.md` (section `[Non publié]`), en langage utilisateur.

## En cas de problème

La section Dépannage de `docs/reference.md` couvre les cas courants (double npm sous WSL, port occupé, jeton refusé, base verrouillée). Un bug se signale en issue, sans donnée personnelle. Une faille de sécurité se signale en privé, voir `SECURITY.md`.
