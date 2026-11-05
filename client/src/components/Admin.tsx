import { Check, Plus, RefreshCw, Save, Sparkles, Trash2, Undo2, UserPlus, X } from 'lucide-react';
import { SqCarte } from './Squelettes.tsx';
import { useEffect, useMemo, useState } from 'react';
import { geocoderAdresse } from '../geo.ts';
import { apercuReglages, chargerOffres, enregistrerPlateformes, chargerTrajets, enregistrerTrajets, chargerReglages, enregistrerReglages, etatAnalyse, etatSynchro, lancerAnalyse, lancerSynchro } from '../api.ts';
import { CONTRATS } from '../constants.ts';
import { DEPARTEMENTS } from '../departements.ts';
import { norm } from '../utils.ts';
import AgendaAdmin from './AgendaAdmin.tsx';
import EtatTraitements from './EtatTraitements.tsx';
import BlocRepliable from './BlocRepliable.tsx';
import Suggestions from './Suggestions.tsx';
import { definirPlateformes, usePlateformes } from '../plateformes.ts';
import Veille from './Veille.tsx';
import VeilleIa from './VeilleIa.tsx';
import { dateHeure as heure } from '../format.ts';

const CHAMPS = [
  { cle: 'zones', titre: 'Zones (départements)', aide: 'Codes à 2 ou 3 chiffres : 83, 13, 06, 2A. Une zone retirée retire aussi ses offres déjà en base.', exemple: '83', couleur: 'var(--c-blue)', majuscules: true, libelle: v => DEPARTEMENTS[v] },
  { cle: 'mots_cles', titre: 'Mots-clés recherchés', aide: 'Une recherche est lancée pour chaque mot-clé dans chaque zone. Plus il y en a, plus la synchro est longue.', exemple: 'comptable', couleur: 'var(--c-green)' },
  { cle: 'mots_exclus', titre: "Mots exclus dans l'intitulé", aide: 'Une offre dont le titre contient un de ces mots est écartée, y compris celles déjà en base.', exemple: 'franchise', couleur: 'var(--c-red)' },
  { cle: 'contrats_exclus', titre: 'Contrats exclus', aide: 'Codes France Travail à trois lettres : FRA franchise, STA stage, CDD, CDI, MIS intérim, LIB libéral...', exemple: 'FRA', couleur: 'var(--c-orange)', majuscules: true, libelle: v => CONTRATS[v] },
  { cle: 'entreprises', titre: 'Employeurs surveillés', aide: "Leurs offres passent même si l'intitulé ne contient pas le mot-clé cherché.", exemple: 'nom de l\'entreprise', couleur: 'var(--c-violet)' },
];

// Suggestions par champ : codes connus pour les zones et contrats, vocabulaire des offres déjà reçues pour le reste
const MOTS_VIDES = new Set(['homme', 'femme', 'avec', 'dans', 'pour', 'chez', 'sans', 'plus', 'tout', 'tous', 'poste', 'offre', 'h/f', 'f/h']);
function suggestionsDepuis(offres) {
  const compte = (liste, min) => {
    const n = new Map<any, any>();
    for (const x of liste) if (x) n.set(x, (n.get(x) ?? 0) + 1);
    return [...n].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map(([x]) => x);
  };
  const titres = offres.map(o => (o.titre || '').replace(/\((h|f)\/(h|f)\)|\bh\/f\b|\bf\/h\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase());
  const mots = offres.flatMap(o => norm(o.titre || '').split(/[^a-z0-9]+/)).filter(m => m.length >= 4 && !MOTS_VIDES.has(m));
  return {
    zones: Object.entries(DEPARTEMENTS).map(([c, n]) => c + SEP + n),
    mots_cles: compte(titres.filter(t => t.length <= 50), 2),
    mots_exclus: compte(mots, 2),
    contrats_exclus: Object.entries(CONTRATS).map(([c, n]) => c + SEP + n),
    entreprises: compte(offres.map(o => (o.entreprise || '').trim()), 1).sort((a, b) => a.localeCompare(b, 'fr')),
  };
}

const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ANCHOR: liste de pastilles modifiable avec suggestions. Entrée ou virgule ajoute, plusieurs éléments collés d'un coup sont acceptés.
// NOTE: une suggestion de la forme "83 · Var" ajoute seulement le code avant le séparateur
const SEP = ' · ';
function ListeEditable({ champ, valeurs, onChange, options, modifie = false }) {
  const [saisie, setSaisie] = useState('');
  const ajouter = texte => {
    const nouveaux = String(texte).split(/[,\n;]/).map(t => t.trim().replace(/\s+/g, ' ')).filter(Boolean)
      .map(t => (t.includes(SEP) ? t.split(SEP)[0] : t)).map(t => (champ.majuscules ? t.toUpperCase() : t));
    if (!nouveaux.length) return;
    const connus = new Set(valeurs.map(v => v.toLowerCase()));
    const retenus = nouveaux.filter(t => !connus.has(t.toLowerCase()) && connus.add(t.toLowerCase()));
    if (retenus.length) onChange([...valeurs, ...retenus]);
    setSaisie('');
  };
  // Suggestions : celles déjà ajoutées ne sont plus proposées
  const restantes = useMemo(() => {
    const pris = new Set(valeurs.map(v => v.toLowerCase()));
    return options.filter(o => !pris.has((o.includes(SEP) ? o.split(SEP)[0] : o).toLowerCase()));
  }, [options, valeurs]);
  return (
    // ANCHOR: carte pleine largeur repliable (ligne 104), résumé des premières valeurs quand elle est fermée
    <BlocRepliable id={champ.cle} memoire="admin" className="reglage-liste" style={{ '--c': champ.couleur }} titre={champ.titre}
      pastille={<span className="count muted small">{valeurs.length}{modifie && <span className="warn"> · modifié</span>}</span>}
      resume={valeurs.slice(0, 8).join(', ') + (valeurs.length > 8 ? ', ...' : '')}>
      <p className="muted small">{champ.aide}</p>
      <div className="ajout-ligne ajout-groupe" onKeyDown={e => { if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); ajouter(saisie); } }}>
        <Suggestions value={saisie} onChange={e => setSaisie(e.target.value)} onCommit={ajouter} options={restantes}
          placeholder={`Ex. ${champ.exemple}`} aria-label={`Ajouter à ${champ.titre}`} />
        <button type="button" className="btn btn-primary" onClick={() => ajouter(saisie)} disabled={!saisie.trim()} title="Ajouter à la liste"><Plus size={16} />Ajouter</button>
      </div>
      {valeurs.length > 0 ? (
        <ul className="mots">
          {valeurs.map(v => (
            <li key={v} className="badge" style={{ '--c': champ.couleur }} title={champ.libelle?.(v) || undefined}>
              {v}{champ.libelle?.(v) && <span className="muted"> {champ.libelle(v)}</span>}
              <button type="button" className="badge-retrait" aria-label={`Retirer ${v}`} onClick={() => onChange(valeurs.filter(x => x !== v))} title={`Retirer ${v}`}><X size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">Aucun.</p>}
    </BlocRepliable>
  );
}

// ANCHOR: plateformes qui obligent à recréer un compte pour postuler (kv plateformes_compte, ligne 158). Chaque ajout ou retrait s'enregistre tout de suite, l'icône apparaît sur les offres qui la mentionnent
function PlateformesCompte() {
  const plateformes = usePlateformes();
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState('');
  const sauver = async (liste: string[]) => {
    setErreur('');
    try { definirPlateformes((await enregistrerPlateformes(liste)).plateformes); } catch (e) { setErreur(e.message); }
  };
  const ajouter = (v: string) => {
    const nom = v.trim();
    if (!nom) return;
    setSaisie('');
    if (!plateformes.some(p => norm(p) === norm(nom))) sauver([...plateformes, nom]);
  };
  return (
    <div className="carte">
      <h3 className="carte-titre"><UserPlus size={17} aria-hidden="true" />Plateformes à compte obligatoire <span className="count muted small">{plateformes.length}</span></h3>
      <p className="muted small">Plateformes qui obligent à recréer un compte pour postuler. Une icône le signale sur les offres dont l'employeur, la source ou « Postuler via » correspond, avant de perdre du temps.</p>
      <div className="ajout-ligne ajout-groupe" onKeyDown={e => { if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); ajouter(saisie); } }}>
        <Suggestions value={saisie} onChange={e => setSaisie(e.target.value)} onCommit={ajouter} options={[]} placeholder="Ex. Collective.work" aria-label="Ajouter une plateforme à compte obligatoire" />
        <button type="button" className="btn btn-primary" onClick={() => ajouter(saisie)} disabled={!saisie.trim()} title="Ajouter à la liste"><Plus size={16} />Ajouter</button>
      </div>
      {erreur && <p className="warn small" role="alert">{erreur}</p>}
      {plateformes.length > 0 ? (
        <ul className="mots">
          {plateformes.map(v => (
            <li key={v} className="badge">
              <UserPlus size={13} aria-hidden="true" />{v}
              <button type="button" className="badge-retrait" aria-label={`Retirer ${v}`} onClick={() => sauver(plateformes.filter(x => x !== v))} title={`Retirer ${v}`}><X size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">Aucune.</p>}
    </div>
  );
}

// Page d'administration : état des sources, réglages de recherche, copie lecture seule de la veille n8n
// ANCHOR: points de départ des trajets et coût du kilomètre (kv trajets). Enregistrement séparé des réglages de recherche
function Trajets() {
  const [enregistre, setEnregistre] = useState<any>(null);
  const [brouillon, setBrouillon] = useState<any>(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { chargerTrajets().then(d => { setEnregistre(d.trajets); setBrouillon(d.trajets); }).catch(e => setErreur(e.message)); }, []);
  if (!brouillon) return erreur ? <div className="carte"><h3 className="carte-titre">Trajets</h3><p className="muted small">{erreur}</p></div> : <SqCarte lignes={3} label="Chargement des trajets" />;

  const modifie = JSON.stringify(brouillon) !== JSON.stringify(enregistre);
  const maj = f => { setBrouillon(b => f(b)); setMessage(''); setErreur(''); };
  // NOTE: le message nomme ce qui a réellement changé (points de départ, coût du trajet, attentes de revenu)
  const PARTIES_TRAJETS: [string, string[]][] = [
    ['points de départ', ['departs']],
    ['coût du trajet', ['carburant', 'prix_litre', 'conso_100', 'peage_km', 'jours_defaut']],
    ['attentes de revenu', ['attente_annuelle', 'tjm']],
  ];
  const changees = PARTIES_TRAJETS.filter(([, cles]) => cles.some(k => JSON.stringify(brouillon[k] ?? null) !== JSON.stringify(enregistre[k] ?? null))).map(([nom]) => nom);
  const sauver = async () => {
    const quoi = changees.length ? changees.join(', ') : 'réglages';
    setOccupe(true); setErreur(''); setMessage('');
    try {
      // NOTE: les coordonnées sont retrouvées à partir de la commune quand elle a changé
      const departs: any[] = [];
      for (const d of brouillon.departs) {
        const avant = enregistre.departs.find(e => e.nom === d.nom && e.adresse === d.adresse);
        if (avant) { departs.push(avant); continue; }
        const c = await geocoderAdresse(d.adresse);
        if (!c) throw new Error(`Adresse introuvable: ${d.adresse}. Précisez la rue, le code postal et la ville.`);
        departs.push({ ...d, trouve: c.label, lon: c.lon, lat: c.lat });
      }
      const r = await enregistrerTrajets({ departs, carburant: brouillon.carburant, prix_litre: Number(brouillon.prix_litre), conso_100: Number(brouillon.conso_100), peage_km: Number(brouillon.peage_km ?? 0.1), attente_annuelle: Number(brouillon.attente_annuelle ?? 0), tjm: Number(brouillon.tjm ?? 0), peage_jour: 0, // NOTE: le péage est estimé automatiquement, plus de valeur par défaut à saisir
 jours_defaut: Number(brouillon.jours_defaut) || 0 });
      setEnregistre(r.trajets); setBrouillon(r.trajets); setMessage(`Enregistré : ${quoi.charAt(0).toUpperCase() + quoi.slice(1)}.`);
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  return (
    <div className="carte">
      <h3 className="carte-titre">Trajets et revenu attendu</h3>
      <h4 className="admin-sous-titre">Points de départ</h4>
      <p className="muted small">La fiche d'une offre affiche, depuis chaque point de départ, la distance par la route, la durée et le coût d'un aller-retour par jour de présence (carburant : consommation × prix du litre, plus un péage estimé, sans usure). Le trajet part de l'adresse saisie et arrive au centre de la commune de l'offre.</p>
      <div className="trajets-liste">
        {brouillon.departs.map((d, i) => (
          <div className="trajets-ligne" key={i}>
            <input className="input" aria-label="Nom du point de départ" placeholder="Nom (Domicile)" value={d.nom} onChange={e => maj(b => ({ ...b, departs: b.departs.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)) }))} />
            <span className="trajets-adresse">
              <input className="input" aria-label="Adresse" placeholder="Adresse (12 rue des Lilas, 13001 Marseille)" value={d.adresse} onChange={e => maj(b => ({ ...b, departs: b.departs.map((x, j) => (j === i ? { ...x, adresse: e.target.value } : x)) }))} />
              {d.trouve && d.adresse === enregistre.departs[i]?.adresse && <span className="muted small">Trouvée: {d.trouve}</span>}
            </span>
            <button type="button" className="btn btn-ghost icon" aria-label={`Retirer ${d.nom || 'ce point'}`} title="Retirer" onClick={() => maj(b => ({ ...b, departs: b.departs.filter((_, j) => j !== i) }))}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="admin-actions">
        <button type="button" className="btn btn-ghost small" onClick={() => maj(b => ({ ...b, departs: [...b.departs, { nom: '', adresse: '', trouve: '', lon: 0, lat: 0 }] }))}><Plus size={15} />Ajouter un point de départ</button>
      </div>
      <h4 className="admin-sous-titre">Coût du trajet</h4>
      <div className="admin-actions trajets-carburant">
        <label className="field trajets-cout">Carburant
          <input className="input" value={brouillon.carburant} onChange={e => maj(b => ({ ...b, carburant: e.target.value }))} />
        </label>
        <label className="field trajets-cout">Prix du litre (€)
          <input className="input" type="number" min="0" max="10" step="0.01" value={brouillon.prix_litre} onChange={e => maj(b => ({ ...b, prix_litre: e.target.value }))} />
        </label>
        <label className="field trajets-cout">Consommation (L/100 km)
          <input className="input" type="number" min="0" max="40" step="0.1" value={brouillon.conso_100} onChange={e => maj(b => ({ ...b, conso_100: e.target.value }))} />
        </label>
        <label className="field trajets-cout">Péage estimé (€ par km à péage)
          <input className="input" type="number" min="0" max="2" step="0.01" value={brouillon.peage_km ?? 0.1} onChange={e => maj(b => ({ ...b, peage_km: e.target.value }))} />
        </label>
        <label className="field trajets-cout">Jours sur place par défaut
          <input className="input" type="number" min="0" max="400" value={brouillon.jours_defaut ?? 0} onChange={e => maj(b => ({ ...b, jours_defaut: e.target.value }))} />
        </label>
      </div>
      <p className="muted small">Le péage est estimé automatiquement : kilomètres d'autoroute à péage du trajet (calculés via Valhalla) × ce tarif. Sur une candidature, saisir un péage réel (Mappy, Vinci) pour un lieu remplace l'estimation. Les jours sur place préremplissent chaque nouveau lieu.</p>

      <h4 className="admin-sous-titre">Attentes de revenu</h4>
      <div className="admin-actions trajets-carburant">
        <label className="field trajets-cout">Salaire brut annuel (€)
          <input className="input" type="number" min="0" max="1000000" step="500" value={brouillon.attente_annuelle ?? 0} onChange={e => maj(b => ({ ...b, attente_annuelle: e.target.value }))} />
        </label>
        <label className="field trajets-cout">TJM (€ par jour)
          <input className="input" type="number" min="0" max="10000" step="10" value={brouillon.tjm ?? 0} onChange={e => maj(b => ({ ...b, tjm: e.target.value }))} />
        </label>
      </div>
      <p className="muted small">L'écart avec le salaire ou le TJM de chaque offre s'affiche à côté du salaire, du rouge (20 % en dessous ou plus) au vert (10 % au dessus ou plus). 0 désactive la comparaison.</p>
      {erreur && <p className="alert" role="alert">{erreur}</p>}
      {message && <p className="small" role="status">{message}</p>}
      <div className="admin-actions">
        <button type="button" className="btn btn-primary small" onClick={sauver} disabled={!modifie || occupe}><Save size={15} />Enregistrer</button>
        <button type="button" className="btn btn-ghost small" onClick={() => { setBrouillon(enregistre); setErreur(''); setMessage('Modifications annulées.'); }} disabled={!modifie || occupe}><Undo2 size={15} />Annuler</button>
      </div>
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

export default function Admin() {
  const [enregistre, setEnregistre] = useState<any>(null);
  const [origine, setOrigine] = useState('');
  const [brouillon, setBrouillon] = useState<any>(null);
  const [erreur, setErreur] = useState('');
  const [apercu, setApercu] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [synchro, setSynchro] = useState<any>(null);
  const [analyse, setAnalyse] = useState<any>(null);
  const [instructions, setInstructions] = useState<any>(null);
  const [offres, setOffres] = useState<any[]>([]);

  const charger = () => chargerReglages()
    .then(d => { setEnregistre(d.reglages); setBrouillon(d.reglages); setOrigine(d.origine); })
    .catch(e => setErreur(e.message));
  useEffect(() => {
    charger();
    etatSynchro().then(setSynchro).catch(() => {});
    chargerOffres().then(setOffres).catch(() => {}); // NOTE: les suggestions tirées des offres sont facultatives
  }, []);
  // Instructions envoyées au modèle : lues une fois, elles ne changent qu'avec le profil ou une nouvelle version de la consigne
  useEffect(() => { etatAnalyse(true).then(a => setInstructions({ consigne: a.consigne, schema: a.schema, poids: a.poids })).catch(() => {}); }, []);
  // NOTE: état de l'analyse relevé tant qu'un passage est en cours
  useEffect(() => {
    let actif = true;
    let minuteur;
    const verifier = () => etatAnalyse().then(a => {
      if (!actif) return;
      setAnalyse(a);
      if (a.actif) minuteur = setTimeout(verifier, a.enCours ? 2000 : 8000);
    }).catch(() => {});
    verifier();
    return () => { actif = false; clearTimeout(minuteur); };
  }, []);
  const suggestions = useMemo(() => suggestionsDepuis(offres), [offres]);

  if (erreur && !brouillon) return <p className="empty">Administration indisponible : {erreur}</p>;
  if (!brouillon) return <div className="notes-stack"><SqCarte lignes={5} label="Chargement de l'administration" /><SqCarte lignes={5} label="" /></div>;

  const modifie = !egal(brouillon, enregistre);
  const change = (cle, v) => { setBrouillon(b => ({ ...b, [cle]: v })); setApercu(null); setMessage(''); setErreur(''); };

  const demander = async () => {
    setErreur(''); setMessage(''); setOccupe(true);
    try {
      const { retirables } = await apercuReglages(brouillon);
      if (retirables.total > 0) setApercu(retirables); else await sauver();
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  const sauver = async () => {
    setErreur(''); setOccupe(true);
    try {
      const r = await enregistrerReglages(brouillon);
      setEnregistre(r.reglages); setBrouillon(r.reglages); setOrigine('app'); setApercu(null);
      setMessage(`Réglages enregistrés${r.retirees ? `, ${r.retirees} offre(s) retirée(s)` : ''}. Lancez une synchronisation pour appliquer les nouvelles recherches.`);
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  const synchroniser = async () => {
    setOccupe(true); setMessage(''); setErreur('');
    try {
      const r = await lancerSynchro();
      setSynchro({ enCours: false, dernier: r });
      setMessage(`Synchronisation terminée : ${r.stats?.nouvelles ?? 0} nouvelle(s) offre(s), ${r.enBase} en base.`);
    } catch (e) { setErreur(e.message); etatSynchro().then(setSynchro).catch(() => {}); } finally { setOccupe(false); }
  };

  const analyser = async refaire => {
    setErreur(''); setMessage('');
    try { setAnalyse(await lancerAnalyse(refaire)); } catch (e) { setErreur(e.message); }
  };

  const dernier = synchro?.dernier;
  return (
    <div className="admin">
      <AgendaAdmin />
      <Trajets />
      <PlateformesCompte />

      <div className="carte">
        <h3 className="carte-titre">Sources d'offres</h3>
        {dernier ? (
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
        </div>
      </div>

      <div className="carte">
        <h3 className="carte-titre">Analyse des annonces par l'IA</h3>
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
        {instructions && (
          <details className="instructions">
            <summary>Instructions envoyées au modèle</summary>
            <p className="muted small">Message système, identique pour toutes les offres. La partie « Contexte » est construite à partir des compétences et formations du Profil. Pour chaque offre, le modèle reçoit ensuite le titre, l'entreprise, le lieu, le contrat et le texte de l'annonce (6 000 caractères au plus).</p>
            <pre className="instructions-texte">{instructions.consigne}</pre>
            <p className="muted small">Format de réponse imposé (schéma JSON) :</p>
            <pre className="instructions-texte">{JSON.stringify(instructions.schema, null, 2)}</pre>
            <p className="muted small">Poids de la note, calculée par l'application (réglables dans <code>POIDS</code>, fichier <code>lib/analyse/questions.mjs</code>) :</p>
            <pre className="instructions-texte">{JSON.stringify(instructions.poids, null, 2)}</pre>
          </details>
        )}
      </div>


      <div className="carte">
        <h3 className="carte-titre">Réglages de recherche</h3>
        <p className="muted small">
          {origine === 'app'
            ? "Réglages propres à l'app : ils l'emportent sur la veille n8n pour les synchronisations d'ici."
            : "Réglages repris de la copie de la veille n8n. Les enregistrer ici les rend propres à l'app. La veille n8n et son Discord gardent leurs propres filtres."}
        </p>
      </div>
      <VeilleIa champs={CHAMPS} brouillon={brouillon} ajouter={(cle, valeurs) => change(cle, [...brouillon[cle], ...valeurs])} />
      <div className="reglages-listes">
        {CHAMPS.map(c => <ListeEditable key={c.cle} champ={c} valeurs={brouillon[c.cle]} options={suggestions[c.cle]} onChange={v => change(c.cle, v)} modifie={!egal(brouillon[c.cle], enregistre[c.cle])} />)}
      </div>

      {erreur && <p className="alert" role="alert">{erreur}</p>}
      {apercu && (
        <div className="alert" role="alert">
          <span><b>{apercu.total} offre(s) seront retirées de la base</b> : {apercu.hors_zone} hors des zones choisies, {apercu.exclues} avec un mot exclu. Les offres liées à une candidature et les offres saisies à la main sont conservées.</span>
          <span className="admin-actions">
            <button type="button" className="btn btn-primary small" onClick={sauver} disabled={occupe}><Check size={15} />Confirmer et enregistrer</button>
            <button type="button" className="btn btn-ghost small" onClick={() => setApercu(null)}>Annuler</button>
          </span>
        </div>
      )}
      {message && <p className="small" role="status">{message}</p>}
      <div className="admin-actions">
        <button type="button" className="btn btn-primary" onClick={demander} disabled={!modifie || occupe || Boolean(apercu)}><Save size={16} />Enregistrer les réglages</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setBrouillon(enregistre); setApercu(null); setErreur(''); }} disabled={!modifie || occupe}><Undo2 size={16} />Annuler les modifications</button>
        {modifie && <span className="warn small">Modifications non enregistrées</span>}
      </div>

      <Veille />
    </div>
  );
}
