import { AlertTriangle, CheckCircle2, ClipboardCopy, Download, FileText, ListChecks, RefreshCw, Save, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { controlerLettre, ecrireBrouillon, enregistrerMatrice, etatPreparationLettre, exporterLettre, lienVersionLettre, lireBrouillon, preparerLettre, redigerLettre, supprimerVersionLettre } from '../api.ts';
import { CATEGORIES } from '../constants.ts';
import { telecharger } from '../exports.ts';
import BlocRepliable from './BlocRepliable.tsx';
import VersionsListe from './VersionsListe.tsx';
import ChoixRecherche from './ChoixRecherche.tsx';
import Select from './Select.tsx';
import BarreEtat, { dateHeure } from './BarreEtat.tsx';
import { BLOCS_LETTRE, LIBELLES_BLOC, LIMITES_PLATEFORME, lignesEntete, MATRICE_DEFAUT, MOTS_MAX, MOTS_MIN, nomLettre, texteLettre, TONS_LETTRE } from '../../../lib/lettre.mjs';
import { separerLieu } from '../../../lib/coordonnees.mjs';
import { norm } from '../../../lib/texte.mjs';
import { METIERS_CV as METIERS } from '../../../lib/cv.mjs';
import type { ControleLettre, LettreBrouillon, LettreMatrice } from '../../../types';

const STATUTS = { ok: 'Conforme', offre: 'Repris de l\'annonce', partiel: 'Partiel', profil: 'Absent du CV de référence, présent au Profil', absent: 'Introuvable : à vérifier' };
const ORIGINES = { qwen: 'Brouillon du modèle', utilisateur: 'Modifiée par vous', claude: 'Réécrite par Claude' };
const DECLENCHEURS = { auto: 'préparé à l\'arrivée depuis l\'offre', bouton: 'bouton Rédiger', reecriture: 'réécriture' };
// NOTE: qui a écrit le texte et comment : modèle et déclencheur de la génération, puis la main de l'utilisateur ou de Claude
const quiComment = (b: LettreBrouillon) => {
  const g = b.generation ?? {};
  const detail = [g.modele, g.declencheur ? DECLENCHEURS[g.declencheur] : '', g.duree_ms ? `${Math.round(g.duree_ms / 1000)} s` : ''].filter(Boolean).join(', ');
  if (b.origine === 'claude') return 'Claude, réécriture';
  if (b.origine === 'utilisateur') return g.le ? `Vous (à partir de ${g.modele || 'la génération'} du ${dateHeure(g.le)})` : 'Vous';
  return `Modèle local${detail ? ` : ${detail}` : ''}`;
};
const TONS = { sobre: 'Sobre', chaleureux: 'Chaleureux', dynamique: 'Dynamique' };
const NIVEAU_MIN = 3;
const dateDuJour = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const copieMatrice = (m: LettreMatrice | undefined): LettreMatrice => structuredClone(m ?? MATRICE_DEFAUT) as LettreMatrice;

// ANCHOR: lettre de motivation (ligne 178) : matrice, brouillon du modèle local, textarea modifiable enregistré sur le serveur, contrôle, exports PDF et Word
// NOTE: même déroulé que le CV sur mesure ; le texte reste à l'utilisateur (il écrase ce qu'il veut) et Claude peut le réécrire par l'API (PUT /api/lettre/brouillons/:cle)
// ANCHOR: dernière cible de la lettre, gardée hors du composant : quitter l'onglet CV et lettre démonte la vue, le retour reprend la même lettre (le texte lui-même est enregistré sur le serveur)
const memoire = { actif: 'generique' as 'generique' | 'sur_mesure', offreId: '', candidatureId: '', metier: METIERS[0] };
export default function Lettre({ etat, maj, offres, cible: demande, cibleLue, allerPartie }) {
  const [offreId, setOffreId] = useState(demande ? '' : memoire.offreId);
  const [candidatureId, setCandidatureId] = useState(demande ? '' : memoire.candidatureId);
  // NOTE: comme pour le CV, lettre générique par métier visé (arrivée directe sur l'onglet) ou sur mesure (offre ou candidature)
  const [actif, setActif] = useState<'generique' | 'sur_mesure'>(demande ? 'sur_mesure' : memoire.actif);
  const [metier, setMetier] = useState(memoire.metier);
  useEffect(() => { Object.assign(memoire, { actif, offreId, candidatureId, metier }); }, [actif, offreId, candidatureId, metier]);
  const generique = actif === 'generique';
  const cle = generique ? `metier:${metier}` : offreId || candidatureId;
  const [brouillon, setBrouillonEtat] = useState<LettreBrouillon | null>(null);
  // NOTE: refs lues par les enregistrements asynchrones : base_maj_le toujours la plus récente, et saisie faite pendant un envoi jamais marquée enregistrée
  const brouillonRef = useRef<LettreBrouillon | null>(null);
  const saisies = useRef(0);
  const setBrouillon = (b: LettreBrouillon | null) => { brouillonRef.current = b; setBrouillonEtat(b); };
  const [matriceDefaut, setMatriceDefaut] = useState<LettreMatrice>(copieMatrice(etat.lettreMatrice));
  const [matrice, setMatrice] = useState<LettreMatrice>(copieMatrice(etat.lettreMatrice));
  // NOTE: matrice par défaut réglée dans Profil > Modèles CV et lettre : suivie au rechargement de l'état (la vue reste montée en arrière-plan)
  useEffect(() => { setMatriceDefaut(copieMatrice(etat.lettreMatrice)); }, [JSON.stringify(etat.lettreMatrice)]);
  const [champs, setChamps] = useState({ objet: '', destinataire: '', texte: '' });
  const [lieuDate, setLieuDate] = useState('');
  const [modifie, setModifie] = useState(false);
  const [conflit, setConflit] = useState(false);
  const [controle, setControle] = useState<ControleLettre | null>(null);
  const [redaction, setRedaction] = useState<any>(null);
  const [versions, setVersions] = useState(etat.lettreVersions ?? []);
  const [signature, setSignature] = useState(Boolean(etat.signature));
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const lateral = useRef<HTMLDivElement>(null);
  const contact = etat.profil?.contact ?? {};
  const offre = offres?.find(o => o.id_offre === offreId) ?? null;
  const candidature = etat.candidatures.find(c => c.id === candidatureId) ?? null;
  useEffect(() => { if (etat.lettreVersions) setVersions(etat.lettreVersions); }, [etat.lettreVersions]);
  // NOTE: la signature se gère dans Profil > Coordonnées : présence relue à l'ouverture de l'onglet
  useEffect(() => { fetch('/api/signature', { cache: 'no-store' }).then(r => setSignature(r.ok), () => {}); }, []);
  useEffect(() => { setLieuDate([separerLieu(contact).ville, `le ${dateDuJour()}`].filter(Boolean).join(', ')); }, [contact.ville, contact.code_postal]);

  // NOTE: arrivée depuis une offre ou une candidature : la cible est consommée une fois
  useEffect(() => {
    if (!demande) return;
    setActif('sur_mesure');
    setOffreId(demande.offre_id || '');
    setCandidatureId(demande.candidature_id || etat.candidatures.find(c => c.offre_id && c.offre_id === demande.offre_id)?.id || '');
    cibleLue();
  }, [demande]);

  // ANCHOR: chargement du brouillon de la cible ; sans brouillon, objet et destinataire proposés depuis l'offre ou la candidature
  const appliquer = (b: LettreBrouillon | null) => {
    setBrouillon(b);
    setModifie(false);
    setConflit(false);
    if (b) {
      setChamps({ objet: b.objet, destinataire: b.destinataire, texte: b.texte });
      setMatrice(b.matrice);
      return;
    }
    if (generique) {
      setChamps({ objet: `Candidature spontanée : ${CATEGORIES[metier].label}`, destinataire: '', texte: '' });
      setMatrice(copieMatrice(matriceDefaut));
      return;
    }
    const poste = offre?.titre ?? candidature?.poste ?? '';
    const entreprise = offre?.entreprise ?? candidature?.entreprise ?? '';
    setChamps({ objet: poste ? `Candidature au poste de ${poste}${offre && !String(offre.id_offre).startsWith('man-') ? ` (offre n°${offre.id_offre})` : ''}` : '', destinataire: [entreprise, offre?.lieu].filter(Boolean).join('\n'), texte: '' });
    setMatrice(copieMatrice(matriceDefaut));
  };
  useEffect(() => {
    setControle(null);
    if (!cle) { appliquer(null); return; }
    let annule = false;
    lireBrouillon(cle).then(b => { if (!annule) appliquer(b); }, e => { if (!annule) setErreur(e.message); });
    return () => { annule = true; };
  }, [cle]);

  // ANCHOR: brouillon préparé par le serveur (après le CV, ou ici à l'arrivée sur une lettre vide) : squelette et sondage toutes les 3 s jusqu'à son arrivée
  const [preparation, setPreparation] = useState<'attente' | null>(null);
  // NOTE: « Écrire moi-même » arrête l'attente de cette offre ; le serveur n'écrira pas par-dessus un texte saisi entre-temps
  const [prepIgnoree, setPrepIgnoree] = useState('');
  const lettreVide = !generique && Boolean(offreId) && cle === offreId && !champs.texte.trim() && !modifie;
  useEffect(() => {
    if (!lettreVide || prepIgnoree === offreId || brouillonRef.current?.texte?.trim()) { setPreparation(null); return; }
    let fini = false;
    let minuteur: ReturnType<typeof setTimeout>;
    const suivre = async (premier: boolean) => {
      try {
        const p = premier ? await preparerLettre(offreId) : await etatPreparationLettre(offreId);
        if (fini) return;
        if (p.etat === 'attente') { setPreparation('attente'); minuteur = setTimeout(() => suivre(false), 3000); return; }
        setPreparation(null);
        if (p.etat === 'ok' || p.etat === 'existe') {
          const b = await lireBrouillon(offreId);
          if (!fini && b) { appliquer(b); setRedaction({ etat: 'ok', modele: p.modele, duree_ms: p.duree_ms }); }
        } else if (p.etat === 'echec' && p.code !== 'config' && p.code !== 'courte') setRedaction({ etat: 'echec', erreur: p.erreur });
      } catch { if (!fini) setPreparation(null); }
    };
    suivre(true);
    return () => { fini = true; clearTimeout(minuteur); };
  }, [lettreVide, offreId, prepIgnoree]);

  // NOTE: Claude a pu réécrire la lettre : vérifiée au retour sur la fenêtre, quand l'onglet redevient visible et toutes les 5 s tant qu'il l'est (fenêtre déjà au premier plan ou sur un autre écran) ; rechargée si rien n'est en cours de saisie, sinon conflit signalé
  useEffect(() => {
    const auRetour = async () => {
      if (!cle || document.visibilityState !== 'visible') return;
      try {
        const b = await lireBrouillon(cle);
        if (!b || b.maj_le === brouillon?.maj_le) return;
        if (modifie) setConflit(true);
        else { appliquer(b); setRedaction(null); }
      } catch { /* serveur arrêté : la saisie locale reste */ }
    };
    const minuteur = setInterval(auRetour, 5000);
    window.addEventListener('focus', auRetour);
    document.addEventListener('visibilitychange', auRetour);
    return () => { clearInterval(minuteur); window.removeEventListener('focus', auRetour); document.removeEventListener('visibilitychange', auRetour); };
  }, [cle, brouillon?.maj_le, modifie]);

  // ANCHOR: enregistrement automatique 1 s après la dernière frappe, refusé (409) si la lettre a changé ailleurs entre-temps
  const enregistrer = async (d: Partial<LettreBrouillon>, origine = 'utilisateur') => {
    if (!cle) return null;
    const numero = saisies.current;
    const base = brouillonRef.current;
    try {
      const b = await ecrireBrouillon(cle, { ...d, origine: origine as any, ...(base ? { base_maj_le: base.maj_le } : {}) });
      setBrouillon(b);
      if (numero === saisies.current) setModifie(false);
      return b;
    } catch (e) {
      if (e.status === 409) setConflit(true);
      else setErreur(e.message);
      return null;
    }
  };
  useEffect(() => {
    if (!modifie || conflit) return;
    const t = setTimeout(() => enregistrer({ ...champs, matrice }), 1000);
    return () => clearTimeout(t);
  }, [champs, matrice, modifie, conflit]);
  const saisir = (k: keyof typeof champs, v: string) => { saisies.current++; setChamps(c => ({ ...c, [k]: v })); setModifie(true); };
  const majMatrice = (f: (m: LettreMatrice) => void) => { saisies.current++; setMatrice(m => { const n = copieMatrice(m); f(n); return n; }); setModifie(true); };

  // NOTE: contrôle relancé 800 ms après la dernière modification du texte
  useEffect(() => {
    if (!champs.texte.trim()) { setControle(null); return; }
    let annule = false;
    const t = setTimeout(() => controlerLettre(champs.texte, cle, matrice).then(r => { if (!annule) setControle(r); }, () => {}), 800);
    return () => { annule = true; clearTimeout(t); };
  }, [champs.texte, cle, matrice.mots]);

  // ANCHOR: brouillon du modèle local : remplace le texte (après confirmation s'il y en a un), enregistré avec l'origine « qwen »
  const derniereDemande = useRef(0);
  const rediger = async () => {
    if (!offreId) return;
    if (champs.texte.trim() && !confirm('Remplacer le texte actuel par un nouveau brouillon du modèle ?')) return;
    const numero = ++derniereDemande.current;
    setRedaction({ etat: 'attente' });
    setErreur('');
    try {
      const r = await redigerLettre(offreId, matrice, Boolean(redaction?.etat === 'ok'));
      if (numero !== derniereDemande.current) return;
      setRedaction({ etat: 'ok', modele: r.modele, duree_ms: r.duree_ms });
      const n = { ...champs, texte: r.texte, objet: champs.objet || r.objet };
      setChamps(n);
      await enregistrer({ ...n, matrice, generation: { modele: r.modele, duree_ms: r.duree_ms, declencheur: 'bouton' } }, 'qwen');
    } catch (e) {
      if (numero === derniereDemande.current) setRedaction({ etat: 'echec', erreur: e.message });
    }
  };
  const abandonner = () => { derniereDemande.current++; setRedaction(null); setPreparation(null); setPrepIgnoree(offreId); };

  const document_ = () => ({ entete: contact, destinataire: champs.destinataire, lieu_date: lieuDate, objet: champs.objet, texte: champs.texte, offre_id: offreId, signature: true });
  const exporter = async (format: 'pdf' | 'docx') => {
    setEnCours(true); setMessage(''); setErreur('');
    try {
      if (modifie) await enregistrer({ ...champs, matrice });
      const { fichier, version } = await exporterLettre(format, { lettre: document_(), cle, candidature_id: (!generique && candidatureId) || undefined, origine: brouillon?.origine });
      telecharger(`${version.nom}.${format}`, fichier);
      setVersions(v => [{ ...version, offre_id: (!generique && offreId) || null, candidature_id: (!generique && candidatureId) || null, cree_le: new Date().toISOString() }, ...v]);
      // NOTE: le serveur a coché « Lettre jointe » sur la candidature : l'état local suit pour ne pas renvoyer l'ancienne valeur
      if (!generique && candidatureId) maj(e => ({ candidatures: e.candidatures.map(c => (c.id === candidatureId ? { ...c, lettre: true } : c)) }));
      setMessage(`${version.nom}.${format} téléchargé et enregistré dans les versions.`);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnCours(false);
    }
  };
  // NOTE: même texte que « Copier le texte » (corps et signature, sans entête ni objet), en fichier .txt pour les formulaires ; nom sans « Generique », comme les exports PDF et Word
  const exporterTexte = () => {
    const nom = nomLettre(generique ? { nom: contact.nom, poste: CATEGORIES[metier].label } : { nom: contact.nom, entreprise: offre?.entreprise ?? candidature?.entreprise ?? '', poste: offre?.titre ?? candidature?.poste ?? '' });
    telecharger(nom + '.txt', texteLettre({ ...document_(), entete: { ...contact } } as any, { avecEntete: false }));
    setMessage(`${nom}.txt téléchargé (corps et signature, sans enregistrement dans les versions).`);
  };
  // NOTE: longueur du texte réellement collé dans un formulaire (corps et signature), comparée aux limites des plateformes
  const longueurFormulaire = texteLettre({ ...document_(), entete: { ...contact } } as any, { avecEntete: false }).length;
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texteLettre({ ...document_(), entete: { ...contact } } as any, { avecEntete: false }));
      setMessage('Texte copié (corps et signature), prêt à coller dans un formulaire.');
    } catch {
      setErreur('Copie impossible : sélectionnez le texte et copiez-le à la main.');
    }
  };
  const retirer = async v => {
    if (!confirm(`Supprimer la version ${v.nom} ? Le fichier déjà envoyé n'est pas concerné.`)) return;
    try {
      await supprimerVersionLettre(v.id);
      setVersions(l => l.filter(x => x.id !== v.id));
    } catch (e) {
      setErreur(e.message);
    }
  };
  const recharger = async () => {
    try { appliquer(await lireBrouillon(cle)); } catch (e) { setErreur(e.message); }
  };
  const sauverMatriceDefaut = async () => {
    try {
      setMatriceDefaut(await enregistrerMatrice(matrice));
      setMessage('Matrice enregistrée par défaut pour les prochaines lettres.');
    } catch (e) {
      setErreur(e.message);
    }
  };

  // NOTE: compétences proposées : celles de niveau suffisant, citées par l'annonce d'abord (même seuil que le CV sur mesure)
  const competencesProposees = useMemo(() => {
    const annonce = norm([offre?.titre, offre?.annonce].filter(Boolean).join(' '));
    const admises = etat.competences.filter(c => Math.max(c.enseigner ?? 0, c.executer ?? 0) >= NIVEAU_MIN);
    const citee = c => annonce && annonce.includes(norm(c.competence));
    return [...admises.filter(citee), ...admises.filter(c => !citee(c) && matrice.competences.includes(c.id))].slice(0, 24);
  }, [offre, etat.competences, matrice.competences]);

  const optionsOffres = useMemo(() => {
    const libelle = o => [o.titre, o.entreprise].filter(Boolean).join(' · ') + (String(o.id_offre).startsWith('man-') ? '' : ` · n°${o.id_offre}`);
    const liste = (offres ?? []).filter(o => !o.ignoree || o.id_offre === offreId).sort((a, b) => (b.date_detection || '').localeCompare(a.date_detection || '')).map(o => [o.id_offre, libelle(o)]);
    const cand = etat.candidatures.find(c => c.offre_id === offreId);
    if (offreId && !liste.some(([v]) => v === offreId)) liste.unshift([offreId, cand ? [cand.poste, cand.entreprise].filter(Boolean).join(' · ') + ` · n°${offreId}` : `Offre n°${offreId}`]);
    return [['', 'Aucune (candidature spontanée)'], ...liste];
  }, [offres, offreId, etat.candidatures]);
  const optionsCand = [['', 'Aucune'], ...etat.candidatures.map(c => [c.id, [c.poste, c.entreprise].filter(Boolean).join(' · ') || c.id])];
  const sansNom = !String(contact.nom ?? '').trim();
  const attente = redaction?.etat === 'attente' || preparation === 'attente';
  const aVerifier = controle?.faits.filter(f => f.statut === 'absent' || f.statut === 'profil' || f.statut === 'partiel') ?? [];

  return (
    <div className="cv lettre">
      <div className="cv-haut">
        <div className="cv-lateral" ref={lateral}>
          <section className={'carte cv-carte' + (generique ? ' cv-actif' : '')} aria-labelledby="lettre-generique">
            <h3 id="lettre-generique" className="carte-titre"><FileText size={17} />Lettres génériques</h3>
            <p className="muted small">Une lettre type par métier visé, pour une candidature spontanée ou un formulaire. Claude l'écrit et la réécrit à votre demande.</p>
            <label className="field">Métier visé<Select value={metier} onChange={e => { setMetier(e.target.value); setActif('generique'); }} options={METIERS.map(m => [m, CATEGORIES[m].label])} /></label>
            {!generique && <button type="button" className="btn btn-ghost small" onClick={() => setActif('generique')}>Afficher la lettre générique</button>}
          </section>

          <section className={'carte cv-carte' + (!generique ? ' cv-actif' : '')} aria-labelledby="lettre-cible">
            <h3 id="lettre-cible" className="carte-titre"><FileText size={17} />Lettre sur mesure</h3>
            <p className="muted small">Une lettre par offre ou par candidature, préparée par le modèle local après le CV. Le texte s'enregistre tout seul et reste modifiable à tout moment.</p>
            <label className="field">Offre<ChoixRecherche value={offreId} onChange={e => {
              setActif('sur_mesure');
              const id = e.target.value;
              setOffreId(id);
              const liee = id ? etat.candidatures.find(c => c.offre_id === id) : undefined;
              setCandidatureId(liee?.id ?? (id ? '' : candidatureId));
            }} options={optionsOffres} placeholder="Rechercher une offre..." /></label>
            <label className="field">Candidature associée<ChoixRecherche value={candidatureId} onChange={e => {
              setActif('sur_mesure');
              const id = e.target.value;
              setCandidatureId(id);
              const c = etat.candidatures.find(x => x.id === id);
              if (c?.offre_id && c.offre_id !== offreId) setOffreId(c.offre_id);
            }} options={optionsCand} placeholder="Rechercher une candidature..." /></label>
            {!generique && offreId && (
              <div className="cv-qwen" aria-live="polite">
                {attente && <p className="small muted"><Sparkles size={14} className="tourne" /> Le modèle local rédige un brouillon, patientez (une à deux minutes)... <button type="button" className="btn btn-ghost small" onClick={abandonner}>Écrire moi-même</button></p>}
                {redaction?.etat === 'ok' && <p className="small"><Sparkles size={14} /> Brouillon du modèle ({redaction.modele}, {Math.round(redaction.duree_ms / 1000)} s) : à relire, corriger ou faire réécrire par Claude.</p>}
                {redaction?.etat === 'echec' && <p className="small warn">Rédaction par le modèle impossible ({redaction.erreur}) : écrivez la lettre dans le champ de texte.</p>}
                {!attente && <button type="button" className="btn btn-ghost small" onClick={rediger}><Sparkles size={15} />{champs.texte.trim() ? 'Refaire un brouillon avec le modèle' : 'Rédiger avec le modèle'}</button>}
              </div>
            )}
          </section>

          {(message || erreur || sansNom || conflit) && (
            <section className="carte cv-carte" aria-label="Exporter la lettre">
              {sansNom && <p className="small warn">Nom à renseigner pour exporter : <button type="button" className="lien" onClick={() => allerPartie('coord')}>Profil &gt; Coordonnées</button>.</p>}
              {conflit && <p className="small warn" role="alert"><AlertTriangle size={14} /> La lettre a été modifiée ailleurs (Claude ou un autre onglet). <button type="button" className="lien" onClick={recharger}>Recharger cette version</button> (votre saisie non enregistrée sera perdue).</p>}
              {message && <p className="small ok-texte" role="status">{message}</p>}
              {erreur && <p className="alert" role="alert">{erreur}</p>}
            </section>
          )}

          {cle && (
            <BlocRepliable id="lettre-matrice" memoire="lettre" titre="Plan de la lettre" Icone={SlidersHorizontal} defaut resume={`${TONS[matrice.ton]}, ${matrice.mots} mots`}>
              <p className="muted small">Plan Vous, Moi, Nous : le besoin du recruteur, vos preuves, ce que vous ferez ensemble. Le modèle suit ces réglages, le contrôle aussi.</p>
              <div className="grid-2">
                <label className="field">Ton<Select value={matrice.ton} onChange={e => majMatrice(m => { m.ton = e.target.value; })} options={TONS_LETTRE.map(t => [t, TONS[t]])} /></label>
                <label className="field">Longueur (mots)<input className="input" type="number" min={MOTS_MIN} max={MOTS_MAX} step={10} value={matrice.mots} onChange={e => majMatrice(m => { m.mots = Number(e.target.value) || MATRICE_DEFAUT.mots; })} /></label>
              </div>
              {BLOCS_LETTRE.map(b => (
                <div key={b} className="lettre-bloc">
                  <label className="switch"><input type="checkbox" checked={matrice.blocs[b].actif} onChange={e => majMatrice(m => { m.blocs[b].actif = e.target.checked; })} /> {LIBELLES_BLOC[b]}</label>
                  {matrice.blocs[b].actif && <input className="input" aria-label={`Consigne pour ${LIBELLES_BLOC[b]}`} maxLength={500} placeholder={b === 'faible' ? 'Écart à assumer comme un atout (reconversion, distance...)' : 'Consigne facultative (fait à citer, expérience à mettre en avant)'} value={matrice.blocs[b].consigne} onChange={e => majMatrice(m => { m.blocs[b].consigne = e.target.value; })} />}
                </div>
              ))}
              {competencesProposees.length > 0 && (
                <fieldset className="lettre-competences">
                  <legend className="small">Compétences à citer{offre ? ' (citées par l\'annonce)' : ''}</legend>
                  <div className="chips">
                    {competencesProposees.map(c => {
                      const on = matrice.competences.includes(c.id);
                      return <button key={c.id} type="button" aria-pressed={on} className={'chip' + (on ? ' on' : '')} onClick={() => majMatrice(m => { m.competences = on ? m.competences.filter(x => x !== c.id) : [...m.competences, c.id].slice(0, 14); })}>{c.competence}</button>;
                    })}
                  </div>
                </fieldset>
              )}
              <button type="button" className="btn btn-ghost small cv-fichier" onClick={sauverMatriceDefaut}><Save size={15} />Garder comme matrice par défaut</button>
              <p className="muted small">Plan, ton, angles d'accroche et formules à éviter : <button type="button" className="lien" onClick={() => allerPartie('modeles')}>Profil &gt; Modèles CV et lettre</button>.</p>
            </BlocRepliable>
          )}

          {/* NOTE: mêmes deux listes que pour le CV : lettres génériques d'un côté, lettres sur mesure (liées à une offre ou à une candidature) de l'autre */}
          {[['generiques', 'Versions génériques', versions.filter(v => !v.offre_id && !v.candidature_id)], ['surmesure', 'Versions sur mesure', versions.filter(v => v.offre_id || v.candidature_id)]].map(([id, titre, liste]: any) => (
            <VersionsListe key={id} id={'lettre-versions-' + id} memoire="lettre" titre={titre} versions={liste} candidatures={etat.candidatures} retirer={retirer}
              fichiers={v => [
                { href: lienVersionLettre(v.id, 'pdf'), titre: 'Voir le PDF', libelle: `Voir ${v.nom}` },
                { href: lienVersionLettre(v.id, 'docx'), titre: 'Télécharger en Word', libelle: `Télécharger ${v.nom} en Word`, telecharger: v.nom + '.docx' },
              ]} />
          ))}
        </div>

        {!cle && <p className="empty">Choisissez une offre ou une candidature pour commencer la lettre sur mesure.</p>}
        {cle && (
          <div className="cv-apercu-bloc">
            <BarreEtat testid="lettre-etat" actions={<><button type="button" className="btn btn-primary small" onClick={() => exporter('pdf')} disabled={!champs.texte.trim() || sansNom || enCours} aria-busy={enCours}><Download size={15} />PDF</button><button type="button" className="btn btn-ghost small" onClick={() => exporter('docx')} disabled={!champs.texte.trim() || sansNom || enCours}><Download size={15} />Word</button><button type="button" className="btn btn-ghost small" onClick={exporterTexte} disabled={!champs.texte.trim() || sansNom}><Download size={15} />Texte</button><button type="button" className="btn btn-ghost small" onClick={copier} disabled={!champs.texte.trim()}><ClipboardCopy size={15} />Copier</button></>} compteur={`${champs.texte.length} car.`} date={brouillon?.maj_le} offreId={generique ? '' : brouillon?.offre_id ?? offreId} lien={generique ? '' : offre?.lien} titre={generique ? `Générique · ${CATEGORIES[metier].label}` : offre?.titre ?? candidature?.poste ?? ''} qui={brouillon ? quiComment(brouillon) : ''} suffixe={modifie ? ' · enregistrement...' : ''} detail={`Lettre affichée, dernière main sur le texte. Réglages pris en compte : ton ${matrice.ton}, ${matrice.mots} mots, ${BLOCS_LETTRE.filter(bl => matrice.blocs[bl].actif).map(bl => LIBELLES_BLOC[bl]).join(', ')}, ${matrice.competences.length} compétence(s) à citer`} />
            <article className="cv-apercu lettre-apercu" aria-label="Lettre de motivation" aria-busy={attente}>
              <header className="lettre-entete">
                <p className="lettre-coord">{(lignesEntete(contact).length ? lignesEntete(contact) : ['Prénom Nom']).map((l, i) => <span key={i}>{l}</span>)}</p>
                <p className="muted small"><button type="button" className="lien" onClick={() => allerPartie('coord')}>Modifier les coordonnées</button></p>
              </header>
              <textarea className="lettre-champ lettre-destinataire" aria-label="Destinataire" rows={3} placeholder="Entreprise, service, adresse" value={champs.destinataire} onChange={e => saisir('destinataire', e.target.value)} />
              <input className="lettre-champ lettre-date" aria-label="Lieu et date" value={lieuDate} onChange={e => setLieuDate(e.target.value)} />
              <label className="lettre-objet"><strong>Objet :</strong><input className="lettre-champ" aria-label="Objet" value={champs.objet} onChange={e => saisir('objet', e.target.value)} placeholder="Candidature au poste de..." /></label>
              {attente
                ? <div role="status" aria-label="Rédaction en cours" className="lettre-squelette">{Array.from({ length: 9 }, (_, i) => <div key={i} className={'sq sq-ligne' + (i % 3 === 2 ? ' sq-moyen' : '')} />)}</div>
                : <textarea className="lettre-champ lettre-texte" aria-label="Texte de la lettre" rows={22} value={champs.texte} onChange={e => saisir('texte', e.target.value)}
                    placeholder={'Madame, Monsieur,\n\nUn paragraphe par bloc, séparés par une ligne vide.\n\nJe vous prie d\'agréer, Madame, Monsieur, mes salutations distinguées.'} />}
              <div className="lettre-pied">
                <div className="lettre-signature-bloc">
                  <span>{contact.nom}</span>
                  {signature && <img src="/api/signature" alt="" />}
                </div>
                <button type="button" className="lien small" onClick={() => allerPartie('coord')}>{signature ? 'Changer la signature' : 'Ajouter une signature'}</button>
              </div>
            </article>
            {brouillon && <p className="muted small"><RefreshCw size={13} /> Enregistrée le {new Date(brouillon.maj_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}. Claude peut la relire et la réécrire à votre demande.</p>}
        {controle && (
          <BlocRepliable id="lettre-controle" memoire="lettre" titre="Contrôle" Icone={ListChecks} defaut prioritaire
            pastille={<span className={'count' + (aVerifier.length + controle.conseils.length ? ' warn' : '')}>{aVerifier.length + controle.conseils.length || <CheckCircle2 size={14} aria-label="Rien à signaler" />}</span>}
            resume={`${controle.mots} mots`}>
            <ul className="cv-faits" aria-label="Limites par plateforme (indicatif)">
              {LIMITES_PLATEFORME.map(l => {
                const reste = l.max - longueurFormulaire;
                return <li key={l.nom} className={reste < 0 ? 'cv-partiel' : 'cv-ok'}><strong>{l.nom}</strong> : {longueurFormulaire} sur {l.max} caractères, {reste < 0 ? `${-reste} en trop, le champ coupe net` : `${reste} de marge`}.</li>;
              })}
            </ul>
            <p className="small">{controle.mots} mots pour {matrice.mots} visés. Chaque fait (nom propre, chiffre, année, outil) est cherché dans le CV de référence, le Profil puis l'annonce. Rien n'est bloquant.</p>
            {controle.conseils.length > 0 && <ul className="cv-faits">{controle.conseils.map(c => <li key={c.code} className="cv-partiel">{c.message}</li>)}</ul>}
            {aVerifier.length > 0 && <ul className="cv-faits">{aVerifier.map((f, i) => <li key={i} className={'cv-' + f.statut}><strong>{f.fait}</strong> <span className="tag">{STATUTS[f.statut]}</span></li>)}</ul>}
            {!aVerifier.length && !controle.conseils.length && <p className="small ok-texte"><CheckCircle2 size={14} /> Faits retrouvés et méthode respectée.</p>}
          </BlocRepliable>
        )}
          </div>
        )}
      </div>
    </div>
  );
}
