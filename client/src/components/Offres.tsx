import ChampRecherche from './ChampRecherche.tsx';
import { SqSplit } from './Squelettes.tsx';
import AnalyseIA from './AnalyseIA.tsx';
import CarteLieu from './CarteLieu.tsx';
import ModalScore from './ModalScore.tsx';
import { AlertTriangle, ArrowLeft, Bookmark, UserPlus, Building2, CalendarDays, Check, Euro, FileSignature, Globe, MapPin, Plus, Send, SlidersHorizontal, Sparkles, Target, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { chargerTrajets, creerOffre, majOffre, supprimerOffre } from '../api.ts';
import { useTraitements } from '../useTraitements.ts';
import CompetencesOffre from './CompetencesOffre.tsx';
import ParcoursOffre from './ParcoursOffre.tsx';
import { plateformeCompte, usePlateformes } from '../plateformes.ts';
import ContactsLies from './ContactsLies.tsx';
import BoiteLiee from './BoiteLiee.tsx';
import { CATEGORIES, POSTULER_VIA, SOURCES, STATUTS } from '../constants.ts';
import { rapprocher, regrouperAnnonces } from '../doublons.ts';
import { niveauScore, preparerScore } from '../score.ts';
import { chargerCentresZone, distanceLieuBonusKm, distanceZoneKm } from '../geo.ts';
import { ajouterJours, aujourdhui, ecranLarge, fmtDate, formaterSalaire, useMemoire, lienSur } from '../utils.ts';
import Postuler from './Postuler.tsx';
import Spontanees from './Spontanees.tsx';
import TrajetOffre from './TrajetOffre.tsx';
import { coutKm as coutKmDe } from '../trajets.ts';
import EcartSalaire from './EcartSalaire.tsx';
import FiltresPastilles from './FiltresPastilles.tsx';
import NumeroOffre from './NumeroOffre.tsx';
import Select from './Select.tsx';
import Suggestions from './Suggestions.tsx';
import { DEPARTEMENTS } from '../departements.ts';
import { useEnLigne } from '../useEnLigne.ts';
import { METIERS_CV } from '../../../lib/listes.mjs';

const PAGE = 80;
const TRIS = [['score', 'Les plus pertinentes'], ['date', 'Les plus récentes']];
const estManuelle = o => o.id_offre.startsWith('man-');
// ANCHOR: nouvelle = détectée il y a moins de 3 jours (même seuil que l'onglet Aujourd'hui), ni vue, ni écartée, ni expirée
const estNouvelle = o => !o.vue && !o.ignoree && !o.expiree && o.date_detection >= ajouterJours(aujourdhui(), -2);

// Rappel dans la liste : candidature déjà faite sur cette offre, ou chez le même employeur
function BadgeDoublon({ rap }) {
  if (!rap) return null;
  if (rap.type === 'employeur') return <span className="badge" style={{ '--c': 'var(--c-amber)' }} title="Candidature existante chez le même employeur"><Building2 size={11} />Déjà candidaté</span>;
  const s = STATUTS[rap.cand.statut] || STATUTS.en_cours;
  return <span className="badge" style={{ '--c': s.color }} title="Candidature existante pour cette offre"><Send size={11} />Postulé · {s.label}</span>;
}

function OffresAnnonces({ versSpontanees, candidatures, competences, experiences, projets, contacts, maj, ouvrirCandidature, ouvrirContact, ouvrirCv, cvVersions, allerCompetences, cible, cibleLue, filtresCible, filtresLus, offres, setOffres, erreur, recharger }) {
  const [trajets, setTrajets] = useState<any>(null);
  const [f, setF] = useMemoire('offres.filtres', { cat: 'toutes', zone: '', ignorees: false, suivies: false, nonvues: false, expirees: false, q: '' });
  const [choix, setChoix] = useMemoire('offres.choix', null);
  const [postuler, setPostuler] = useState(false);
  const plateformes = usePlateformes();
  const [ajout, setAjout] = useState(false);
  const [limite, setLimite] = useState(PAGE);
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const liste_ = useRef<any>(null);

  // NOTE: la barre d'actualisation est sur l'accueil ; ici le hook sert à savoir si l'analyse est active et à recharger la liste en fin de passage
  const { analyse } = useTraitements(recharger);

  const [centresPrets, setCentresPrets] = useState(0);
  useEffect(() => { chargerCentresZone().then(() => setCentresPrets(1)); }, []);
  // NOTE: score recalculé seulement quand les offres, les compétences ou les centres des communes changent
  const scores = useMemo(() => {
    const calcul = preparerScore(competences, aujourdhui(), experiences, projets, distanceZoneKm, distanceLieuBonusKm);
    return new Map<string, any>((offres || []).map(o => [o.id_offre, calcul(o)]));
  }, [offres, competences, experiences, projets, centresPrets]);
  const tri = f.tri || 'score';

  // ANCHOR: parOffre rapproche chaque offre d'une candidature (lien, numéro retrouvé dans la candidature, ou même employeur)
  const parOffre = useMemo(() => rapprocher(offres, candidatures).parOffre, [offres, candidatures]);
  // ANCHOR: zones proposées déduites des offres en base : « proche » seulement si une offre l'est (zone proche réglée dans le .env), puis chaque département présent
  const zones = useMemo(() => {
    const deps: string[] = [...new Set<string>(offres.map(o => o.departement).filter(Boolean))].sort();
    return [['', 'Toutes zones'], ...(offres.some(o => o.proche) ? [['proche', 'Proche']] : []), ...deps.map(d => [d, DEPARTEMENTS[d] ? `${d} · ${DEPARTEMENTS[d]}` : d])];
  }, [offres]);
  // NOTE: une offre est déjà suivie quand la candidature est liée ou que son numéro y est écrit ; un simple même employeur ne la masque pas
  const suivie = id => ['lien', 'numero'].includes(parOffre.get(id)?.type);
  const dejaVue = o => Boolean(o.vue) || suivie(o.id_offre);
  // ANCHOR: annonces republiées sous un autre identifiant : une seule ligne par groupe (la suivie, sinon la plus récente), les copies s'affichent avec le commutateur
  const annonces = useMemo(() => regrouperAnnonces(offres, suivie), [offres, parOffre]);
  const changer = champs => { setF(v => ({ ...v, ...champs })); setLimite(PAGE); };
  // ANCHOR: un seul prédicat pour la liste et les compteurs de catégorie (tous les filtres sauf la catégorie), pour que le nombre annoncé soit celui affiché
  const avantVue = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return (offres || []).filter(o => {
      if (Boolean(o.ignoree) !== f.ignorees) return false;
      if (!f.copies && !annonces.principales.has(o.id_offre)) return false;
      if (suivie(o.id_offre) !== f.suivies) return false;
      if (Boolean(o.expiree) !== Boolean(f.expirees)) return false;
      if (f.zone === 'proche' && !o.proche && !estManuelle(o)) return false;
      if (f.zone && f.zone !== 'proche' && o.departement !== f.zone) return false;
      return !q || `${o.id_offre} ${o.titre} ${o.entreprise || ''} ${o.ville} ${o.source} ${o.description} ${o.annonce || ''}`.toLowerCase().includes(q);
    });
  }, [offres, f.q, f.zone, f.ignorees, f.suivies, f.expirees, f.copies, parOffre, annonces]);
  // ANCHOR: Non vues et Vues s'appliquent après tous les autres filtres, leurs compteurs partent de la même liste (catégorie comprise)
  // NOTE: Nouvelles = détectées aujourd'hui (même règle que le compteur de l'accueil), cumulable avec Non vues ou Vues
  const duJour = o => (o.date_detection || '').slice(0, 10) === aujourdhui();
  const filtrees = useMemo(() => avantVue.filter(o => (!f.nonvues || !dejaVue(o)) && (!f.vues || dejaVue(o)) && (!f.nouvelles || duJour(o)) && (!f.epinglees || o.epinglee)), [avantVue, suivie, f.nonvues, f.vues, f.nouvelles, f.epinglees]);
  const dansCat = useMemo(() => avantVue.filter(o => f.cat === 'toutes' || o.categorie === f.cat), [avantVue, f.cat]);
  const nbVues = dansCat.filter(dejaVue).length;
  const nbNonVues = dansCat.length - nbVues;
  const nbFiltres = [f.zone, f.suivies, f.nonvues, f.vues, f.nouvelles, f.expirees, f.copies, f.ignorees, f.epinglees].filter(Boolean).length;
  const nbNouvelles = dansCat.filter(duJour).length;
  const nbEpinglees = dansCat.filter(o => o.epinglee).length;
  const compte = cat => filtrees.filter(o => cat === 'toutes' || o.categorie === cat).length;

  const liste = useMemo(() => filtrees
    .filter(o => f.cat === 'toutes' || o.categorie === f.cat)
    // NOTE: une offre épinglée ne remonte pas : seuls le marque-page et le filtre Épinglées la signalent, pour ne pas encombrer la recherche
    .sort((a, b) => (tri === 'score' ? scores.get(b.id_offre).total - scores.get(a.id_offre).total : 0)
      || (b.date_detection || '').localeCompare(a.date_detection || '')), [filtrees, f.cat, tri, scores]);

  const offre = offres?.find(o => o.id_offre === choix) ?? null;
  // NOTE: contrôle de l'annonce à l'ouverture : le serveur marque expirée une offre clôturée libre, l'écran suit sans recharger
  const enLigne = useEnLigne(offre?.id_offre, Boolean(offre) && !offre?.expiree, id => setOffres(l => l.map(x => (x.id_offre === id ? { ...x, expiree: 1 } : x))));

  // NOTE: offre demandée depuis une candidature : le détail s'affiche même si les filtres la masquent dans la liste
  useEffect(() => {
    if (!cible) return;
    setChoix(cible);
    setPostuler(false);
    cibleLue();
  }, [cible, cibleLue, setChoix]);

  // NOTE: filtres demandés depuis l'accueil : remplacent ceux mémorisés, toutes catégories
  useEffect(() => {
    if (!filtresCible) return;
    changer({ cat: 'toutes', zone: '', ignorees: false, suivies: false, nonvues: false, vues: false, nouvelles: false, expirees: false, copies: false, epinglees: false, q: '', ...filtresCible });
    filtresLus();
  }, [filtresCible]);

  // NOTE: sur grand écran, la première offre de la liste s'ouvre si aucune n'est choisie, sauf si une offre est demandée par un autre onglet (cible pas encore lue)
  useEffect(() => {
    if (!cible && offres && !offre && liste.length && ecranLarge()) setChoix(liste[0].id_offre);
  }, [cible, offres, offre, liste, setChoix]);

  const selectionner = id => { setChoix(id); setPostuler(false); };

  const patch = (o, champs) => {
    setOffres(l => l.map(x => (x.id_offre === o.id_offre ? { ...x, ...champs } : x)));
    return majOffre(o.id_offre, champs).catch(e => alert(e.message));
  };

  // Écarte ou remet l'offre, puis passe à la suivante de la liste
  const ecarter = o => {
    const i = liste.findIndex(x => x.id_offre === o.id_offre);
    patch(o, { ignoree: !o.ignoree });
    selectionner(liste[i + 1]?.id_offre ?? liste[i - 1]?.id_offre ?? null);
  };

  // ANCHOR: épingle d'une offre : valable 14 jours côté serveur (JOURS_EPINGLE), tombe seule sans action ; la réponse du serveur donne les jours restants
  const basculerEpingle = o => {
    const v = !o.epinglee;
    setOffres(l => l.map(x => (x.id_offre === o.id_offre ? { ...x, epinglee: v, jours_epingle: v ? 14 : null } : x)));
    return majOffre(o.id_offre, { epinglee: v })
      .then((r: any) => setOffres(l => l.map(x => (x.id_offre === o.id_offre ? { ...x, epinglee: r.epinglee, jours_epingle: r.jours_epingle, epinglee_le: r.epinglee_le } : x))))
      .catch(e => alert(e.message));
  };
  const basculerVue = o => patch(o, { vue: !o.vue });
  // NOTE: ouvrir l'annonce la marque comme vue, sans jamais la remettre en non vue
  const marquerVue = o => { if (!o.vue) patch(o, { vue: true }); };
  // Marque l'annonce comme expirée (ou la remet), puis passe à la suivante de la liste
  const basculerExpiree = o => {
    const i = liste.findIndex(x => x.id_offre === o.id_offre);
    patch(o, { expiree: !o.expiree });
    selectionner(liste[i + 1]?.id_offre ?? liste[i - 1]?.id_offre ?? null);
  };

  // ANCHOR: raccourcis clavier hors champ de saisie : j/k ou flèches pour naviguer, o ouvrir l'annonce, p postuler, e écarter, v vue/non vue, x expirée
  useEffect(() => {
    const touche = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.closest?.('.select') || document.querySelector('dialog[open]')) return;
      const i = liste.findIndex(x => x.id_offre === choix);
      const aller = j => {
        const o = liste[Math.max(0, Math.min(liste.length - 1, j))];
        if (!o) return;
        e.preventDefault();
        selectionner(o.id_offre);
        liste_.current?.querySelector(`[data-id="${CSS.escape(o.id_offre)}"]`)?.scrollIntoView({ block: 'nearest' });
      };
      if (e.key === 'j' || e.key === 'ArrowDown') aller(i + 1);
      else if (e.key === 'k' || e.key === 'ArrowUp') aller(i - 1);
      else if (!offre) return;
      else if (e.key === 'o' && lienSur(offre.lien)) { window.open(lienSur(offre.lien), '_blank', 'noopener'); marquerVue(offre); }
      else if (e.key === 'p' && !suivie(offre.id_offre)) { e.preventDefault(); setPostuler(true); }
      else if (e.key === 'e') ecarter(offre);
      else if (e.key === 'v') basculerVue(offre);
      else if (e.key === 'x') basculerExpiree(offre);
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  });

  const ajouterOffre = async d => {
    const o = await creerOffre(d);
    setOffres(l => [o, ...l]);
    setF(v => ({ ...v, cat: 'toutes', zone: '', ignorees: false, suivies: false, nonvues: false, vues: false, nouvelles: false, expirees: false, copies: false, epinglees: false, q: '' }));
    selectionner(o.id_offre);
    setAjout(false);
  };

  const supprimer = async o => {
    const nbContacts = contacts.filter(k => k.offres.includes(o.id_offre)).length;
    if (!confirm(`Supprimer l'offre « ${o.titre} » ?${nbContacts ? ` Les contacts liés (${nbContacts}) sont conservés, sans lien vers cette offre.` : ''}`)) return;
    try {
      await supprimerOffre(o.id_offre);
      setOffres(l => l.filter(x => x.id_offre !== o.id_offre));
      // NOTE: le serveur a retiré les liens des contacts avec l'offre (cascade) : l'état local suit, sinon le prochain envoi du contact serait refusé
      if (contacts.some(k => k.offres.includes(o.id_offre))) maj(e => ({ contacts: e.contacts.map(k => (k.offres.includes(o.id_offre) ? { ...k, offres: k.offres.filter(x => x !== o.id_offre) } : k)) }));
      selectionner(null);
    } catch (e) { alert(e.message); }
  };

  if (erreur) return <p className="empty">Offres indisponibles : {erreur}</p>;
  if (!offres) return <SqSplit label="Chargement des offres" />;

  const rap = offre && parOffre.get(offre.id_offre);
  const cand = rap && rap.type !== 'employeur' ? rap.cand : null;
  const lier = () => maj(e => ({ candidatures: e.candidatures.map(c => (c.id === rap.cand.id ? { ...c, offre_id: offre.id_offre } : c)) }));

  return (
    <section aria-labelledby="titre-offres" className={'split' + (offre ? ' avec-detail' : '')}>
      <h2 id="titre-offres" className="sr-only">Offres</h2>

      <div className="split-liste">
        <div className="sync-bar">
          <ChampRecherche className="search" placeholder="Rechercher un titre, une entreprise, une ville..." value={f.q} onChange={e => changer({ q: e.target.value })} />
          <button type="button" className="btn btn-primary small" onClick={() => setAjout(true)} title="Saisir une offre à la main"><Plus size={15} />Offre</button>
          <button type="button" className="btn btn-ghost small" onClick={versSpontanees} title="Entreprises à contacter sans offre publiée (La Bonne Boite)"><Building2 size={15} />Spontanées</button>
        </div>
        <FiltresPastilles label="Catégorie" valeur={f.cat} onChange={cat => changer({ cat })} items={Object.entries(CATEGORIES).map(([k, c]) => ({ cle: k, libelle: c.label, couleur: c.color, nombre: compte(k) }))} />
        <details className="filtres-repli" open={filtresOuverts} onToggle={e => setFiltresOuverts(e.currentTarget.open)}>
          <summary><SlidersHorizontal size={15} />Filtres et tri{nbFiltres > 0 && <span className="count">{nbFiltres}</span>}</summary>
        <div className="filtres">
          <Select value={f.zone} onChange={e => changer({ zone: e.target.value })} aria-label="Zone" options={zones} />
          <Select value={tri} onChange={e => changer({ tri: e.target.value })} aria-label="Trier" options={TRIS} />
        </div>
        <div className="chips chips-compact" role="group" aria-label="Affichage">
          <button type="button" className={'chip' + (f.nonvues ? ' on' : '')} aria-pressed={f.nonvues} onClick={() => changer({ nonvues: !f.nonvues, vues: false })} title="Masquer les offres déjà marquées comme vues" aria-label={`Non vues, ${nbNonVues}`}><span className="chip-libelle">Non vues</span> <span className="count" aria-hidden="true">{nbNonVues}</span></button>
          <button type="button" className={'chip' + (f.nouvelles ? ' on' : '')} aria-pressed={Boolean(f.nouvelles)} onClick={() => changer({ nouvelles: !f.nouvelles })} title="N'afficher que les offres détectées aujourd'hui" aria-label={`Nouvelles, ${nbNouvelles}`}><span className="chip-libelle">Nouvelles</span> <span className="count" aria-hidden="true">{nbNouvelles}</span></button>
          <button type="button" className={'chip' + (f.epinglees ? ' on' : '')} aria-pressed={Boolean(f.epinglees)} onClick={() => changer({ epinglees: !f.epinglees })} title="N'afficher que les offres épinglées (14 jours pour agir)" aria-label={`Épinglées, ${nbEpinglees}`}><span className="chip-libelle">Épinglées</span> <span className="count" aria-hidden="true">{nbEpinglees}</span></button>
          <button type="button" className={'chip' + (f.vues ? ' on' : '')} aria-pressed={Boolean(f.vues)} onClick={() => changer({ vues: !f.vues, nonvues: false })} title="N'afficher que les offres déjà marquées comme vues" aria-label={`Vues, ${nbVues}`}><span className="chip-libelle">Vues</span> <span className="count" aria-hidden="true">{nbVues}</span></button>
          <button type="button" className={'chip' + (f.suivies ? ' on' : '')} aria-pressed={f.suivies} onClick={() => changer({ suivies: !f.suivies })} title="Afficher aussi les offres pour lesquelles une candidature existe"><span className="chip-libelle">Déjà suivies</span></button>
          {annonces.principales.size < (offres?.length ?? 0) && (
            <button type="button" className={'chip' + (f.copies ? ' on' : '')} aria-pressed={Boolean(f.copies)} onClick={() => changer({ copies: !f.copies })} title="Annonces republiées sous un autre numéro, masquées par défaut"><span className="chip-libelle">Copies</span> <span className="count">{offres.length - annonces.principales.size}</span></button>
          )}
          <button type="button" className={'chip' + (f.expirees ? ' on' : '')} aria-pressed={f.expirees} onClick={() => changer({ expirees: !f.expirees })} title="Afficher les annonces qui ne sont plus disponibles"><span className="chip-libelle">Expirées</span></button>
          <button type="button" className={'chip' + (f.ignorees ? ' on' : '')} aria-pressed={f.ignorees} onClick={() => changer({ ignorees: !f.ignorees })} title="Afficher les offres écartées"><span className="chip-libelle">Écartées</span></button>
        </div>
        </details>
        <div className="filtres-bilan">
          <span className="muted small" title="Raccourcis : j/k naviguer, o ouvrir l'annonce, p postuler, e écarter, v vue/non vue, x expirée">{liste.length} offre(s){!f.nonvues && !f.vues ? ` · ${nbNonVues} non vue${nbNonVues > 1 ? 's' : ''} · ${nbVues} vue${nbVues > 1 ? 's' : ''}` : ''}</span>
          {(f.cat !== 'toutes' || f.zone || f.suivies || f.nonvues || f.vues || f.nouvelles || f.expirees || f.copies || f.ignorees || f.epinglees || f.q) && (
            <button type="button" className="lien" onClick={() => changer({ cat: 'toutes', zone: '', suivies: false, nonvues: false, vues: false, nouvelles: false, expirees: false, copies: false, ignorees: false, epinglees: false, q: '' })}>Réinitialiser les filtres</button>
          )}
        </div>

        {liste.length === 0 ? (
          <p className="empty">Aucune offre ne correspond à ces filtres.</p>
        ) : (
          <ul className="rows" ref={liste_} onScroll={e => { const u = e.currentTarget; if (liste.length > limite && u.scrollHeight - u.scrollTop - u.clientHeight < 300) setLimite(l => l + PAGE); }}>
            {liste.slice(0, limite).map(o => {
              const cat = CATEGORIES[o.categorie] || CATEGORIES.autre;
              return (
                <li key={o.id_offre} className="row-li">
                  <button type="button" data-id={o.id_offre} className={'row' + (o.id_offre === choix ? ' on' : '') + (dejaVue(o) ? ' vue' : '') + (suivie(o.id_offre) ? ' suivie' : '')} style={{ '--c': cat.color }} onClick={() => selectionner(o.id_offre)} aria-current={o.id_offre === choix}>
                    <span className="row-title"><NumeroOffre offre={o} copiable={false} repli={o.source || 'Libre'} /><span className="titre-texte">{o.titre}</span></span>
                    <span className="row-scores">
                      <span className={'score ' + niveauScore(scores.get(o.id_offre).total)} title="Score de pertinence sur 100"><Target size={11} />{scores.get(o.id_offre).total}</span>
                      {o.analyse && <span className={'score ' + niveauScore(o.analyse.note)} title="Note de l'analyse IA sur 100 (voir la fiche)"><Sparkles size={11} />{o.analyse.note}</span>}
                    </span>
                    <span className="row-sub">{o.entreprise || 'Employeur non indiqué'}{o.ville ? ` · ${o.ville}` : ''}</span>
                    <span className="row-badges">
                      {o.postuler_via && <span className="tag">{o.postuler_via}</span>}
                      {plateformeCompte(o, plateformes) && <span className="tag tag-compte" title={`Compte à créer sur ${plateformeCompte(o, plateformes)} pour postuler`} role="img" aria-label={`Compte à créer sur ${plateformeCompte(o, plateformes)}`}><UserPlus size={11} /></span>}
                      {estNouvelle(o) && !suivie(o.id_offre) && <span className="tag tag-new" title={`Détectée le ${o.date_detection}, pas encore vue`}>New</span>}
                      {o.epinglee && o.jours_epingle <= 3 && <span className="tag tag-urgent" title={`Épingle : ${o.jours_epingle} jour(s) pour agir`}>J-{o.jours_epingle}</span>}
                      {dejaVue(o) && <span className="tag tag-vue" title="Offre déjà vue"><Check size={11} />Vue</span>}
                      <BadgeDoublon rap={parOffre.get(o.id_offre)} />
                      {annonces.groupes.has(o.id_offre) && <span className="tag" title={`Annonce republiée sous ${annonces.groupes.get(o.id_offre).n - 1} autre(s) numéro(s)`}>x{annonces.groupes.get(o.id_offre).n}</span>}
                    </span>
                    <span className="row-date">{fmtDate(o.date_detection)}</span>
                  </button>
                  <button type="button" className={'epingle-offre' + (o.epinglee ? ' on' : '')} aria-pressed={Boolean(o.epinglee)} onClick={() => basculerEpingle(o)}
                    aria-label={o.epinglee ? `Désépingler ${o.titre}` : `Épingler ${o.titre}`} title={o.epinglee ? `Épinglée, expire dans ${o.jours_epingle} j : cliquer pour retirer` : 'Épingler pour 14 jours (à traiter ou elle retombe)'}>
                    <Bookmark size={16} fill={o.epinglee ? 'currentColor' : 'none'} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
            {liste.length > limite && (
              <li className="row-center"><button type="button" className="btn btn-ghost small" onClick={() => setLimite(l => l + PAGE)}>Afficher la suite ({liste.length - limite})</button></li>
            )}
          </ul>
        )}
      </div>

      <div className="split-detail">
        {!offre ? (
          <p className="empty">Choisir une offre dans la liste pour la consulter et postuler.</p>
        ) : (
          <article className="fiche" key={offre.id_offre}>
            <button type="button" className="btn btn-ghost small retour" onClick={() => selectionner(null)}><ArrowLeft size={15} />Liste</button>
            <div className="card-top">
              {estNouvelle(offre) && <span className="tag tag-new">New</span>}
              <span className="badge" style={{ '--c': (CATEGORIES[offre.categorie] || CATEGORIES.autre).color }}><span className="dot" />{(CATEGORIES[offre.categorie] || CATEGORIES.autre).label}</span>
              {offre.proche ? <span className="tag">Proche</span> : null}
              {!estManuelle(offre) && <span className="tag">{offre.source}</span>}
              {plateformeCompte(offre, plateformes) && <span className="tag tag-compte" title="Cette plateforme oblige à recréer un compte pour postuler"><UserPlus size={12} />Compte à créer sur {plateformeCompte(offre, plateformes)}</span>}
            </div>
            <h3 className="fiche-titre fiche-titre-id"><NumeroOffre offre={offre} repli={offre.source || 'Libre'} /><span>{offre.titre}</span></h3>
            {offre.analyse?.resume && <p className="fiche-resume small"><Sparkles size={13} /> {offre.analyse.resume}</p>}
            {enLigne?.statut === 'cloturee' && (
              <p className="warn small" role="status"><AlertTriangle size={14} /> L'annonce n'est plus en ligne sur France Travail{enLigne.marquee ? " : l'offre a été marquée expirée (le bouton Expirée la remet)." : enLigne.protegee ? " : offre liée à une candidature, un contact ou épinglée, elle n'est pas marquée expirée." : '.'}</p>
            )}
            <div className={'fiche-meta' + (offre.ville ? ' avec-carte' : '')}>
              <CarteLieu offre={offre} offres={offres} />
              <div className="fiche-meta-col">
                <MetaOffre offre={offre} trajets={trajets} />
                <div className="scores-deux">
                  <Pourquoi s={scores.get(offre.id_offre)} />
                  <AnalyseIA analyse={offre.analyse} actif={Boolean(analyse?.actif)} />
                </div>
              </div>
            </div>

            <CompetencesOffre key={offre.id_offre} offreId={offre.id_offre} actif={Boolean(analyse?.actif)} metier={METIERS_CV.includes(offre.categorie) ? offre.categorie : ''} competences={competences} maj={maj} allerCompetences={allerCompetences} />

            <ParcoursOffre
              offre={offre}
              lienAnnonce={lienSur(offre.lien)}
              candidature={cand}
              cvFait={Boolean(cand?.cv) || (cvVersions ?? []).some(v => v.offre_id === offre.id_offre)}
              compteAcreer={plateformeCompte(offre, plateformes)}
              plateformeNouvelle={Boolean(offre.postuler_via) && offre.postuler_via !== 'France Travail' && !candidatures.some(c => (c.plateforme || '').toLowerCase() === offre.postuler_via.toLowerCase())}
              postulerOuvert={postuler}
              estManuelle={estManuelle(offre)}
              actions={{
                vue: () => basculerVue(offre),
                epingle: () => basculerEpingle(offre),
                annonce: () => marquerVue(offre),
                cv: () => ouvrirCv({ offre_id: offre.id_offre, candidature_id: cand?.id }),
                postule: () => setPostuler(p => !p),
                candidature: () => ouvrirCandidature(cand.id),
                expiree: () => basculerExpiree(offre),
                ecarter: () => ecarter(offre),
                supprimer: () => supprimer(offre),
              }}
            />

            {cand && rap.type === 'lien' && (
              <BoiteLiee genre="Candidature liée" couleur={STATUTS[cand.statut as keyof typeof STATUTS]?.color} titre={cand.entreprise} sous={cand.poste} infos={[STATUTS[cand.statut as keyof typeof STATUTS]?.label, cand.date && fmtDate(cand.date), cand.plateforme]}>
                <button type="button" className="btn btn-ghost small" onClick={() => ouvrirCandidature(cand.id)}>Ouvrir la candidature</button>
              </BoiteLiee>
            )}

            {rap && rap.type !== 'lien' && (
              <div className="doublon">
                <p>
                  <b>{rap.type === 'numero' ? 'Candidature retrouvée par le numéro de l\'offre' : 'Déjà candidaté chez cet employeur'}</b>
                  {' : '}{rap.cand.entreprise.replace(/\s*\(.*$/, '')} · {STATUTS[rap.cand.statut]?.label}{rap.cand.date ? ` · ${fmtDate(rap.cand.date)}` : ''}{rap.cand.plateforme ? ` · ${rap.cand.plateforme}` : ''}
                </p>
                <div className="fiche-actions">
                  <button type="button" className="btn btn-ghost small" onClick={() => ouvrirCandidature(rap.cand.id)}>Ouvrir la candidature</button>
                  <button type="button" className="btn btn-ghost small" onClick={lier}>C'est cette offre : lier</button>
                </div>
              </div>
            )}

            {/* NOTE: contacts et rendez-vous se gèrent dans la fiche de la candidature ; sur l'offre, seuls les contacts déjà liés restent visibles */}
            {contacts.some(k => k.offres.includes(offre.id_offre)) && (
              <details className="annonce" open>
                <summary>Contacts</summary>
                <ContactsLies contacts={contacts} offreId={offre.id_offre} entreprise={offre.entreprise || ''} maj={maj} ouvrirContact={ouvrirContact} />
              </details>
            )}

            {postuler && !cand && (
              <Postuler offre={offre} candidatures={candidatures} cvVersions={cvVersions} maj={maj} onFini={plateforme => {
                setPostuler(false);
                if (!offre.postuler_via && plateforme) patch(offre, { postuler_via: plateforme });
              }} />
            )}

            {estManuelle(offre) ? (
              <label className="field">Texte de l'annonce
                <textarea className="input annonce-saisie" rows={16} defaultValue={offre.annonce} placeholder="Coller ici le texte de l'offre"
                  onBlur={e => { if (e.target.value !== offre.annonce) patch(offre, { annonce: e.target.value }); }} />
              </label>
            ) : offre.annonce ? (
              <details className="annonce" open>
                <summary>Texte de l'annonce</summary>
                <div className="annonce-texte">{offre.annonce}</div>
              </details>
            ) : (
              <p className="muted small">Texte de l'annonce non disponible : ouvrir le lien.</p>
            )}

            <label className="field">Le bouton Postuler de l'annonce mène à
              <Suggestions defaultValue={offre.postuler_via} options={POSTULER_VIA} placeholder="France Travail (formulaire), Meteojob, site de l'employeur..."
                onCommit={v => { if (v.trim() !== (offre.postuler_via || '')) patch(offre, { postuler_via: v.trim() }); }} />
            </label>
            <label className="field">Notes sur l'offre
              <textarea className="input" rows={5} defaultValue={offre.description} placeholder="Missions, exigences, contact, limite de caractères du formulaire..."
                onBlur={e => { if (e.target.value !== offre.description) patch(offre, { description: e.target.value }); }} />
            </label>
          </article>
        )}
      </div>

      {ajout && <OffreManuelle onClose={() => setAjout(false)} onSave={ajouterOffre} />}
    </section>
  );
}

// ANCHOR: métadonnées de l'offre, à droite de la carte (les champs vides sont omis)
function MetaOffre({ offre, trajets }) {
  const lignes = [
    ['Employeur', Building2, offre.entreprise || 'Non indiqué'],
    ['Lieu', MapPin, offre.ville ? `${offre.ville}${offre.departement ? ` (${offre.departement})` : ''}` : offre.lieu],
    ['Contrat', FileSignature, offre.contrat],
    ['Salaire', Euro, offre.salaire ? <>{formaterSalaire(offre.salaire)} <EcartSalaire salaire={offre.salaire} trajets={trajets} /></> : ''],
    ['Détectée le', CalendarDays, fmtDate(offre.date_detection)],
    ['Source', Globe, offre.source],
    ['Postuler via', Send, offre.postuler_via],
  ].filter(([, , v]) => v);
  return (
    <dl className="meta-offre">
      {lignes.map(([k, Icone, v]) => <div key={k}><dt><Icone size={12} />{k}</dt><dd>{v}</dd></div>)}
      {offre.ville && trajets?.departs.length > 0 && (
        <div className="meta-trajets">
          {trajets.departs.map(d => <TrajetOffre key={d.nom} offre={offre} depart={d} coutKm={coutKmDe(trajets)} tarifPeage={trajets.peage_km} />)}
        </div>
      )}
    </dl>
  );
}

// ANCHOR: détail du score : d'où viennent les points, et les compétences du profil trouvées dans l'annonce
function Pourquoi({ s }) {
  if (!s) return null;
  const parts = [['Métier visé', s.categorie, 14], ['Compétences', s.competences, 46], ['Proximité', s.proximite, 25], ['Fraîcheur', s.fraicheur, 15]];
  return (
    <ModalScore icone={Target} note={s.total} niveau={niveauScore(s.total)} libelle="Pertinence" legende="Pertinence : adéquation de l'offre à votre profil, sur 100. Cliquer pour le détail.">
      <ul className="pourquoi-barres">
        {parts.map(([l, v, max]) => (
          <li key={l}><span>{l}</span><span className="barre"><span style={{ width: `${(v / max) * 100}%` }} /></span><span className="muted small">{v}/{max}</span></li>
        ))}
      </ul>
      {(s.km !== null || s.exigences !== 0) && <p className="small">{s.km !== null && <>Distance estimée : environ {s.km} km. </>}{s.exigences !== 0 && <>Exigences de l'annonce (analyse IA) : {s.exigences > 0 ? '+' : ''}{s.exigences} point(s).</>}</p>}
      {(s.contrat !== 0 || s.bonusLieu !== 0) && <p className="small">{s.contrat !== 0 && <>Contrat ({s.contratRaison}) : offre éloignée, {s.contrat} point(s). </>}{s.bonusLieu !== 0 && <>Proche du lieu bonus : +{s.bonusLieu} point(s).</>}</p>}
      <p className="small">{s.trouvees.length ? <>Compétences trouvées dans l'annonce : {s.trouvees.join(' ; ')}</> : "Aucune compétence notée 3 ou plus n'apparaît dans l'annonce."}</p>
    </ModalScore>
  );
}

// Saisie d'une offre trouvée ailleurs (Glassdoor, LinkedIn, réseau...)
function OffreManuelle({ onClose, onSave }) {
  const ref = useRef<any>(null);
  const [f, setF] = useState({ titre: '', entreprise: '', ville: '', departement: '', lien: '', source: '', postuler_via: '', contrat: '', annonce: '', description: '' });
  const [erreur, setErreur] = useState('');
  useEffect(() => { ref.current.showModal(); }, []);
  const set = k => e => setF(v => ({ ...v, [k]: e.target.value }));

  return (
    <dialog ref={ref} className="dialog" onClose={onClose}>
      <form onSubmit={async e => {
        e.preventDefault();
        try { await onSave(f); } catch (x) { setErreur(x.message); }
      }}>
        <header className="dialog-head">
          <h2>Ajouter une offre</h2>
          <button type="button" className="btn btn-ghost icon" onClick={onClose} aria-label="Fermer" title="Fermer"><X size={16} /></button>
        </header>
        <div className="dialog-body">
          <label className="field">Intitulé du poste<input className="input" required autoFocus value={f.titre} onChange={set('titre')} /></label>
          <div className="grid-2">
            <label className="field">Entreprise<input className="input" value={f.entreprise} onChange={set('entreprise')} /></label>
            <label className="field">Trouvée sur<Suggestions value={f.source} onChange={set('source')} options={SOURCES} placeholder="Glassdoor, LinkedIn..." /></label>
            <label className="field">Ville<input className="input" value={f.ville} onChange={set('ville')} /></label>
            <label className="field">Département<input className="input" value={f.departement} onChange={set('departement')} inputMode="numeric" /></label>
            <label className="field">Contrat<input className="input" value={f.contrat} onChange={set('contrat')} placeholder="CDI, CDD, freelance..." /></label>
            <label className="field">Postuler via<Suggestions value={f.postuler_via} onChange={set('postuler_via')} options={POSTULER_VIA} /></label>
          </div>
          <label className="field">Lien de l'annonce<input className="input" type="url" value={f.lien} onChange={set('lien')} placeholder="https://" /></label>
          <label className="field">Texte de l'annonce<textarea className="input" rows={5} value={f.annonce} onChange={set('annonce')} placeholder="Coller ici le texte de l'offre" /></label>
          <label className="field">Notes<textarea className="input" rows={3} value={f.description} onChange={set('description')} /></label>
          {erreur && <p className="alert" role="alert">{erreur}</p>}
        </div>
        <footer className="dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary">Ajouter</button>
        </footer>
      </form>
    </dialog>
  );
}

// ANCHOR: l'onglet Offres a deux vues, les annonces et les candidatures spontanées (entreprises de La Bonne Boite), choix mémorisé
export default function Offres(props) {
  const [vue, setVue] = useMemoire('offres.vue', 'annonces');
  if (vue === 'spontanees') {
    return (
      <div className="spont-page">
        <div className="sync-bar"><button type="button" className="btn btn-ghost small" onClick={() => setVue('annonces')}><ArrowLeft size={15} />Annonces</button></div>
        <Spontanees />
      </div>
    );
  }
  return <OffresAnnonces {...props} versSpontanees={() => setVue('spontanees')} />;
}
