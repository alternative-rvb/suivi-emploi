import { CalendarCheck, CalendarDays, Contact, FileText, Moon, Search, Send, Settings, Sun, SunMoon, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chargerEtat, creer, enregistrerEtat, modifier, supprimer } from './api.ts';
import Agenda from './components/Agenda.tsx';
import Aujourdhui from './components/Aujourdhui.tsx';
import Candidatures from './components/Candidatures.tsx';
import Contacts from './components/Contacts.tsx';
import Cv from './components/Cv.tsx';
import Lettre from './components/Lettre.tsx';
import Offres from './components/Offres.tsx';
import Admin from './components/Admin.tsx';
import Logo from './components/Logo.tsx';
import Profil from './components/Profil.tsx';
import ToutReplier from './components/ToutReplier.tsx';
import { SlotBarre } from './components/BarreEtat.tsx';
import { SqPage, SqSplit } from './components/Squelettes.tsx';
import { SqGabarit, useReleveGabarit } from './gabarit.tsx';
import AvatarProfil from './components/AvatarProfil.tsx';
import { definirPhoto, usePhoto } from './usePhoto.ts';
import Succes from './components/Succes.tsx';
import { compterNonVues } from './comptage.ts';
import { ACTIFS } from './constants.ts';
import { RendezVousProvider } from './rendezVous.tsx';
import PiedDePage from './components/PiedDePage.tsx';
import { useOffres } from './useOffres.ts';
import { useMemoire } from './utils.ts';
import { useProgression } from './useProgression.ts';

// NOTE: une icône par onglet pour les repérer d'un coup d'oeil (le libellé est masqué à l'écran étroit par le CSS)
const ONGLETS: [string, string, React.ComponentType<any>][] = [
  ['auj', "Aujourd'hui", CalendarCheck],
  ['offres', 'Offres', Search],
  ['cv', 'CV/LM', FileText],
  ['cand', 'Candidatures', Send],
  ['contacts', 'Contacts', Contact],
  ['agenda', 'Agenda', CalendarDays],
  ['profil', 'Profil', UserRound],
  ['admin', 'Admin', Settings],
];

// NOTE: Profil et Admin forment un second groupe à droite de la barre, à part du flux offre, candidature, CV
const REGLAGES = ['profil', 'admin'];

// ANCHOR: une phrase par onglet, pour savoir quoi faire sans avoir à se souvenir de l'interface
const AIDE = {
  auj: '',
  offres: "Choisissez une offre à gauche, lisez-la à droite, puis Postuler ou Écarter.",
  cand: "Choisissez une candidature à gauche pour voir où elle en est, noter un échange ou prévoir une relance.",
  cv: "Composez un CV ou une lettre de motivation adaptés à une offre, contrôlez-les contre votre CV de référence, puis exportez-les : le CV en PDF, la lettre en PDF ou en Word.",
  agenda: 'Vos rendez-vous et ceux du calendrier Google choisi : cliquez un créneau pour en ajouter un, un rendez-vous pour le voir ou le modifier.',
  contacts: 'Recruteurs et interlocuteurs, reliés aux offres qui les concernent.',
  profil: 'Votre parcours, vos compétences, formations, conseils et notes de fond.',
  admin: 'Zones, mots-clés et exclusions de la recherche, et état des sources d\'offres.',
};

const SAUVEGARDE = {
  ok: ['Enregistré', 'ok'],
  sale: ['Modifications non enregistrées', 'warn'],
  encours: ['Enregistrement...', ''],
  erreur: ['Non enregistré', 'err'],
};

// Clés enregistrées en bloc par PUT /api/state ; les collections passent par leurs routes, ligne par ligne
const CLES_KV = ['profil', 'conseils', 'todo'];
// NOTE: ordre des dépendances, une expérience référence des compétences, une tâche ou un échange une candidature. Création dans cet ordre, suppression dans l'ordre inverse.
// Les contacts ne référencent que des offres, chargées à part (useOffres)
const COLLECTIONS = ['competences', 'formations', 'experiences', 'projets', 'candidatures', 'taches', 'echanges', 'contacts'];

function ongletInitial() {
  const h = location.hash.slice(1);
  return ONGLETS.some(([k]) => k === h) ? h : 'auj';
}

function themeInitial() {
  try { return localStorage.getItem('theme') || 'auto'; } catch { return 'auto'; }
}

// ANCHOR: comparaison champ par champ avec le serveur ; les listes (lieux) se comparent par contenu, pas par référence
const different = (a, b) => (typeof a === 'object' && a !== null ? JSON.stringify(a) !== JSON.stringify(b) : (a ?? '') !== (b ?? ''));

const instantane = e => ({
  ...Object.fromEntries(COLLECTIONS.map(col => [col, new Map(e[col].map(x => [x.id, x]))])),
  kv: Object.fromEntries(CLES_KV.map(k => [k, JSON.stringify(e[k])])),
});

export default function App() {
  const [etat, setEtat] = useState<any>(null);
  const [onglet, setOnglet] = useState(ongletInitial);
  const [offreCible, setOffreCible] = useState<any>(null);
  // NOTE: filtres imposés à l'onglet Offres depuis l'accueil (lien des nouvelles du jour), lus une fois
  const [filtresOffres, setFiltresOffres] = useState<any>(null);
  const [cvCible, setCvCible] = useState<any>(null);
  // NOTE: onglet CV et lettre (ligne 178) : deux vues, la cible d'arrivée (offre, candidature) va à la vue demandée
  const corpsCv = useRef<HTMLDivElement>(null);
  const [slotCv, setSlotCv] = useState<HTMLElement | null>(null);
  const [vueCv, setVueCv] = useState<'cv' | 'lettre'>('cv');
  // NOTE: vues de l'onglet CV et lettre déjà ouvertes, gardées montées (masquées) tant qu'on reste dans l'onglet ; quitter l'onglet les libère
  const [vuesOuvertes, setVuesOuvertes] = useState({ cv: false, lettre: false });
  useEffect(() => {
    if (onglet !== 'cv') setVuesOuvertes(v => (v.cv || v.lettre ? { cv: false, lettre: false } : v));
  }, [onglet]);
  // NOTE: la vue quittée est marquée ouverte dans le même geste que le changement de vue : elle n'est jamais démontée entre deux rendus
  const choisirVue = (vue: 'cv' | 'lettre') => { setVuesOuvertes(o => ({ ...o, [vueCv]: true, [vue]: true })); setVueCv(vue); };
  const [lettreCible, setLettreCible] = useState<any>(null);
  // NOTE: compétence à retrouver dans Profil > Compétences (clic sur une étiquette du Parcours), vidée une fois lue
  const [compCible, setCompCible] = useState('');
  // NOTE: jour, vue et élément à ouvrir dans l'Agenda, demandés depuis le mini-calendrier de l'accueil, lus une fois
  const [agendaCible, setAgendaCible] = useState<any>(null);
  const lesOffres = useOffres();
  const actives = etat ? etat.candidatures.filter(d => ACTIFS.includes(d.statut)).length : 0;
  const nbContacts = etat?.contacts?.length ?? 0;
  // NOTE: rendez-vous à venir = début postérieur à maintenant, recalculé à chaque rendu
  const rdvAVenir = (etat?.rendez_vous ?? []).filter(r => new Date(r.debut).getTime() >= Date.now()).length;
  const nonVues = useMemo(() => compterNonVues(lesOffres.offres, etat?.candidatures), [lesOffres.offres, etat?.candidatures]);
  const [sauvegarde, setSauvegarde] = useState('ok');
  // ANCHOR: l'enregistrement est automatique, « Enregistré » n'apparaît donc que deux secondes après un envoi, jamais en permanence
  const [confirme, setConfirme] = useState(false);
  const precedent = useRef('ok');
  useEffect(() => {
    const venaitDEnvoyer = precedent.current === 'encours';
    precedent.current = sauvegarde;
    if (sauvegarde !== 'ok' || !venaitDEnvoyer) { setConfirme(false); return; }
    setConfirme(true);
    const t = setTimeout(() => setConfirme(false), 2000);
    return () => clearTimeout(t);
  }, [sauvegarde]);
  const [messageErreur, setMessageErreur] = useState('');
  const [erreur, setErreur] = useState('');
  const [theme, setTheme] = useState(themeInitial);
  const [selection, setSelection] = useMemoire('cand.choix', null);
  const [contactChoisi, setContactChoisi] = useMemoire('contacts.choix', null);
  const [partieProfil, setPartieProfil] = useMemoire('profil.partie', 'parcours');
  const progression = useProgression(etat);
  const mainRef = useRef<HTMLElement>(null);
  useReleveGabarit(mainRef, onglet, Boolean(etat) && (onglet !== 'offres' || Boolean(lesOffres.offres)));
  // ANCHOR: la photo de profil remplace l'icône du bouton Profil quand elle existe
  const photo = usePhoto();
  useEffect(() => { if (etat) definirPhoto(Boolean(etat.photo)); }, [etat?.photo]);
  // ANCHOR: derniere = état affiché, serveur = dernier état connu du serveur. L'enregistrement n'envoie que la différence.
  const derniere = useRef<any>(null);
  const serveur = useRef<any>(null);
  const minuteur = useRef<any>(null);
  const enVol = useRef(false);
  // NOTE: vrai tant que le dernier enregistrement a échoué, des modifications locales attendent encore d'être envoyées
  const echec = useRef(false);

  useEffect(() => {
    chargerEtat()
      .then(e => { derniere.current = e; serveur.current = instantane(e); setEtat(e); })
      .catch(e => setErreur(e.message));
  }, []);

  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { /* stockage indisponible */ }
  }, [theme]);

  useEffect(() => { location.hash = onglet; }, [onglet]);

  const enregistrer = useCallback(async () => {
    clearTimeout(minuteur.current);
    minuteur.current = null;
    if (enVol.current) { minuteur.current = setTimeout(enregistrer, 500); return; }
    enVol.current = true;
    setSauvegarde('encours');
    try {
      const actuel = derniere.current;
      const connu = serveur.current;
      let aRecharger = false;
      // NOTE: une ligne refusée (4xx, période invalide par exemple) est signalée sans bloquer les autres ; elle repartira à la prochaine modification
      const refus: string[] = [];
      // Suppressions (des échanges vers les candidatures), puis créations et modifications champ par champ (dans l'autre sens)
      // ANCHOR: les écarts avec le serveur (ligne supprimée ou créée par l'API entre-temps) sont absorbés au lieu de bloquer l'enregistrement
      for (const col of [...COLLECTIONS].reverse()) {
        const ids = new Set(actuel[col].map(x => x.id));
        for (const id of [...connu[col].keys()]) {
          if (ids.has(id)) continue;
          // NOTE: 404 attendu pour les tâches et échanges déjà supprimés avec leur candidature
          try { await supprimer(col, id); } catch (e) { if (e.status !== 404) throw e; }
          connu[col].delete(id);
        }
      }
      for (const col of COLLECTIONS) {
        for (const x of actuel[col]) {
          const avant = connu[col].get(x.id);
          const champs = avant
            ? Object.fromEntries(Object.keys(x).filter(k => k !== 'id' && different(x[k], avant[k])).map(k => [k, x[k]]))
            : null;
          if (avant && !Object.keys(champs!).length) continue;
          try {
            if (avant) await modifier(col, x.id, champs);
            else await creer(col, x);
          } catch (e) {
            // Supprimée ailleurs pendant la modification : on la recrée. Déjà créée ailleurs (même id) : la version du serveur prime, rechargée ensuite.
            if (avant && e.status === 404) await creer(col, x);
            else if (!avant && e.status === 409) aRecharger = true;
            else if (e.status >= 400 && e.status < 500) { refus.push(e.message); continue; }
            else throw e;
          }
          connu[col].set(x.id, x);
        }
      }
      const kv = Object.fromEntries(CLES_KV.filter(k => JSON.stringify(actuel[k]) !== connu.kv[k]).map(k => [k, actuel[k]]));
      if (Object.keys(kv).length) {
        await enregistrerEtat(kv);
        for (const k of Object.keys(kv)) connu.kv[k] = JSON.stringify(kv[k]);
      }
      if (refus.length) {
        echec.current = true;
        setMessageErreur(refus.join(' '));
        setSauvegarde('erreur');
        return;
      }
      echec.current = false;
      setMessageErreur('');
      if (aRecharger && !minuteur.current) {
        const e = await chargerEtat();
        if (!minuteur.current) { derniere.current = e; serveur.current = instantane(e); setEtat(e); }
      }
      // Des modifications ont pu arriver pendant l'envoi : le minuteur les enverra
      setSauvegarde(minuteur.current ? 'sale' : 'ok');
    } catch (e) {
      console.error(e);
      echec.current = true;
      setMessageErreur(e.message);
      setSauvegarde('erreur');
      // NOTE: nouvel essai automatique (serveur relancé, réseau revenu), le bouton Réessayer reste disponible
      // Une erreur 4xx (donnée refusée) ne se résoudra pas seule : pas de nouvel essai dans ce cas
      if (!minuteur.current && !(e.status >= 400 && e.status < 500)) minuteur.current = setTimeout(enregistrer, 10000);
    } finally {
      enVol.current = false;
    }
  }, []);

  // ANCHOR: rendez-vous (ligne 121) : mis à jour après chaque appel à l'API, sans passer par l'envoi par différence (le serveur seul écrit google_id et synchro)
  const majRdv = useCallback((f: (l: any[]) => any[]) => {
    setEtat(e => {
      const suivant = { ...e, rendez_vous: f(e.rendez_vous ?? []) };
      derniere.current = suivant;
      return suivant;
    });
  }, []);

  // Fusionne les changements (objet, ou fonction de l'état courant), puis enregistre une seconde après la dernière modification
  const maj = useCallback(patch => {
    setEtat(e => {
      const suivant = { ...e, ...(typeof patch === 'function' ? patch(e) : patch) };
      derniere.current = suivant;
      return suivant;
    });
    setSauvegarde('sale');
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(enregistrer, 1000);
  }, [enregistrer]);

  // NOTE: recharge ce qui a changé côté serveur (API, synchro, écritures de Claude), sauf modifications en attente : au retour sur l'onglet du navigateur et toutes les 5 s tant qu'il est visible (fenêtre déjà au premier plan ou sur un autre écran)
  useEffect(() => {
    const recharger = async () => {
      if (document.visibilityState !== 'visible' || minuteur.current || enVol.current || echec.current || !derniere.current) return;
      try {
        const e = await chargerEtat();
        if (minuteur.current || enVol.current || echec.current) return;
        if (JSON.stringify(e) !== JSON.stringify(derniere.current)) { derniere.current = e; serveur.current = instantane(e); setEtat(e); }
      } catch { /* hors ligne : on garde l'affichage */ }
    };
    const minuteurRecharge = setInterval(recharger, 5000);
    document.addEventListener('visibilitychange', recharger);
    window.addEventListener('focus', recharger);
    return () => { clearInterval(minuteurRecharge); document.removeEventListener('visibilitychange', recharger); window.removeEventListener('focus', recharger); };
  }, []);

  useEffect(() => {
    const avant = e => { if (sauvegarde === 'sale' || sauvegarde === 'erreur') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', avant);
    return () => window.removeEventListener('beforeunload', avant);
  }, [sauvegarde]);

  if (erreur) return <main className="shell"><p className="empty" role="alert">{erreur}</p></main>;
  if (!etat) return <SqPage />;

  // ANCHOR: ouvre une offre dans l'onglet Offres (depuis la fiche d'une candidature) ; Offres consomme la cible à son montage
  // NOTE: une offre créée ou épinglée depuis l'API après le chargement de la page manque à la liste d'App : on la recharge avant d'ouvrir l'onglet, sinon l'écran retombe sur la première offre
  const ouvrirOffre = id => {
    const aller = () => { setOffreCible(id); setOnglet('offres'); window.scrollTo(0, 0); };
    if (lesOffres.offres?.some(o => o.id_offre === id)) aller(); else lesOffres.recharger().then(aller);
  };
  const ouvrirCandidature = id => { setSelection(id); setOnglet('cand'); window.scrollTo(0, 0); };
  const allerAgenda = cible => { setAgendaCible(cible); setOnglet('agenda'); window.scrollTo(0, 0); };
  const ouvrirContact = id => { setContactChoisi(id); setOnglet('contacts'); window.scrollTo(0, 0); };
  // NOTE: CV sur mesure depuis une offre ou une candidature : onglet CV avec la cible présélectionnée
  const allerCompetences = () => { setPartieProfil('comp'); setOnglet('profil'); window.scrollTo(0, 0); };
  const allerPartieProfil = (partie: string) => { setPartieProfil(partie); setOnglet('profil'); window.scrollTo(0, 0); };
  const ouvrirCompetence = (nom: string) => { setCompCible(nom); allerPartieProfil('comp'); };
  const ouvrirCv = (cible: { offre_id?: string; candidature_id?: string }) => { setCvCible(cible); setLettreCible(cible); setVuesOuvertes(o => ({ ...o, cv: true })); setVueCv('cv'); setOnglet('cv'); window.scrollTo(0, 0); };
  const ouvrirLettre = (cible: { offre_id?: string; candidature_id?: string }) => { setLettreCible(cible); setVuesOuvertes(o => ({ ...o, lettre: true })); setVueCv('lettre'); setOnglet('cv'); window.scrollTo(0, 0); };
  const [libelle, classe] = SAUVEGARDE[sauvegarde];

  const rendreOnglet = ([k, l, Ico]) => (
      <button key={k} type="button" role="tab" aria-selected={onglet === k} className={'tab' + (onglet === k ? ' on' : '')} onClick={() => setOnglet(k)}>{k === 'profil' && photo.presente ? <AvatarProfil url={photo.url} Icone={Ico} /> : <Ico size={15} aria-hidden="true" />}{l}{k === 'offres' && nonVues > 0 && <span className="count tab-count" aria-label={`${nonVues} offres non vues`}>{nonVues}</span>}{k === 'cand' && actives > 0 && <span className="count tab-count" aria-label={`${actives} candidatures actives`}>{actives}</span>}{k === 'contacts' && nbContacts > 0 && <span className="count tab-count" aria-label={`${nbContacts} contacts`}>{nbContacts}</span>}{k === 'agenda' && rdvAVenir > 0 && <span className="count tab-count" aria-label={`${rdvAVenir} rendez-vous à venir`}>{rdvAVenir}</span>}</button>
  );
  return (
    <RendezVousProvider rdvs={etat.rendez_vous ?? []} majRdv={majRdv} candidatures={etat.candidatures} contacts={etat.contacts} offres={lesOffres.offres} maj={maj}>
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="brand" onClick={() => { setOnglet('auj'); window.scrollTo(0, 0); }} title="Retour à l'accueil">
            <Logo className="logo" />
            <span>
              <span className="brand-titre">Suivi emploi</span>
              <span className="brand-sous">Votre carrière à porter de clics</span>
            </span>
          </button>
          <nav className="tabs" role="tablist" aria-label="Sections">
            {ONGLETS.filter(([k]) => !REGLAGES.includes(k)).map(rendreOnglet)}
          </nav>
          <div className="topbar-end">
          <nav className="tabs tabs-reglages" role="tablist" aria-label="Profil et administration">
            {ONGLETS.filter(([k]) => REGLAGES.includes(k)).map(rendreOnglet)}
          </nav>
            <span role="status">
              {(sauvegarde !== 'ok' || confirme) && (
                <span className={'save ' + classe} title={sauvegarde === 'erreur' ? messageErreur : undefined}>
                  {sauvegarde === 'erreur' && messageErreur ? `${libelle} : ${messageErreur}` : libelle}
                </span>
              )}
            </span>
            {sauvegarde !== 'ok' && sauvegarde !== 'encours' && <button type="button" className="btn btn-ghost small" onClick={enregistrer}>{sauvegarde === 'erreur' ? 'Réessayer' : 'Enregistrer'}</button>}
            <button
              type="button"
              className="btn btn-ghost icon"
              onClick={() => setTheme(t => (t === 'dark' ? 'light' : t === 'light' ? 'auto' : 'dark'))}
              title={`Thème : ${theme === 'auto' ? 'automatique' : theme === 'dark' ? 'sombre' : 'clair'}`}
              aria-label="Changer de thème"
            >
              {theme === 'dark' ? <Moon size={17} /> : theme === 'light' ? <Sun size={17} /> : <SunMoon size={17} />}
            </button>
          </div>
        </div>
      </header>

      <main className="shell" ref={mainRef}>
        {AIDE[onglet] && <p className="aide">{AIDE[onglet]}</p>}
        {onglet === 'auj' && <Aujourdhui etat={etat} maj={maj} progression={progression} ouvrirCandidature={ouvrirCandidature} ouvrirOffre={ouvrirOffre} allerOffres={filtres => { setFiltresOffres(filtres?.nativeEvent ? null : filtres ?? null); setOnglet('offres'); }} allerCandidatures={() => setOnglet('cand')} allerProfil={() => { setPartieProfil('badges'); setOnglet('profil'); }} allerAdmin={() => { setOnglet('admin'); window.scrollTo(0, 0); }} allerAgenda={allerAgenda} rechargerOffres={lesOffres.recharger} />}
        {onglet === 'offres' && !lesOffres.offres && !lesOffres.erreur && <SqGabarit page="offres" repli={<SqSplit label="Chargement des offres" />} label="Chargement des offres" />}
        {onglet === 'offres' && (lesOffres.offres || lesOffres.erreur) && <Offres offres={lesOffres.offres} setOffres={lesOffres.setOffres} erreur={lesOffres.erreur} recharger={lesOffres.recharger} candidatures={etat.candidatures} competences={etat.competences} experiences={etat.experiences} projets={etat.projets} contacts={etat.contacts} maj={maj} ouvrirCandidature={ouvrirCandidature} ouvrirContact={ouvrirContact} ouvrirCv={ouvrirCv} cvVersions={etat.cvVersions} allerCompetences={allerCompetences} cible={offreCible} cibleLue={() => setOffreCible(null)} filtresCible={filtresOffres} filtresLus={() => setFiltresOffres(null)} />}
        {onglet === 'cand' && <Candidatures etat={etat} maj={maj} selection={selection} setSelection={setSelection} ouvrirOffre={ouvrirOffre} ouvrirCv={ouvrirCv} ouvrirLettre={ouvrirLettre} ouvrirContact={ouvrirContact} />}
        {onglet === 'agenda' && <Agenda cible={agendaCible} cibleLue={() => setAgendaCible(null)} ouvrirCandidature={ouvrirCandidature} ouvrirOffre={ouvrirOffre} ouvrirContact={ouvrirContact} candidatures={etat.candidatures} contacts={etat.contacts} offres={lesOffres.offres} allerAdmin={() => { setOnglet('admin'); window.scrollTo(0, 0); }} />}
        {onglet === 'contacts' && <Contacts etat={etat} maj={maj} offres={lesOffres.offres} selection={contactChoisi} setSelection={setContactChoisi} ouvrirOffre={ouvrirOffre} ouvrirCandidature={ouvrirCandidature} />}
        {onglet === 'profil' && <Profil etat={etat} maj={maj} progression={progression} partie={partieProfil} setPartie={setPartieProfil} offres={lesOffres.offres} compCible={compCible} compCibleLue={() => setCompCible('')} ouvrirCompetence={ouvrirCompetence} />}
        {onglet === 'cv' && (
          <section aria-label="CV/LM">
            {/* NOTE: la bascule CV / Lettre et les boutons tout déplier, tout replier sur la même ligne : ils agissent sur les blocs repliables de la vue affichée */}
            <div className="segments-barre segments-barre-cv">
              <div className="segments-gauche">
              <div className="segments" role="tablist" aria-label="CV ou lettre">
                {([['cv', 'CV'], ['lettre', 'Lettre de motivation']] as const).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={vueCv === k} className={'segment' + (vueCv === k ? ' on' : '')} onClick={() => choisirVue(k)}>{l}</button>
                ))}
              </div>
              <ToutReplier cible={corpsCv} selecteur={`[data-vue="${vueCv}"] details.bloc-rep`} />
              </div>
              <div className="segments-slot" ref={setSlotCv} />
            </div>
            <div className="profil-corps" ref={corpsCv}>
              {/* NOTE: les deux vues restent montées une fois ouvertes (masquées, pas démontées) : revenir de la lettre au CV ne recompose rien et ne perd ni la cible ni l'aperçu */}
              {(vueCv === 'cv' || vuesOuvertes.cv) && <div data-vue="cv" style={vueCv === 'cv' ? undefined : { display: 'none' }}><SlotBarre.Provider value={vueCv === 'cv' ? slotCv : null}><Cv etat={etat} maj={maj} offres={lesOffres.offres} cible={vueCv === 'cv' ? cvCible : null} cibleLue={() => setCvCible(null)} allerPartie={allerPartieProfil} /></SlotBarre.Provider></div>}
              {(vueCv === 'lettre' || vuesOuvertes.lettre) && <div data-vue="lettre" style={vueCv === 'lettre' ? undefined : { display: 'none' }}><SlotBarre.Provider value={vueCv === 'lettre' ? slotCv : null}><Lettre etat={etat} maj={maj} offres={lesOffres.offres} cible={vueCv === 'lettre' ? lettreCible : null} cibleLue={() => setLettreCible(null)} allerPartie={allerPartieProfil} /></SlotBarre.Provider></div>}
            </div>
          </section>
        )}
        {onglet === 'admin' && <Admin />}
      </main>
      <PiedDePage />
      <Succes progression={progression} />
    </RendezVousProvider>
  );
}
