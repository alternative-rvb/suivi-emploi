# Politique de sécurité

## Signaler une faille

Ne publiez pas de faille de sécurité dans une issue publique.

Utilisez le signalement privé de GitHub : onglet **Security** du dépôt, puis **Report a vulnerability**. Seul le mainteneur voit le message, et la discussion reste privée jusqu'à la publication d'un correctif.

Précisez la version concernée (voir `package.json`), les étapes pour reproduire le problème et ce qu'il permet. N'y joignez aucune donnée personnelle réelle : utilisez des exemples fictifs.

## Versions prises en charge

Seule la dernière version publiée reçoit des correctifs. Pour la mettre à jour, voir la section « Mettre à jour l'application » du [guide d'utilisation](docs/guide-utilisation.md).

## Ce qu'il faut savoir avant de signaler

L'application est conçue pour tourner en local, pour une seule personne :

- le serveur écoute sur la machine de l'utilisateur et n'est pas prévu pour être exposé sur Internet ;
- la base `suivi.db` et le fichier `.env` contiennent des données personnelles et des clés : ne les versionnez ni ne les partagez jamais ;
- les clés d'API (France Travail, analyse par modèle, Google Agenda) se renseignent uniquement dans `.env`.

Un problème qui suppose d'exposer volontairement le serveur sur un réseau public relève de la configuration, mais il reste bienvenu : signalez-le quand même.
