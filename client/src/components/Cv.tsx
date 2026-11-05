import { AlertTriangle, Camera, CameraOff, CheckCircle2, CircleHelp, Download, Eye, FileText, ListChecks, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import BarreEtat from './BarreEtat.tsx';
import { assemblerCv, composerCv, preparerLettre, envoyerReference, lienPdfVersion, pdfCv, supprimerVersionCv } from '../api.ts';
import { CATEGORIES } from '../constants.ts';
import { telecharger } from '../exports.ts';
import { fmtDate, useMemoire } from '../utils.ts';
import { usePhoto } from '../usePhoto.ts';
import BlocRepliable from './BlocRepliable.tsx';
import VersionsListe from './VersionsListe.tsx';
import { contactManquant, majContact } from './Coordonnees.tsx';
import Select from './Select.tsx';
import ChoixRecherche from './ChoixRecherche.tsx';
import { METIERS_CV as METIERS, TITRES_METIER, villeMission } from '../../../lib/cv.mjs';

const STATUTS = { ok: ['Conforme', 'ok'], partiel: ['Partiel', 'partiel'], profil: ['Absent du CV de référence, présent au Profil', 'profil'], absent: ['Absent du CV de référence', 'absent'] };

// ANCHOR: point d'interrogation d'un fait à vérifier, qui ouvre l'action à mener dans une fenêtre modale
function AideFait({ fait }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<any>(null);
  useEffect(() => { if (ouvert) ref.current?.showModal(); }, [ouvert]);
  const fermer = () => setOuvert(false);
  return (
    <>
      <button type="button" className="btn btn-ghost small icon" onClick={() => setOuvert(true)} aria-haspopup="dialog" aria-label={`Que faire pour ${fait.valeur} ?`} title="Que faire ?"><CircleHelp size={15} /></button>
      {ouvert && (
        <dialog ref={ref} className="dialog dialog-score" onClose={fermer} onClick={e => { if (e.target === ref.current) fermer(); }}>
          <header className="dialog-head">
            <h2><CircleHelp size={17} /> {fait.valeur}</h2>
            <button type="button" className="btn btn-ghost icon" onClick={fermer} aria-label="Fermer" title="Fermer"><X size={16} /></button>
          </header>
          <div className="dialog-body">
            <p className="small muted">{fait.rubrique} : {fait.element}</p>
            <p><span className="tag">{STATUTS[fait.statut][0]}</span></p>
            <h3 className="carte-titre">Action à mener</h3>
            <p>{ACTIONS[fait.statut]}</p>
          </div>
        </dialog>
      )}
    </>
  );
}

// ANCHOR: action à mener selon le statut du contrôle, affichée sous chaque fait à vérifier
const ACTIONS = {
  partiel: 'Une partie seulement des mots figure dans le CV de référence : vérifier l\'intitulé exact, puis corriger le Profil (Parcours) ou le CV de référence.',
  profil: 'Connu du Profil, pas du CV de référence : si c\'est exact, l\'ajouter à votre CV de référence ; sinon le corriger ou le retirer du Profil (Parcours).',
  absent: 'Introuvable dans le CV de référence comme dans le Profil : vérifier que c\'est exact, puis l\'ajouter au CV de référence ou le corriger dans le Profil (Parcours).',
};

// ANCHOR: CV composé depuis le Profil (ligne 90) : rien n'est rédigé, le serveur choisit et ordonne, puis contrôle contre le CV de référence

// ANCHOR: dernière cible du CV, gardée hors du composant : quitter l'onglet CV et lettre démonte la vue, le retour reprend le même aperçu
const memoire = { cible: 'general', actif: 'generique' as 'generique' | 'sur_mesure', baseSM: 'general', offreId: '', candidatureId: '', assemblage: null as any };
export default function Cv({ etat, maj, offres, cible: demande, cibleLue, allerPartie }) {
  const [cible, setCible] = useState(memoire.cible);
  // NOTE: un seul aperçu à droite, piloté par la dernière carte touchée (génériques ou sur mesure) ; le sur mesure part d'une offre, sinon d'une base générale ou métier
  const [actif, setActif] = useState<'generique' | 'sur_mesure'>(demande ? 'generique' : memoire.actif);
  const [baseSM, setBaseSM] = useState(memoire.baseSM);
  const [offreId, setOffreId] = useState(demande ? '' : memoire.offreId);
  const [candidatureId, setCandidatureId] = useState(demande ? '' : memoire.candidatureId);
  useEffect(() => { Object.assign(memoire, { cible, actif, baseSM, offreId, candidatureId }); }, [cible, actif, baseSM, offreId, candidatureId]);
  const [resultat, setResultat] = useState<any>(null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState(etat.cvReference ?? null);
  const [erreurRef, setErreurRef] = useState('');
  const [versions, setVersions] = useState(etat.cvVersions ?? []);
  const [relance, setRelance] = useState(0);
  // NOTE: choix du modèle local pour l'offre en cours (métier, compétences, motif) : tant qu'il attend, rien n'est composé ; en cas d'échec, composition classique
  const [assemblage, setAssemblage] = useState<any>(demande ? null : memoire.assemblage);
  // NOTE: seul un choix terminé est gardé pour le retour sur l'onglet : une attente en cours appartient à la vue démontée
  useEffect(() => { memoire.assemblage = assemblage?.etat === 'ok' ? assemblage : null; }, [assemblage]);
  const [composeLe, setComposeLe] = useState('');
  const lateral = useRef<HTMLDivElement>(null);
  const profil = etat.profil ?? {};
  const contact = profil.contact ?? {};
  // ANCHOR: photo facultative de l'entête (choix mémorisé), possible seulement si une photo est enregistrée dans Profil > Coordonnées
  const photo = usePhoto();
  const [avecPhoto, setAvecPhoto] = useMemoire('cv.photo', false);
  const photoCv = photo.presente && avecPhoto;
  // NOTE: l'état est rechargé au retour sur la fenêtre : reprendre la référence et les versions envoyées ailleurs (API, autre onglet)
  useEffect(() => { if (etat.cvReference?.id && etat.cvReference.id !== reference?.id) setReference(etat.cvReference); }, [etat.cvReference?.id]);
  useEffect(() => { if (etat.cvVersions) setVersions(etat.cvVersions); }, [etat.cvVersions]);

  // NOTE: arrivée depuis une offre ou une candidature (bouton CV sur mesure) : la cible est consommée une fois
  useEffect(() => {
    if (!demande) return;
    setActif('sur_mesure');
    // NOTE: la lettre de l'offre se prépare ensuite, dans la même file du modèle local : elle passe après le CV (ligne 179)
    if (demande.offre_id) { const id = demande.offre_id; setOffreId(id); setAssemblage(null); setRelance(n => n + 1); preparerLettre(id).catch(() => {}); }
    setCandidatureId(demande.candidature_id || etat.candidatures.find(c => c.offre_id && c.offre_id === demande.offre_id)?.id || '');
    cibleLue();
  }, [demande]);

  // ANCHOR: assemblage par le modèle local, lancé à l'arrivée depuis une offre ou par le bouton : le résultat se compose ensuite comme un CV sur mesure classique
  // NOTE: numéro de la dernière demande : une réponse tardive d'une demande dépassée (autre offre, abandon) est ignorée
  const derniereDemande = useRef(0);
  const assembler = async (id: string, force = false) => {
    const numero = ++derniereDemande.current;
    setAssemblage({ offre_id: id, etat: 'attente' });
    try {
      const r = await assemblerCv(id, force);
      if (numero === derniereDemande.current) setAssemblage({ offre_id: id, etat: 'ok', ...r });
    } catch (e) {
      if (numero === derniereDemande.current) setAssemblage({ offre_id: id, etat: 'echec', erreur: e.message });
    }
  };
  const abandonnerAssemblage = (id: string) => {
    derniereDemande.current++;
    setAssemblage({ offre_id: id, etat: 'abandon' });
  };
  const attenteQwen = actif === 'sur_mesure' && assemblage?.etat === 'attente' && assemblage.offre_id === offreId;
  const requete = useMemo(() => {
    const visee = actif === 'sur_mesure' ? (offreId ? 'offre' : baseSM) : cible;
    if (visee === 'general') return { cible: 'general' as const };
    if (visee === 'offre') {
      if (attenteQwen) return null;
      const choix = assemblage?.etat === 'ok' && assemblage.offre_id === offreId ? assemblage : null;
      return { cible: 'offre' as const, offre_id: offreId, ...(choix ? { metier: choix.metier, prioritaires: choix.competences } : {}) };
    }
    return { cible: 'metier' as const, categorie: visee };
  }, [actif, cible, baseSM, offreId, assemblage, attenteQwen]);

  // ANCHOR: recomposé quand la cible ou le Profil changent, après l'enregistrement automatique (1 s) pour lire l'état du serveur
  const empreinte = JSON.stringify([profil, etat.experiences, etat.formations, etat.competences]);
  // NOTE: changement de cible = composition immédiate et ancien CV retiré ; le délai de 1 s ne sert qu'aux modifications du Profil
  const derniereCible = useRef<string | null>(null);
  useEffect(() => {
    if (!requete) { setResultat(null); return; }
    const cleCible = JSON.stringify(requete);
    const cibleChangee = cleCible !== derniereCible.current;
    derniereCible.current = cleCible;
    if (cibleChangee) setResultat(null);
    let annule = false;
    const t = setTimeout(async () => {
      try {
        const r = await composerCv(requete);
        if (!annule) { setResultat(r); setComposeLe(new Date().toISOString()); setErreur(''); }
      } catch (e) {
        if (!annule) setErreur(e.status ? e.message : `${e.message} Secours sans serveur : npm run cv (voir README).`);
      }
    }, cibleChangee ? 0 : 1500);
    return () => { annule = true; clearTimeout(t); };
  }, [requete, empreinte, reference?.id, relance]);

  const envoyer = async fichier => {
    if (!fichier) return;
    setErreurRef('');
    try {
      setReference((await envoyerReference(fichier)).reference);
    } catch (e) {
      setErreurRef(e.message);
    }
  };

  const exporter = async surMesure => {
    if (!resultat) return;
    const candidature = surMesure ? candidatureId : '';
    setEnCours(true); setMessage(''); setErreur('');
    try {
      // NOTE: l'entête saisie à l'instant n'est peut-être pas encore dans le document composé : la version locale prime
      const { pdf, version } = await pdfCv({ ...resultat.document, photo: photoCv, entete: { ...resultat.document.entete, ...contact, titre: titreCible } }, candidature);
      telecharger(version.nom + '.pdf', pdf);
      setVersions(v => [{ ...version, cible: resultat.document.cible, categorie: resultat.document.categorie, offre_id: resultat.document.offre_id, candidature_id: candidature, cree_le: new Date().toISOString() }, ...v]);
      // NOTE: la candidature retient le nom de la version envoyée (champ Version du CV)
      if (candidature) maj(e => ({ candidatures: e.candidatures.map(c => (c.id === candidature ? { ...c, cv: version.nom } : c)) }));
      setMessage(`${version.nom}.pdf téléchargé et enregistré dans les versions.`);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnCours(false);
    }
  };

  const retirer = async v => {
    if (!confirm(`Supprimer la version ${v.nom} ? Le fichier déjà envoyé n'est pas concerné.`)) return;
    try {
      await supprimerVersionCv(v.id);
      setVersions(l => l.filter(x => x.id !== v.id));
    } catch (e) {
      setErreur(e.message);
    }
  };

  // NOTE: le bloc Référence est replié par défaut : l'ouvrir (le choix est mémorisé par le bloc) puis l'amener à l'écran
  const ouvrirReference = () => {
    const d = document.querySelector<HTMLDetailsElement>('#cv-ref details');
    if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  };
  const optionsCible = [['general', 'Général'], ...METIERS.map(m => [m, CATEGORIES[m].label])];
  // NOTE: le numéro de l'offre fait partie du libellé (donc de la recherche) ; une offre absente de la liste (purgée, pas encore chargée) reste affichée grâce à sa candidature
  const optionsOffres = useMemo(() => {
    const libelle = o => [o.titre, o.entreprise].filter(Boolean).join(' · ') + (String(o.id_offre).startsWith('man-') ? '' : ` · n°${o.id_offre}`);
    const liste = (offres ?? []).filter(o => !o.ignoree || o.id_offre === offreId)
      .sort((a, b) => (b.date_detection || '').localeCompare(a.date_detection || '')).map(o => [o.id_offre, libelle(o)]);
    const cand = etat.candidatures.find(c => c.offre_id === offreId);
    if (offreId && !liste.some(([v]) => v === offreId)) liste.unshift([offreId, cand ? [cand.poste, cand.entreprise].filter(Boolean).join(' · ') + ` · n°${offreId}` : `Offre n°${offreId}`]);
    return [['', 'Aucune, partir d\'une base'], ...liste];
  }, [offres, offreId, etat.candidatures]);
  const optionsCand = [['', 'Aucune'], ...etat.candidatures.map(c => [c.id, ([c.poste, c.entreprise].filter(Boolean).join(' · ') || c.id) + (c.offre_id && !String(c.offre_id).startsWith('man-') ? ` · n°${c.offre_id}` : '')])];
  const sansNom = !String(contact.nom ?? '').trim();
  const manquants = contactManquant(contact).filter(m => m !== 'nom affiché');
  const doc = resultat?.document;
  // NOTE: titre sous le nom propre à la cible (profil.titres), repli sur celui des coordonnées ; lu localement pour suivre la saisie sans attendre la recomposition
  const cleTitre = doc?.categorie || 'general';
  const defautTitre = TITRES_METIER[cleTitre] || contact.titre || '';
  const titreCible = profil.titres?.[cleTitre] || defautTitre;
  const controle = resultat?.controle;
  const aVerifier = controle?.faits.filter(f => f.statut !== 'ok') ?? [];
  // NOTE: titre, accroche et résumé par cible se règlent dans Profil > Modèles CV et lettre (ReglagesCv.tsx)
  const blocReglages = (
    <p className="muted small"><SlidersHorizontal size={14} aria-hidden="true" /> Titre, accroche et résumé par cible : <button type="button" className="lien" onClick={() => allerPartie('modeles')}>Profil &gt; Modèles CV et lettre</button>.</p>
  );

  // NOTE: messages d'export et de coordonnées, affichés sous la carte active
  const retours = (
    <>
      {sansNom && <p className="small warn">Nom à renseigner pour exporter : dans l'aperçu ou dans <button type="button" className="lien" onClick={() => allerPartie('coord')}>Profil &gt; Coordonnées</button>.</p>}
      {!sansNom && manquants.length > 0 && <p className="small warn">Coordonnées incomplètes ({manquants.join(', ')}) : à compléter dans l'aperçu ou dans <button type="button" className="lien" onClick={() => allerPartie('coord')}>Profil &gt; Coordonnées</button>.</p>}
      {resultat && resultat.tient === false && <p className="small warn">Le CV sur mesure fait {resultat.pages} pages, même allégé au maximum : 2 pages sont visées pour une offre.</p>}
      {!reference && <p className="small warn">Aucun CV de référence : le contrôle est impossible. <button type="button" className="lien" onClick={ouvrirReference}>Envoyer le PDF</button>.</p>}
      {message && <p className="small ok-texte" role="status">{message}</p>}
      {erreur && <p className="alert" role="alert">{erreur}</p>}
    </>
  );
  // NOTE: versions triées du plus récent au plus ancien par le serveur ; une version est sur mesure dès qu'elle vise une offre ou une candidature
  const estSurMesure = v => Boolean(v.candidature_id) || v.cible === 'offre';
  const versionsGeneriques = versions.filter(v => !estSurMesure(v));
  const versionsSurMesure = versions.filter(estSurMesure);
  const listeVersions = (id, titre, liste) => (
    <VersionsListe id={'versions-' + id} memoire="cv" titre={titre} versions={liste} candidatures={etat.candidatures} retirer={retirer}
      fichiers={v => [
        { href: lienPdfVersion(v.id), titre: 'Voir le PDF', libelle: `Voir ${v.nom}` },
        { href: lienPdfVersion(v.id), titre: 'Télécharger à nouveau', libelle: `Télécharger ${v.nom}`, telecharger: v.nom + '.pdf' },
      ]} />
  );

  return (
    <div className="cv">
      <div className="cv-haut">
      <div className="cv-lateral" ref={lateral}>
      <section className={'carte cv-carte' + (actif === 'generique' ? ' cv-actif' : '')} aria-labelledby="cv-cible">
        <h3 id="cv-cible" className="carte-titre"><FileText size={17} />CV génériques</h3>
        <p className="muted small">Un CV par cible (général ou métier), sans offre ni candidature.</p>
        <label className="field">Cible<Select value={cible} onChange={e => { setCible(e.target.value); setActif('generique'); }} options={optionsCible} /></label>
        {actif === 'generique'
          ? <div className="cv-actions">
              <button type="button" className="btn btn-ghost small" onClick={() => setRelance(n => n + 1)} title="Recomposer depuis l'état enregistré"><RefreshCw size={15} />Recomposer</button>
            </div>
          : <button type="button" className="btn btn-ghost small" onClick={() => { setActif('generique'); setRelance(n => n + 1); }}><Eye size={15} />Afficher l'aperçu</button>}
        {actif === 'generique' && retours}
        {actif === 'generique' && blocReglages}
        {listeVersions('generiques', 'Versions génériques', versionsGeneriques)}
      </section>
      <section className={'carte cv-carte' + (actif === 'sur_mesure' ? ' cv-actif' : '')} aria-labelledby="cv-sur-mesure">
        <h3 id="cv-sur-mesure" className="carte-titre"><FileText size={17} />CV sur mesure</h3>
        <p className="muted small">Pour une candidature, éventuellement ciblé sur une offre. Sans offre, il part de la base choisie.</p>
        <label className="field">Offre<ChoixRecherche value={offreId} onChange={e => {
          const id = e.target.value;
          setOffreId(id);
          // NOTE: une offre qui a déjà une candidature la lie d'office
          const liee = id ? etat.candidatures.find(c => c.offre_id === id) : undefined;
          if (liee) setCandidatureId(liee.id);
          setActif('sur_mesure');
        }} options={optionsOffres} placeholder="Rechercher une offre..." /></label>
        <label className="field">Candidature associée<ChoixRecherche value={candidatureId} onChange={e => { setCandidatureId(e.target.value); setActif('sur_mesure'); }} options={optionsCand} placeholder="Rechercher une candidature..." /></label>
        {offreId && (
          <div className="cv-qwen" aria-live="polite">
            {attenteQwen && (
              <p className="small muted"><Sparkles size={14} className="tourne" /> Le modèle local compose le CV pour cette offre, patientez...{' '}
                <button type="button" className="btn btn-ghost small" onClick={() => abandonnerAssemblage(offreId)}>Passer à la composition classique</button></p>
            )}
            {assemblage?.etat === 'ok' && assemblage.offre_id === offreId && (
              <p className="small"><Sparkles size={14} /> <strong>Choix du modèle</strong> ({assemblage.modele}, {Math.round(assemblage.duree_ms / 1000)} s) : {assemblage.motif || 'métier et compétences choisis.'}
                {assemblage.competences_noms.length > 0 && <span className="muted"> Mis en avant : {assemblage.competences_noms.join(', ')}.</span>}</p>
            )}
            {assemblage?.etat === 'abandon' && assemblage.offre_id === offreId && <p className="small muted">Composition classique affichée. Le modèle poursuit en arrière-plan : « Recomposer avec l'IA » reprend son résultat.</p>}
            {assemblage?.etat === 'echec' && assemblage.offre_id === offreId && <p className="small warn">Assemblage par le modèle impossible ({assemblage.erreur}) : composition classique affichée.</p>}
          </div>
        )}
        {!offreId && <label className="field">Base<Select value={baseSM} onChange={e => { setBaseSM(e.target.value); setActif('sur_mesure'); }} options={optionsCible} /></label>}
        {actif === 'sur_mesure'
          ? <div className="cv-actions">
              <button type="button" className="btn btn-ghost small" onClick={() => { if (offreId) abandonnerAssemblage(offreId); setRelance(n => n + 1); }} title="Recomposer depuis le Profil enregistré, sans le modèle"><RefreshCw size={15} />Recomposer</button>
              {offreId && !attenteQwen && <button type="button" className="btn btn-ghost small" onClick={() => assembler(offreId, true)} title="Le modèle local choisit le métier et les compétences à mettre en avant"><Sparkles size={15} />{assemblage?.etat === 'ok' && assemblage.offre_id === offreId ? 'Refaire avec l\'IA' : 'Recomposer avec l\'IA'}</button>}
            </div>
          : <button type="button" className="btn btn-ghost small" onClick={() => { setActif('sur_mesure'); setRelance(n => n + 1); }}><Eye size={15} />Afficher l'aperçu</button>}
        {actif === 'sur_mesure' && retours}
        {actif === 'sur_mesure' && blocReglages}
        {listeVersions('sur-mesure', 'Versions sur mesure', versionsSurMesure)}
      </section>

      {attenteQwen && (
        <section className="carte" aria-busy="true">
          <h3 className="carte-titre"><Sparkles size={17} />Composition en cours</h3>
          <div className="sq sq-ligne" /><div className="sq sq-ligne sq-court" />
        </section>
      )}
      <div id="cv-ref">
        <BlocRepliable id="reference" memoire="cv" titre="CV de référence" Icone={ShieldCheck} pastille={!reference && <span className="count warn">absent</span>} resume={reference?.fichier}>
          <p className="muted small">Le CV composé est contrôlé contre ce PDF : chaque employeur, intitulé, diplôme et année doit s'y retrouver. Un écart est signalé, jamais bloquant.</p>
          {reference
            ? <p className="small">{reference.fichier}, envoyé le {fmtDate(reference.importe_le.slice(0, 10))} ({reference.pages} page{reference.pages > 1 ? 's' : ''})</p>
            : <p className="small warn">Aucun CV de référence : le contrôle est impossible, l'export reste possible.</p>}
          <label className="btn btn-ghost small cv-fichier"><Upload size={15} />{reference ? 'Remplacer' : 'Envoyer le PDF'}
            <input type="file" accept="application/pdf,.pdf" onChange={e => { envoyer(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {erreurRef && <p className="alert" role="alert">{erreurRef}</p>}
        </BlocRepliable>
      </div>
      </div>
      {/* NOTE: aperçu et contrôle dans la même colonne : le contrôle reste sous le CV, comme sous la lettre */}
      <div className="cv-colonne-apercu">
      {(attenteQwen || (!doc && requete && !erreur)) && <ApercuSquelette />}
      {doc && !attenteQwen && <Apercu doc={doc} photo={photoCv ? photo.url : ''} contact={contact} maj={maj} titre={titreCible} composeLe={composeLe} lien={doc.cible === 'offre' ? offres?.find(o => o.id_offre === doc.offre_id)?.lien : ''} actions={<><button type="button" className={'btn small ' + (avecPhoto && photo.presente ? 'btn-primary' : 'btn-ghost')} aria-pressed={avecPhoto && photo.presente} disabled={!photo.presente} onClick={() => setAvecPhoto(!avecPhoto)} title={photo.presente ? (avecPhoto ? 'Photo affichée à gauche de l\'entête : cliquer pour la masquer' : 'Afficher la photo à gauche de l\'entête du CV') : 'Aucune photo : à ajouter dans Profil > Coordonnées'}>{avecPhoto && photo.presente ? <Camera size={15} /> : <CameraOff size={15} />}{avecPhoto && photo.presente ? 'Photo affichée' : 'Photo masquée'}</button><button type="button" className="btn btn-primary small" onClick={() => exporter(actif === 'sur_mesure')} disabled={!doc || sansNom || enCours} aria-busy={enCours}><Download size={15} />PDF</button></>} titreBarre={doc.cible === 'offre' ? (offres?.find(o => o.id_offre === doc.offre_id)?.titre ?? doc.libelle) : `Générique · ${doc.libelle}`} qui={assemblage?.etat === 'ok' && doc.cible === 'offre' && assemblage.offre_id === doc.offre_id ? `Algorithme + choix du modèle ${assemblage.modele}` : 'Algorithme'} />}
      {/* NOTE: le contrôle se lit sous le CV, dans un bloc repliable */}
      <div className="cv-controle-bas">
      {!doc && requete && !erreur && (
        <section className="carte" aria-hidden="true">
          <h3 className="carte-titre"><ListChecks size={17} />Contrôle</h3>
          <div className="sq sq-ligne" /><div className="sq sq-ligne sq-court" />
        </section>
      )}
      {doc && (
        <BlocRepliable id="controle" memoire="cv" titre="Contrôle" Icone={ListChecks} prioritaire
          pastille={controle.disponible && <span className={'count' + (aVerifier.length ? ' warn' : '')}>{aVerifier.length ? aVerifier.length : <CheckCircle2 size={14} aria-label="Tout est conforme" />}</span>}
          resume={controle.disponible ? `${controle.faits.length - aVerifier.length} conformes` : 'sans référence'}>
          {!controle.disponible && <p className="small warn"><AlertTriangle size={14} /> Contrôle impossible sans CV de référence.</p>}
          {controle.disponible && !aVerifier.length && <p className="small ok-texte"><CheckCircle2 size={14} /> {controle.faits.length} faits vérifiés, tous présents dans le CV de référence.</p>}
          {controle.disponible && aVerifier.length > 0 && (
            <>
              <p className="small">{controle.faits.length - aVerifier.length} faits conformes, <strong className="cv-absent">{controle.ecarts} absent{controle.ecarts > 1 ? 's' : ''}</strong>, <strong className="cv-partiel">{controle.avertissements} à vérifier</strong>. Le contrôle compare chaque fait du CV (employeurs, années, noms propres) au CV de référence, puis au Profil. Rien n'est bloquant : le point d'interrogation de chaque fait indique l'action à mener.</p>
              <ul className="cv-faits">
                {aVerifier.map((f, i) => (
                  <li key={i} className={'cv-' + STATUTS[f.statut][1]}><strong>{f.valeur}</strong> <span className="muted">({f.rubrique} : {f.element})</span> <span className="tag">{STATUTS[f.statut][0]}</span> <AideFait fait={f} /></li>
                ))}
              </ul>
            </>
          )}
        </BlocRepliable>
      )}
      </div>
      </div>
      </div>
    </div>
  );
}

// ANCHOR: squelette de l'aperçu pendant la composition : mêmes blocs que le CV (entête, rubriques, expériences avec puces)
function ApercuSquelette() {
  const rubrique = (n, puces) => (
    <section>
      <div className="sq sq-titre" />
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="sq-bloc">
          <div className="sq-duo"><div className="sq sq-ligne sq-moyen" /><div className="sq sq-ligne sq-petit" /></div>
          <div className="sq sq-ligne sq-court" />
          {Array.from({ length: puces }, (_, j) => <div key={j} className={'sq sq-ligne' + (j % 3 === 2 ? ' sq-moyen' : '')} />)}
        </div>
      ))}
    </section>
  );
  return (
    <article className="cv-apercu cv-squelette" aria-busy="true" aria-label="Composition de l'aperçu du CV" role="status">
      <header>
        <div className="sq sq-nom" /><div className="sq sq-ligne sq-moyen sq-centre" />
        <div className="sq sq-ligne sq-court sq-centre" /><div className="sq sq-ligne sq-court sq-centre" />
      </header>
      <section><div className="sq sq-titre" /><div className="sq sq-ligne" /><div className="sq sq-ligne" /><div className="sq sq-ligne sq-moyen" /></section>
      {rubrique(3, 4)}
      {rubrique(2, 2)}
    </article>
  );
}

// Aperçu HTML du document, même ordre et mêmes rubriques que le PDF
// NOTE: l'entête vient de l'état local (pas du document composé) et se modifie sur place, chaque champ écrit profil.contact
function Apercu({ doc, photo, contact, maj, titre, composeLe, titreBarre, qui, actions, lien }) {
  const e = { ...doc.entete, ...contact, titre };
  // NOTE: image illisible : l'entête reprend sa forme sans photo, sans trou
  const [photoKo, setPhotoKo] = useState(false);
  useEffect(() => setPhotoKo(false), [photo]);
  // NOTE: le span porte le séparateur « • » (CSS) et la largeur du champ suit son texte, comme dans le PDF
  const saisie = (k, ph, className = '') => (
    <span className="cv-auto" data-valeur={contact[k] || ph}>
      <input className={'cv-champ ' + className} value={contact[k] ?? ''} placeholder={ph} aria-label={ph} size={1} onChange={ev => majContact(maj, k, ev.target.value)} />
    </span>
  );
  const champ = (k, ph, className = '') => <span className="cv-item">{saisie(k, ph, className)}</span>;
  return (
    <div className="cv-apercu-bloc">
      <BarreEtat testid="cv-etat" date={composeLe} offreId={doc.cible === 'offre' ? doc.offre_id : ''} titre={titreBarre} qui={qui} detail="CV affiché dans l'aperçu" actions={actions} lien={lien} />
      <article className="cv-apercu" aria-label="Aperçu du CV">
        <header className={photo && !photoKo ? 'avec-photo' : ''}>
          {photo && !photoKo && <img className="cv-photo" src={photo} alt="" onError={() => setPhotoKo(true)} />}
          <h4>{champ('nom', 'Prénom Nom', 'cv-champ-nom')}</h4>
          <p className="cv-titre">{titre}</p>
          <p className="muted small cv-coord">{champ('adresse', 'Adresse')}<span className="cv-item">{saisie('code_postal', 'Code postal')}{saisie('ville', 'Ville')}</span>{champ('telephone', 'Téléphone')}{champ('email', 'Email')}</p>
          <p className="muted small cv-coord">{champ('site', 'Site')}{champ('linkedin', 'LinkedIn')}{champ('github', 'GitHub')}</p>
          <p className="muted small cv-coord">{champ('mention', 'Mention (permis, disponibilité...)')}</p>
        </header>
        {(doc.resume || (e.titre && doc.accroche)) && (
          <section>
            <h5>Profil</h5>
            {e.titre && doc.accroche && <p><strong>{doc.accroche}</strong></p>}
            {doc.resume.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}
          </section>
        )}
        {doc.experiences.length > 0 && (
          <section>
            <h5>Expérience professionnelle</h5>
            {doc.experiences.map(x => (
              <div key={x.ids.join()} className={'cv-exp' + (x.condensee ? ' condensee' : '')}>
                <p className="cv-ligne"><strong>{x.poste}</strong><span className="muted small">{x.periode}</span></p>
                <p className="muted small"><em>{[x.employeur, x.lieu].filter(Boolean).join(', ')}</em></p>
                {(x.puces.length > 0 || x.missions.length > 0) && (
                  <ul>
                    {x.puces.map(p => <li key={p}>{p}</li>)}
                    {x.missions.length > 0 && <li>Missions récentes en PACA : {x.missions.map(m => `${m.employeur}${villeMission(m)}, ${m.poste} (${m.periode})`).join(' ; ')}</li>}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}
        {(doc.formation.length > 0 || doc.titres_prepares.length > 0) && (
          <section>
            <h5>Formation et diplômes</h5>
            {doc.formation.map(f => <p key={f.id} className="cv-ligne"><span>{[f.titre, f.etablissement, f.lieu].filter(Boolean).join(', ')}{f.note && <span className="muted small"> {f.note}</span>}</span><span className="muted small">{f.annees}</span></p>)}
            {doc.titres_prepares.length > 0 && <p className="muted small">Titres préparés en tant que formateur : {doc.titres_prepares.join(', ')}</p>}
          </section>
        )}
        {doc.competences.length > 0 && (
          <section>
            <h5>Compétences et outils</h5>
            {doc.competences.map(c => <p key={c.domaine}><strong>{c.domaine}</strong> : {c.liste.join(', ')}</p>)}
          </section>
        )}
        {doc.langues.length > 0 && (
          <section>
            <h5>Langues</h5>
            <p>{doc.langues.map(l => (l.niveau ? `${l.langue} (${l.niveau})` : l.langue)).join(', ')}</p>
          </section>
        )}
      </article>
    </div>
  );
}
