// Erreur avec un code stable (config, reseau, auth, http, format, interne, introuvable pour l'agenda), affichable telle quelle dans l'interface.
// NOTE: dans un fichier à part pour que les providers puissent l'importer sans dépendre de lib/sync.mjs (qui les importe).
export class ErreurSync extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
