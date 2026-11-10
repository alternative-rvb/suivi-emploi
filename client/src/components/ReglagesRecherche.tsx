import { Check, Info, Save, Search, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apercuReglages, chargerOffres, chargerReglages, enregistrerReglages } from '../api.ts';
import { CONTRATS } from '../constants.ts';
import { DEPARTEMENTS } from '../departements.ts';
import { norm } from '../utils.ts';
import AideModale from './AideModale.tsx';
import BlocRepliable from './BlocRepliable.tsx';
import { Sq, SqCarte } from './Squelettes.tsx';
import MotsEditables from './MotsEditables.tsx';
import { useHauteur } from '../useHauteur.ts';
import Veille from './Veille.tsx';
import VeilleIa from './VeilleIa.tsx';

const CHAMPS = [
  { cle: 'zones', titre: 'Zones (départements)', aide: 'Codes à 2 ou 3 chiffres : 83, 13, 06, 2A. Une zone retirée retire aussi ses offres déjà en base.', exemple: '83', couleur: 'var(--c-blue)', majuscules: true, libelle: v => DEPARTEMENTS[v] },
  { cle: 'mots_cles', titre: 'Mots-clés recherchés', aide: 'Une recherche est lancée pour chaque mot-clé dans chaque zone. Plus il y en a, plus la synchro est longue.', exemple: 'comptable', couleur: 'var(--c-green)' },
  { cle: 'mots_exclus', titre: "Mots exclus dans l'intitulé", aide: 'Une offre dont le titre contient un de ces mots est écartée, y compris celles déjà en base.', exemple: 'franchise', couleur: 'var(--c-red)' },
  { cle: 'contrats_exclus', titre: 'Contrats exclus', aide: 'Codes France Travail à trois lettres : FRA franchise, STA stage, CDD, CDI, MIS intérim, LIB libéral...', exemple: 'FRA', couleur: 'var(--c-orange)', majuscules: true, libelle: v => CONTRATS[v] },
  { cle: 'entreprises', titre: 'Employeurs surveillés', aide: "Leurs offres passent même si l'intitulé ne contient pas le mot-clé cherché.", exemple: 'nom de l\'entreprise', couleur: 'var(--c-violet)' },
];

// NOTE: une suggestion de la forme "83 · Var" ajoute seulement le code avant le séparateur
const SEP = ' · ';

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
function ListeEditable({ champ, valeurs, onChange, options, modifie = false }) {
  const ajouter = texte => {
    const nouveaux = String(texte).split(/[,\n;]/).map(t => t.trim().replace(/\s+/g, ' ')).filter(Boolean)
      .map(t => (t.includes(SEP) ? t.split(SEP)[0] : t)).map(t => (champ.majuscules ? t.toUpperCase() : t));
    const connus = new Set(valeurs.map(v => v.toLowerCase()));
    const retenus = nouveaux.filter(t => !connus.has(t.toLowerCase()) && connus.add(t.toLowerCase()));
    if (retenus.length) onChange([...valeurs, ...retenus]);
  };
  // Suggestions : celles déjà ajoutées ne sont plus proposées
  const restantes = useMemo(() => {
    const pris = new Set(valeurs.map(v => v.toLowerCase()));
    return options.filter(o => !pris.has((o.includes(SEP) ? o.split(SEP)[0] : o).toLowerCase()));
  }, [options, valeurs]);
  return (
    // ANCHOR: carte pleine largeur repliable (ligne 104), résumé des premières valeurs quand elle est fermée
    <BlocRepliable id={champ.cle} memoire="recherche" className="reglage-liste" style={{ '--c': champ.couleur }} titre={champ.titre}
      pastille={<span className="count muted small">{valeurs.length}{modifie && <span className="warn"> · modifié</span>}</span>}
      resume={valeurs.slice(0, 8).join(', ') + (valeurs.length > 8 ? ', ...' : '')}>
      <p className="muted small">{champ.aide}</p>
      <MotsEditables valeurs={valeurs} onAjout={ajouter} onRetrait={v => onChange(valeurs.filter(x => x !== v))} options={restantes}
        placeholder={`Ex. ${champ.exemple}`} label={`Ajouter à ${champ.titre}`} couleur={champ.couleur} libelle={champ.libelle} />
    </BlocRepliable>
  );
}

// ANCHOR: partie Recherche d'offres du Profil (ligne 255, avant dans Admin) : ce que l'on cherche, donc lié au profil. Serveur inchangé (kv reglages, /api/reglages)
export default function ReglagesRecherche() {
  const [enregistre, setEnregistre] = useState<any>(null);
  const [origine, setOrigine] = useState('');
  const [brouillon, setBrouillon] = useState<any>(null);
  const [erreur, setErreur] = useState('');
  const [apercu, setApercu] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [offres, setOffres] = useState<any[]>([]);

  useEffect(() => {
    chargerReglages().then(d => { setEnregistre(d.reglages); setBrouillon(d.reglages); setOrigine(d.origine); }).catch(e => setErreur(e.message));
    chargerOffres().then(setOffres).catch(() => {}); // NOTE: les suggestions tirées des offres sont facultatives
  }, []);
  const suggestions = useMemo(() => suggestionsDepuis(offres), [offres]);
  // NOTE: lecture seule de la hauteur mémorisée par VeilleIa, pour réserver sa place dans le squelette
  const { hauteur: hauteurIa } = useHauteur('recherche.veilleia', 150, false);
  // NOTE: hauteur réelle de la carte d'en-tête (rôle, marche à suivre, origine), reprise par son squelette
  const intro = useHauteur('recherche.intro', 240, Boolean(brouillon));

  if (erreur && !brouillon) return <p className="empty">Réglages de recherche indisponibles : {erreur}</p>;
  // NOTE: même forme que la page chargée (en-tête, sujets IA, cinq listes repliées), pour que rien ne bouge à l'arrivée des réglages
  if (!brouillon) return (
    <div className="admin">
      <div className="sq-hauteur" style={{ minHeight: intro.hauteur }}><SqCarte lignes={4} label="Chargement des réglages de recherche" /></div>
      <div className="sq-hauteur" style={{ minHeight: hauteurIa }}><SqCarte lignes={2} label="" /></div>
      <div className="reglages-listes sqz" aria-hidden="true">
        {CHAMPS.map(c => <div key={c.cle} className="bloc-rep"><div className="bloc-rep-sq"><Sq l="40%" h={18} /></div></div>)}
      </div>
    </div>
  );

  const modifie = !egal(brouillon, enregistre);
  // NOTE: mise à jour par fonction, pour que plusieurs ajouts d'affilée (suggestions de l'IA cochées dans plusieurs listes) partent tous du brouillon courant
  const change = (cle, f: (liste: string[]) => string[]) => { setBrouillon(b => ({ ...b, [cle]: f(b[cle] ?? []) })); setApercu(null); setMessage(''); setErreur(''); };

  const sauver = async () => {
    setErreur(''); setOccupe(true);
    try {
      const r = await enregistrerReglages(brouillon);
      setEnregistre(r.reglages); setBrouillon(r.reglages); setOrigine('app'); setApercu(null);
      setMessage(`Réglages enregistrés${r.retirees ? `, ${r.retirees} offre(s) retirée(s)` : ''}. Lancez une synchronisation pour appliquer les nouvelles recherches.`);
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  const demander = async () => {
    setErreur(''); setMessage(''); setOccupe(true);
    try {
      const { retirables } = await apercuReglages(brouillon);
      if (retirables.total > 0) setApercu(retirables); else await sauver();
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };

  return (
    <div className="admin">
      <div className="carte" ref={intro.ref}>
        <h3 className="carte-titre">
          <Search size={17} aria-hidden="true" />Recherche d'offres
          <AideModale titre="Recherche d'offres">
            <p>Ces cinq listes décident des offres qui arrivent dans l'application : où chercher, quels mots-clés, quels intitulés et contrats écarter, quels employeurs suivre de près.</p>
            <ul>
              <li>Les modifications restent en brouillon jusqu'à « Enregistrer les réglages ». Avant d'enregistrer, l'application montre combien d'offres déjà en base seraient retirées.</li>
              <li>Les offres liées à une candidature et celles saisies à la main ne sont jamais retirées.</li>
              <li>Les « Suggestions de l'IA pour ces listes » relisent vos candidatures et suggèrent des ajouts : cochés, ils rejoignent le brouillon, sans enregistrement automatique.</li>
              <li>Les nouvelles recherches s'appliquent à la synchronisation suivante (onglet Admin, Sources d'offres, ou Actualiser dans Offres).</li>
            </ul>
          </AideModale>
        </h3>
        {/* NOTE: d'abord le rôle de la page et la marche à suivre, puis l'origine des listes en une ligne */}
        <p className="small">Les cinq listes ci-dessous décident des offres qui arrivent dans l'onglet Offres : où chercher, quels mots-clés, quels intitulés et contrats écarter, quels employeurs suivre.</p>
        <ol className="veille-etapes small">
          <li>Modifiez les listes, à la main ou avec les suggestions de l'IA juste en dessous.</li>
          <li>Enregistrez : l'application montre d'abord combien d'offres déjà reçues seraient retirées.</li>
          <li>La synchronisation suivante applique les nouvelles recherches.</li>
        </ol>
        <p className="muted small">
          {origine === 'app'
            ? "Origine : listes enregistrées ici. Elles priment sur celles de la veille n8n, qui garde ses propres filtres pour ses alertes Discord."
            : "Origine : copie des listes de la veille n8n. Dès le premier enregistrement ici, l'application utilise ses propres listes ; la veille n8n garde les siennes pour ses alertes Discord."}
        </p>
      </div>
      <VeilleIa champs={CHAMPS} brouillon={brouillon} ajouter={(cle, valeurs) => change(cle, l => [...l, ...valeurs])} />
      <div className="reglages-listes">
        {CHAMPS.map(c => <ListeEditable key={c.cle} champ={c} valeurs={brouillon[c.cle]} options={suggestions[c.cle]} onChange={v => change(c.cle, () => v)} modifie={!egal(brouillon[c.cle], enregistre[c.cle])} />)}
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
        <button type="button" className="btn btn-ghost" onClick={() => { setBrouillon(enregistre); setApercu(null); setErreur(''); setMessage(''); }} disabled={!modifie || occupe}><Undo2 size={16} />Annuler les modifications</button>
        {modifie && <span className="warn small">Modifications non enregistrées</span>}
      </div>

      {/* NOTE: explication des filtres réellement appliqués, repliée par défaut : elle documente les listes ci-dessus */}
      <BlocRepliable id="fonctionnement" memoire="recherche" Icone={Info} titre="Fonctionnement de la recherche">
        <Veille />
      </BlocRepliable>
    </div>
  );
}
