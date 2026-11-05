// Appels à l'API locale. Les erreurs portent le message renvoyé par le serveur (et son code HTTP) pour être affichées telles quelles.
import type { CalendrierGoogle, Candidature, CibleCv, Competence, CompetencesOffre, Contact, EtatAgenda, EvenementAgenda, ControleCv, ControleLettre, CvDocument, CvReference, CvVersion, Echange, LettreBrouillon, LettreMatrice, LettreStyle, LettreVersion, Experience, Formation, Offre, Projet, ProfilCv, RendezVous, RendezVousSaisie, Reglages, Syntheses, Tache, Trajets } from '../../types';

export type ErreurApi = Error & { status?: number; code?: string };

async function appel<T = any>(url: string, options?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, options);
  } catch (e: any) {
    if (e?.name === 'TimeoutError') { const d: ErreurApi = new Error('Le serveur met trop de temps à répondre.'); d.code = 'delai'; throw d; }
    throw new Error('Serveur injoignable : est-il lancé (npm start) ?');
  }
  let data: any = null;
  try { data = await r.json(); } catch { /* réponse sans corps JSON */ }
  if (!r.ok) {
    const e: ErreurApi = new Error(data?.erreur || 'Erreur HTTP ' + r.status);
    e.status = r.status;
    e.code = data?.code;
    throw e;
  }
  return data;
}

const envoi = (methode: string, corps: unknown): RequestInit => ({ method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });

export type Etat = {
  candidatures: Candidature[]; taches: Tache[]; echanges: Echange[];
  competences: Competence[]; formations: Formation[]; experiences: Experience[]; projets: Projet[]; contacts: Contact[]; rendez_vous: RendezVous[]; profil: ProfilCv;
  cvReference: CvReference | null; cvVersions: CvVersion[];
  lettreVersions?: LettreVersion[]; lettreMatrice?: LettreMatrice; lettreStyle?: LettreStyle; signature?: boolean; photo?: boolean;
  conseils?: string; todo?: string; [cle: string]: any;
};

export const chargerEtat = () => appel<Etat>('/api/state');

// Profil (accroche, résumé), conseils et to-do : seules les clés envoyées sont écrites
export const enregistrerEtat = (partiel: Record<string, unknown>) => appel('/api/state', envoi('PUT', partiel));

// Candidatures, tâches, échanges, compétences, formations et expériences : même forme de routes (/api/<collection> et /api/<collection>/:id)
export const creer = (collection: string, d: unknown) => appel('/api/' + collection, envoi('POST', d));
export const modifier = (collection: string, id: string, champs: unknown) => appel(`/api/${collection}/${encodeURIComponent(id)}`, envoi('PATCH', champs));
export const supprimer = (collection: string, id: string) => appel(`/api/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ANCHOR: le ZIP part tel quel (corps binaire) ; la réponse est une proposition, rien n'est écrit par le serveur
export const importerLinkedin = (fichier: Blob) => appel('/api/import/linkedin', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: fichier });

// ANCHOR: CV (ligne 90) : le serveur compose et contrôle, le PDF revient en binaire avec la version enregistrée dans ses en-têtes
export const envoyerReference = (fichier: File) => appel<{ reference: CvReference }>('/api/cv/reference?fichier=' + encodeURIComponent(fichier.name), { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: fichier });
export const composerCv = (d: { cible: CibleCv; categorie?: string; offre_id?: string; metier?: string; prioritaires?: string[] }) =>
  appel<{ document: CvDocument; controle: ControleCv; reference: CvReference | null; nom: string; pages: number | null; tient: boolean }>('/api/cv/composer', envoi('POST', d));
// ANCHOR: assemblage par le modèle local (ligne 166) : métier et compétences à mettre en avant, en identifiants du Profil ; le CV se compose ensuite par composerCv
export const assemblerCv = (offre_id: string, force = false) =>
  appel<{ metier: string; competences: string[]; competences_noms: string[]; motif: string; modele: string; duree_ms: number }>('/api/cv/assembler', { ...envoi('POST', { offre_id, ...(force ? { force } : {}) }), signal: AbortSignal.timeout(130_000) });
export const supprimerVersionCv = (id: string) => appel('/api/cv/versions/' + encodeURIComponent(id), { method: 'DELETE' });
export const lienPdfVersion = (id: string) => `/api/cv/versions/${encodeURIComponent(id)}/pdf`;

async function binaire(url: string, options?: RequestInit) {
  let r: Response;
  try {
    r = await fetch(url, options);
  } catch {
    throw new Error('Serveur injoignable : est-il lancé (npm start) ?');
  }
  if (!r.ok) {
    let data: any = null;
    try { data = await r.json(); } catch { /* réponse sans corps JSON */ }
    const e: ErreurApi = new Error(data?.erreur || 'Erreur HTTP ' + r.status);
    e.status = r.status;
    throw e;
  }
  return r;
}

export async function pdfCv(document: CvDocument, candidature_id = '') {
  const r = await binaire('/api/cv/pdf', envoi('POST', { document, candidature_id: candidature_id || undefined }));
  const nombre = (k: string) => Number(r.headers.get(k) ?? 0);
  return {
    pdf: await r.blob(),
    version: { id: r.headers.get('X-Cv-Version') ?? '', nom: decodeURIComponent(r.headers.get('X-Cv-Nom') ?? 'CV'), ecarts: nombre('X-Cv-Ecarts'), avertissements: nombre('X-Cv-Avertissements') },
  };
}

// ANCHOR: lettre de motivation (ligne 178) : brouillon rédigé par le modèle local, textarea enregistré par PUT (base_maj_le évite d'écraser une réécriture de Claude), exports PDF et Word
export const redigerLettre = (offre_id: string, matrice: LettreMatrice, force = false) =>
  appel<{ objet: string; texte: string; paragraphes: { bloc: string; texte: string }[]; modele: string; duree_ms: number }>('/api/lettre/rediger', { ...envoi('POST', { offre_id, matrice, ...(force ? { force } : {}) }), signal: AbortSignal.timeout(200_000) });
export type PreparationLettre = { etat: 'attente' | 'ok' | 'echec' | 'existe' | null; modele?: string; duree_ms?: number; erreur?: string; code?: string };
export const preparerLettre = (offre_id: string) => appel<PreparationLettre>('/api/lettre/preparer', envoi('POST', { offre_id }));
export const etatPreparationLettre = (offre_id: string) => appel<PreparationLettre>('/api/lettre/preparer/' + encodeURIComponent(offre_id));
export const lireBrouillon = (cle: string) => appel<LettreBrouillon | null>('/api/lettre/brouillons/' + encodeURIComponent(cle));
export const ecrireBrouillon = (cle: string, d: Partial<LettreBrouillon> & { base_maj_le?: string }) => appel<LettreBrouillon>('/api/lettre/brouillons/' + encodeURIComponent(cle), envoi('PUT', d));
export const controlerLettre = (texte: string, cle: string, matrice: LettreMatrice) => appel<ControleLettre>('/api/lettre/controler', envoi('POST', { texte, cle, matrice }));
export const enregistrerStyle = (st: LettreStyle) => appel<LettreStyle>('/api/lettre/style', envoi('PUT', st));
export const enregistrerMatrice = (m: LettreMatrice) => appel<LettreMatrice>('/api/lettre/matrice', envoi('PUT', m));
export const supprimerVersionLettre = (id: string) => appel('/api/lettre/versions/' + encodeURIComponent(id), { method: 'DELETE' });
export const lienVersionLettre = (id: string, format: 'pdf' | 'docx') => `/api/lettre/versions/${encodeURIComponent(id)}/${format}`;
export const envoyerSignature = (fichier: File) => appel('/api/signature', { method: 'POST', headers: { 'Content-Type': fichier.type || 'application/octet-stream' }, body: fichier });
export const supprimerSignature = () => appel('/api/signature', { method: 'DELETE' });
export const envoyerPhoto = (fichier: File) => appel('/api/photo', { method: 'POST', headers: { 'Content-Type': fichier.type || 'application/octet-stream' }, body: fichier });
export const supprimerPhoto = () => appel('/api/photo', { method: 'DELETE' });
export async function exporterLettre(format: 'pdf' | 'docx', d: { lettre: unknown; cle: string; candidature_id?: string; origine?: string }) {
  const r = await binaire('/api/lettre/' + format, envoi('POST', d));
  const nombre = (k: string) => Number(r.headers.get(k) ?? 0);
  return {
    fichier: await r.blob(),
    version: { id: r.headers.get('X-Lettre-Version') ?? '', nom: decodeURIComponent(r.headers.get('X-Lettre-Nom') ?? 'Lettre'), ecarts: nombre('X-Lettre-Ecarts'), avertissements: nombre('X-Lettre-Avertissements') },
  };
}

export const chargerOffres = () => appel<Offre[]>('/api/offres');
export const creerOffre = (d: unknown) => appel('/api/offres', envoi('POST', d));
export const majOffre = (id: string, champs: unknown) => appel('/api/offres/' + encodeURIComponent(id), envoi('PATCH', champs));
export const supprimerOffre = (id: string) => appel('/api/offres/' + encodeURIComponent(id), { method: 'DELETE' });

export const chargerVeille = () => appel('/api/veille');
export const etatSynchro = () => appel('/api/sync');
export const lancerSynchro = () => appel('/api/sync', { method: 'POST' });

export const etatAnalyse = (avecConsigne = false) => appel('/api/analyse' + (avecConsigne ? '?consigne=1' : ''));
export const lancerAnalyse = (refaire = false) => appel('/api/analyse' + (refaire ? '?refaire=1' : ''), { method: 'POST' });

// ANCHOR: profil synthétique et sujets de veille (ligne 86). POST lance en arrière-plan, GET suit l'avancement
export const etatSyntheses = () => appel<Syntheses>('/api/ia');
export const lancerSynthese = (cle: 'profil' | 'veille') => appel<Syntheses>('/api/ia/' + cle, { method: 'POST' });

// ANCHOR: Google Agenda (ligne 120). La connexion est une navigation (page de consentement de Google), le serveur renvoie ensuite vers cette origine
export const etatAgenda = () => appel<EtatAgenda>('/api/agenda');
export const lienConnexionAgenda = () => '/api/agenda/connexion?retour=' + encodeURIComponent(location.origin);
export const deconnecterAgenda = () => appel<EtatAgenda & { revoque: boolean }>('/api/agenda/deconnexion', { method: 'POST' });
export const calendriersAgenda = () => appel<CalendrierGoogle[]>('/api/agenda/calendriers');
export const choisirCalendrier = (calendrier_id: string) => appel<EtatAgenda>('/api/agenda', envoi('PUT', { calendrier_id }));
export const evenementsAgenda = (frais = false) => appel<{ du: string; au: string; evenements: EvenementAgenda[] }>('/api/agenda/evenements' + (frais ? '?frais=1' : ''));
// NOTE: période libre (AAAA-MM-JJ), utilisée par l'onglet Agenda ; la réponse marque les événements rattachés (rdv) et reprend les changements faits dans Google
export const evenementsPeriode = (du: string, au: string, frais = false) => appel<{ du: string; au: string; evenements: EvenementAgenda[] }>(`/api/agenda/evenements?du=${du}&au=${au}${frais ? '&frais=1' : ''}`);

// ANCHOR: rendez-vous (ligne 121) : écrits par le serveur, qui les envoie ensuite à Google (synchro dans la réponse)
export const creerRdv = (d: RendezVousSaisie) => appel<RendezVous>('/api/rendez_vous', envoi('POST', d));
export const modifierRdv = (id: string, d: RendezVousSaisie) => appel<RendezVous>('/api/rendez_vous/' + encodeURIComponent(id), envoi('PATCH', d));
export const supprimerRdv = (id: string, localSeulement = false) => appel<{ ok: boolean }>('/api/rendez_vous/' + encodeURIComponent(id) + (localSeulement ? '?local=1' : ''), { method: 'DELETE' });
export const rattacherEvenement = (google_id: string, liens: { offre_id?: string | null; candidature_id?: string | null; contact_id?: string | null }) => appel<RendezVous>('/api/rendez_vous/rattacher', envoi('POST', { google_id, ...liens }));

export const chargerReglages =() => appel<{ reglages: Reglages; origine: string }>('/api/reglages');
export const apercuReglages = (reglages: Reglages) => appel('/api/reglages?apercu=1', envoi('PUT', reglages));
export const chargerPlateformes = () => appel<{ plateformes: string[] }>('/api/plateformes');
export const enregistrerPlateformes = (plateformes: string[]) => appel<{ plateformes: string[] }>('/api/plateformes', envoi('PUT', plateformes));
export const chargerTrajets = () => appel<{ trajets: Trajets }>('/api/trajets');
export const enregistrerTrajets = (trajets: Trajets) => appel('/api/trajets', envoi('PUT', trajets));
export const enregistrerReglages = (reglages: Reglages) => appel('/api/reglages', envoi('PUT', reglages));

// Rapport d'activité (compteurs par jour) et événements bruts du journal
const requeteRapport = (du?: string, au?: string, grain = 'jour') => `grain=${grain}${du ? '&du=' + du : ''}${au ? '&au=' + au : ''}`;
export const chargerRapport = (du?: string, au?: string, grain = 'jour') => appel(`/api/rapport?${requeteRapport(du, au, grain)}`);
export const lienRapportCsv = (du?: string, au?: string, grain = 'jour') => `/api/rapport?${requeteRapport(du, au, grain)}&format=csv`;
export const verifierOffre = (id: string): Promise<{ statut: 'en_ligne' | 'cloturee' | 'inconnu'; protegee: boolean; marquee: boolean }> => appel(`/api/offres/${encodeURIComponent(id)}/verifier`, { method: 'POST' });
export const vueCandidature = (id: string) => appel(`/api/candidatures/${encodeURIComponent(id)}/vue`, { method: 'POST' });
export const chargerJournal = (du: string, limite = 300, au = '', entite = '') => appel(`/api/journal?du=${du}${au ? `&au=${au}` : ''}${entite ? `&entite=${entite}` : ''}&limite=${limite}`);

// ANCHOR: compétences demandées par une annonce, relevées par le modèle local (ligne 148). POST lance en arrière-plan, GET suit
export const competencesOffre = (id: string) => appel<CompetencesOffre>('/api/offres/' + encodeURIComponent(id) + '/competences');
export const lancerCompetencesOffre = (id: string, refaire = false) => appel<CompetencesOffre>('/api/offres/' + encodeURIComponent(id) + '/competences' + (refaire ? '?refaire=1' : ''), { method: 'POST' });
export const competencesDeCandidature = (id: string) => appel<CompetencesOffre>('/api/candidatures/' + encodeURIComponent(id) + '/competences-offre');
export const ignorerCompetence = (valeur: string) => appel('/api/competences-ignorees', envoi('POST', { valeur }));

// ANCHOR: candidatures spontanées (API La Bonne Boite) : recherche par code ROME autour d'un point de départ des trajets, suivi par SIRET
export type Entreprise = { siret: string; nom: string; secteur: string; effectif: string; ville: string; code_postal: string; departement: string; lat: number | null; lon: number | null; distance_km: number | null; potentiel: number | null; haut_potentiel: boolean };
export type StatutEntreprise = 'gardee' | 'ecartee' | 'contactee';
export type SuiviEntreprises = Record<string, { statut: StatutEntreprise; nom: string; ville: string; maj: string }>;
export const chargerEntreprises = (rome: string, distance: number, depart = 0) =>
  appel<{ actif: boolean; depart?: string; total: number; entreprises: Entreprise[] }>(`/api/entreprises?rome=${encodeURIComponent(rome)}&distance=${distance}&depart=${depart}`);
export const chargerSuiviEntreprises = () => appel<{ suivi: SuiviEntreprises }>('/api/entreprises/suivi');
export const majSuiviEntreprise = (siret: string, d: { statut: StatutEntreprise | null; nom?: string; ville?: string }) => appel<{ siret: string; statut: StatutEntreprise | null }>('/api/entreprises/suivi/' + encodeURIComponent(siret), envoi('PUT', d));

export type PointMarche = { periode: string; offres: number | null; demandeurs: number | null; offres_pour_100: number | null };
export type MetierMarche = { evolution_pct?: number | null; historique?: PointMarche[]; cle: string; rome: string; libelle: string; periode: string; offres: number | null; offres_12_mois: number | null; demandeurs: number | null; offres_pour_100: number | null };
export type Marche = { actif: boolean; jour?: string; departement?: string; territoire?: string; metiers: MetierMarche[]; obsolete?: boolean; erreur?: string };
export const chargerMarche = (force = false) => appel<Marche>('/api/marche' + (force ? '?force=1' : ''));
