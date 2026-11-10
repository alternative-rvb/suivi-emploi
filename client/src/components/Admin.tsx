import { CloudDownload, RefreshCw, Search, Sparkles, UserPlus } from 'lucide-react';
import { SqLignes } from './Squelettes.tsx';
import { useEffect, useState } from 'react';
import { enregistrerPlateformes, etatAnalyse, etatSynchro, lancerAnalyse, lancerSynchro } from '../api.ts';
import { norm } from '../utils.ts';
import AgendaAdmin from './AgendaAdmin.tsx';
import EtatTraitements from './EtatTraitements.tsx';
import MotsEditables from './MotsEditables.tsx';
import { definirPlateformes, usePlateformes } from '../plateformes.ts';
import { dateHeure as heure } from '../format.ts';
import { useHauteur } from '../useHauteur.ts';
import { useEtatAnalyse } from '../useTraitements.ts';

// ANCHOR: plateformes qui obligent à recréer un compte pour postuler (kv plateformes_compte, ligne 158). Chaque ajout ou retrait s'enregistre tout de suite, l'icône apparaît sur les offres qui la mentionnent
function PlateformesCompte() {
  const plateformes = usePlateformes();
  const [erreur, setErreur] = useState('');
  const sauver = async (liste: string[]) => {
    setErreur('');
    try { definirPlateformes((await enregistrerPlateformes(liste)).plateformes); } catch (e) { setErreur(e.message); }
  };
  const ajouter = (v: string) => {
    const nom = v.trim();
    if (!plateformes.some(p => norm(p) === norm(nom))) sauver([...plateformes, nom]);
  };
  return (
    <div className="carte">
      <h3 className="carte-titre"><UserPlus size={17} aria-hidden="true" />Plateformes à compte obligatoire <span className="count muted small">{plateformes.length}</span></h3>
      <p className="muted small">Plateformes qui obligent à recréer un compte pour postuler. Une icône le signale sur les offres dont l'employeur, la source ou « Postuler via » correspond, avant de perdre du temps.</p>
      <MotsEditables valeurs={plateformes} onAjout={ajouter} onRetrait={v => sauver(plateformes.filter(x => x !== v))} placeholder="Ex. Collective.work"
        label="Ajouter une plateforme à compte obligatoire" Icone={UserPlus} vide="Aucune." />
      {erreur && <p className="warn small" role="alert">{erreur}</p>}
    </div>
  );
}

// NOTE: motifs affichés quand la détection des offres clôturées (absentes de la recherche France Travail) n'a rien marqué
const MOTIFS_CLOTURE = {
  incomplete: 'Détection des offres clôturées suspendue : une recherche a échoué ou atteint le plafond de résultats.',
  reglages: 'Détection des offres clôturées reprise à la prochaine synchro : les réglages de recherche ont changé.',
  volume: 'Détection des offres clôturées suspendue : trop d\'offres absentes d\'un coup, rien n\'est marqué.',
  sans_controle: 'Détection des offres clôturées suspendue : le contrôle unitaire n\'est pas disponible.',
  vide: 'Détection des offres clôturées suspendue : la recherche n\'a renvoyé aucune offre.',
};

// Page d'administration : réglages globaux de l'app (sources, IA, plateformes, agenda). Ce qui est propre à l'utilisateur vit au Profil (Recherche d'offres, Trajets et revenu, ligne 255)
export default function Admin({ allerRecherche }: { allerRecherche: () => void }) {
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [synchro, setSynchro] = useState<any>(null);
  // NOTE: même relevé que la barre d'état (useEtatAnalyse), relancé aussitôt après le bouton d'analyse
  const { analyse, setAnalyse, relever } = useEtatAnalyse();
  const [instructions, setInstructions] = useState<any>(null);
  // NOTE: erreur du bouton d'analyse, affichée dans la carte IA et non sous Sources d'offres
  const [erreurIa, setErreurIa] = useState('');

  // NOTE: un échec de lecture de l'état laisse un objet vide, pour sortir du squelette de la carte Sources d'offres
  useEffect(() => { etatSynchro().then(setSynchro).catch(() => setSynchro({})); }, []);
  // Instructions envoyées au modèle : lues une fois, elles ne changent qu'avec le profil ou une nouvelle version de la consigne
  useEffect(() => { etatAnalyse(true).then(a => setInstructions({ consigne: a.consigne, schema: a.schema, poids: a.poids })).catch(() => setInstructions(false)); }, []);

  const synchroniser = async () => {
    setOccupe(true); setMessage(''); setErreur('');
    try {
      const r = await lancerSynchro();
      setSynchro({ enCours: false, dernier: r });
      setMessage(`Synchronisation terminée : ${r.stats?.nouvelles ?? 0} nouvelle(s) offre(s), ${r.enBase} en base.`);
    } catch (e) { setErreur(e.message); etatSynchro().then(setSynchro).catch(() => {}); } finally { setOccupe(false); }
  };

  const analyser = async refaire => {
    setErreurIa('');
    try { setAnalyse(await lancerAnalyse(refaire)); relever(); } catch (e) { setErreurIa(e.message); }
  };

  const dernier = synchro?.dernier;
  // NOTE: hauteurs réelles mémorisées des deux premières cartes, reprises tant que leur état n'est pas arrivé, pour ne pas pousser les cartes suivantes
  const sources = useHauteur('admin.sources', 110, synchro !== null);
  // NOTE: la carte IA n'est complète qu'avec l'état et les instructions (lues à part, false si indisponibles)
  const iaPrete = analyse !== null && instructions !== null;
  const ia = useHauteur('admin.analyse', 250, iaPrete);
  return (
    // NOTE: cartes dans l'ordre du chemin des offres : récupération, analyse par l'IA, signalement au moment de postuler, puis la connexion à l'agenda, réglée une fois
    <div className="admin">
      <div className="carte" ref={sources.ref} style={synchro === null ? { minHeight: sources.hauteur } : undefined}>
        <h3 className="carte-titre"><CloudDownload size={17} aria-hidden="true" />Sources d'offres</h3>
        {synchro === null ? <div className="sqz" aria-busy="true" role="status" aria-label="Chargement de l'état de la synchro"><SqLignes n={1} /></div> : dernier ? (
          <p className="small">
            Dernière synchro : {heure(dernier.date)}, {dernier.ok ? 'réussie' : <b className="warn">en échec</b>}
            {dernier.ok && dernier.providers?.length > 0 && <> via {dernier.providers.map(p => p.nom).join(', ')}</>}
            {dernier.ok && dernier.enBase != null && <>, {dernier.enBase} offres en base</>}.
            {!dernier.ok && <> {dernier.erreur}</>}
            {dernier.ok && dernier.echecs?.length > 0 && <> Source en échec : {dernier.echecs.map(e => `${e.nom} (${e.erreur})`).join(' ')}</>}
            {dernier.ok && dernier.expiration && <> {dernier.expiration.marquees > 0 ? `${dernier.expiration.marquees} offre${dernier.expiration.marquees > 1 ? 's' : ''} clôturée${dernier.expiration.marquees > 1 ? 's' : ''} marquée${dernier.expiration.marquees > 1 ? 's' : ''} expirée${dernier.expiration.marquees > 1 ? 's' : ''}.` : MOTIFS_CLOTURE[dernier.expiration.ignoree] ?? 'Aucune offre clôturée détectée.'}</>}
          </p>
        ) : <p className="muted small">Aucune synchro depuis le démarrage du serveur.</p>}
        <div className="admin-actions">
          <button type="button" className="btn btn-ghost small" onClick={synchroniser} disabled={occupe || synchro?.enCours}><RefreshCw size={15} className={synchro?.enCours ? 'tourne' : ''} />{synchro?.enCours ? 'Synchro en cours...' : 'Synchroniser maintenant'}</button>
          <button type="button" className="btn btn-ghost small" onClick={allerRecherche} title="Profil > Filtrer et optimiser > Recherche d'offres"><Search size={15} />Zones, mots-clés et exclusions</button>
        </div>
        {erreur && <p className="alert" role="alert">{erreur}</p>}
        {message && <p className="small" role="status">{message}</p>}
      </div>

      <div className="carte" ref={ia.ref} style={iaPrete ? undefined : { minHeight: ia.hauteur }}>
        <h3 className="carte-titre"><Sparkles size={17} aria-hidden="true" />Analyse des annonces par l'IA</h3>
        <EtatTraitements sansSynchro analyse={analyse} />
        {analyse?.actif && (
          <>
            <p className="muted small">Fournisseur : {analyse.nom}, modèle {analyse.modele}, {analyse.url}. Version de la consigne : {analyse.version_consigne}.</p>
            <div className="admin-actions">
              <button type="button" className="btn btn-ghost small" onClick={() => analyser(false)} disabled={analyse.enCours}><Sparkles size={15} />{analyse.enCours ? 'Analyse en cours...' : 'Analyser les nouvelles offres'}</button>
              <button type="button" className="btn btn-ghost small" onClick={() => analyser(true)} disabled={analyse.enCours} title="Reprend toutes les offres, y compris celles déjà analysées">Tout refaire</button>
            </div>
          </>
        )}
        {erreurIa && <p className="alert" role="alert">{erreurIa}</p>}
        <details className="instructions">
          <summary>Ce que fait le modèle, étape par étape</summary>
          {/* NOTE: vue d'ensemble des six usages du modèle local, dans l'ordre du travail, affichée même sans les instructions ; seule la consigne de l'étape 1 est détaillée dans le bloc suivant */}
          <p className="muted small">Le modèle ne note rien et n'invente rien : il répond selon un format imposé, et l'application vérifie chaque réponse (citation de l'annonce ou du Profil) avant de s'en servir.</p>
          <ol className="veille-etapes">
            <li><b>Analyse des annonces</b> (onglet Offres, après chaque synchro, au démarrage ou avec le bouton ci-dessus) : il répond à des questions fermées sur l'annonce (famille de métier, niveau du poste, diplôme exigé, années demandées, logiciels) en citant le texte. L'application calcule la note à partir de ces réponses.</li>
            <li><b>Compétences de l'offre</b> (fiche d'une offre, à l'ouverture) : il relève les compétences techniques citées par l'annonce. L'application les compare au Profil (au Profil, proche, absente), sans proposer de niveau.</li>
            <li><b>CV sur mesure</b> (onglet CV/LM, vue CV, en arrivant depuis une offre ou avec le bouton) : il choisit, sans rien rédiger, le métier visé et les compétences du Profil à mettre en avant. L'application compose ensuite le CV.</li>
            <li><b>Brouillon de lettre</b> (onglet CV/LM, vue Lettre, bouton) : il rédige un premier jet à partir de l'annonce, de vos modèles de lettre et des faits du Profil. Le brouillon reste modifiable et passe par le contrôle des faits.</li>
            <li><b>Profil vu par un RH</b> (Profil &gt; Synthèse et badges, bouton) : il lit le Profil comme un recruteur et propose un titre, une séniorité, une synthèse, des points forts (chacun appuyé sur un passage du Profil), des points d'attention et les métiers qui correspondent.</li>
            <li><b>Suggestions pour la recherche</b> (Profil &gt; Recherche d'offres, bouton) : il lit les candidatures et les réglages actuels, puis propose des mots-clés, zones, employeurs ou mots exclus à ajouter. Rien n'est enregistré sans votre validation.</li>
          </ol>
        </details>
        {instructions && (
          <details className="instructions">
            <summary>Instructions envoyées au modèle : analyse des annonces</summary>
            <p className="muted small">Message système, identique pour toutes les offres. La partie « Contexte » est construite à partir des compétences et formations du Profil. Pour chaque offre, le modèle reçoit ensuite le titre, l'entreprise, le lieu, le contrat et le texte de l'annonce (6 000 caractères au plus).</p>
            <pre className="instructions-texte">{instructions.consigne}</pre>
            <p className="muted small">Format de réponse imposé (schéma JSON) :</p>
            <pre className="instructions-texte">{JSON.stringify(instructions.schema, null, 2)}</pre>
            <p className="muted small">Poids de la note, calculée par l'application (réglables dans <code>POIDS</code>, fichier <code>lib/analyse/questions.mjs</code>) :</p>
            <pre className="instructions-texte">{JSON.stringify(instructions.poids, null, 2)}</pre>
          </details>
        )}
      </div>

      <PlateformesCompte />
      <AgendaAdmin />
    </div>
  );
}
