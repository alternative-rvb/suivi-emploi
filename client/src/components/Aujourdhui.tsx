import { BellRing, CalendarClock, Check, Hourglass, Inbox, ListChecks, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chargerOffres } from '../api.ts';
import { JOURS_RELANCE } from '../constants.ts';
import OffresEpinglees from './OffresEpinglees.tsx';
import APostuler from './APostuler.tsx';
import BarreTraitements from './BarreTraitements.tsx';
import { CarteBilan, CarteJournal, useBilanJour } from './BilanJour.tsx';
import NumeroOffre from './NumeroOffre.tsx';
import MarcheLocal from './MarcheLocal.tsx';
import MiniAgenda from './MiniAgenda.tsx';
import Progression from './Progression.tsx';
import ToutReplier from './ToutReplier.tsx';
import { Tuile, useTuiles } from './Tuile.tsx';
import type { DefTuile } from './Tuile.tsx';
import { useMasonry } from '../useMasonry.ts';
import { ajouterJours, aujourdhui, fmtDate, joursEntre, nouvelId } from '../utils.ts';

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

// Écran d'accueil : un bandeau (phrase du jour et chiffres cliquables), puis à gauche ce qui demande une action, à droite ce qui vient ensuite et le bilan
export default function Aujourdhui({ etat, maj, progression, ouvrirCandidature, ouvrirOffre, allerOffres, allerCandidatures, allerProfil, allerAdmin, allerAgenda, rechargerOffres }) {
  const { candidatures, taches } = etat;
  const bilan = useBilanJour(etat);
  const [titre, setTitre] = useState('');
  const ensuiteRef = useRef<HTMLDivElement>(null);
  const grille = useMasonry<HTMLDivElement>();
  const [echeance, setEcheance] = useState(aujourdhui());
  const [nouvellesOffres, setNouvellesOffres] = useState<any>(null);
  const [offres, setOffres] = useState<any[]>([]);
  const [offresChargees, setOffresChargees] = useState(false);
  const [tout, setTout] = useState(false);
  const auj = aujourdhui();
  const parId = useMemo(() => new Map(candidatures.map(c => [c.id, c])), [candidatures]);

  // NOTE: rechargé aussi en fin de synchro ou d'analyse (BarreTraitements), avec les offres d'App pour le badge de l'onglet
  const charger = useCallback(() => {
    const depuis = ajouterJours(aujourdhui(), -2);
    return chargerOffres()
      .then(l => { setOffres(l); return l; })
      .then(l => setNouvellesOffres(l.filter(o => !o.ignoree && !o.expiree && !o.candidature_id && o.categorie !== 'autre' && (o.date_detection ?? '') >= depuis).length))
      .catch(() => setNouvellesOffres(null))
      .finally(() => setOffresChargees(true));
  }, []);
  useEffect(() => { charger(); }, [charger]);
  const recharger = useCallback(() => Promise.all([charger(), rechargerOffres?.()]), [charger, rechargerOffres]);

  const ouvertes = useMemo(() => taches.filter(t => !t.faite).sort((a, b) => (a.echeance || '9999').localeCompare(b.echeance || '9999')), [taches]);
  const maintenant = ouvertes.filter(t => t.echeance && t.echeance <= auj);
  const ensuite = ouvertes.filter(t => !t.echeance || t.echeance > auj);
  const offreParId = useMemo(() => new Map(offres.map(o => [o.id_offre, o])), [offres]);

  // ANCHOR: tâches regroupées par candidature (ordre de la plus proche échéance), les tâches libres à part en dernier ; même présentation pour À faire maintenant et Ensuite
  const grouper = (liste: any[]) => {
    const m = new Map<string, any[]>();
    for (const t of liste) {
      const cle = t.candidature_id && parId.has(t.candidature_id) ? t.candidature_id : '';
      if (!m.has(cle)) m.set(cle, []);
      m.get(cle)!.push(t);
    }
    return [...m.entries()].sort(([a], [b]) => Number(a === '') - Number(b === ''));
  };
  const groupes = useMemo(() => grouper(ensuite), [ensuite, parId]);
  const groupesMaintenant = useMemo(() => grouper(maintenant), [maintenant, parId]);

  // ANCHOR: candidatures envoyées depuis plus de JOURS_RELANCE jours sans aucune tâche ouverte : rien ne rappellera de les relancer
  const aRelancer = useMemo(() => {
    const avecTache = new Set(ouvertes.filter(t => t.candidature_id).map(t => t.candidature_id));
    const limite = ajouterJours(auj, -JOURS_RELANCE);
    return candidatures.filter(c => c.statut === 'en_cours' && !avecTache.has(c.id) && (c.date || '') <= limite).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [candidatures, ouvertes, auj]);
  const entretiens = candidatures.filter(c => c.statut === 'entretien');
  const enAttente = candidatures.filter(c => c.statut === 'en_cours').length;
  const nbATraiter = maintenant.length + aRelancer.length;
  const offresNonVues = offresChargees ? offres.filter(o => !o.vue && !o.ignoree && !o.expiree && !o.candidature_id).length : null;

  const majT = (id, champs) => maj(e => ({ taches: e.taches.map(t => (t.id === id ? { ...t, ...champs } : t)) }));
  const relancer = liste => maj(e => ({ taches: [...e.taches, ...liste.map(c => ({ id: nouvelId(), candidature_id: c.id, titre: 'Relancer', echeance: auj, faite: false, creee: auj }))] }));
  const sansReponse = c => maj(e => ({ candidatures: e.candidatures.map(x => (x.id === c.id ? { ...x, statut: 'sans_reponse', raison: x.raison || 'Pas de réponse' } : x)) }));

  const ajouter = e => {
    e.preventDefault();
    if (!titre.trim()) return;
    maj(x => ({ taches: [...x.taches, { id: nouvelId(), candidature_id: null, titre: titre.trim(), echeance, faite: false, creee: auj }] }));
    setTitre('');
  };

  // NOTE: entreprise en gras puis poste en gris, sur une ligne qui peut passer à la suivante (jamais coupée : c'est ce qui identifie l'offre)
  const identite = c => c && (
    <button type="button" className="ligne-cand" onClick={() => ouvrirCandidature(c.id)} title="Ouvrir la candidature">
      <b>{c.entreprise}</b>{c.poste && <span className="muted"> · {c.poste}</span>}
    </button>
  );

  const relancesVisibles = tout ? aRelancer : aRelancer.slice(0, 5);
  const phrase = nbATraiter === 0
    ? "Rien d'urgent aujourd'hui."
    : `${pluriel(nbATraiter, 'chose à traiter', 'choses à traiter')} aujourd'hui.`;

  const ligneTache = (t, retard, groupe = false) => {
    const c = t.candidature_id && parId.get(t.candidature_id);
    return (
      <li key={t.id} className="auj-ligne">
        {/* NOTE: case à cocher ronde vide, à gauche : c'est un geste à faire, pas un état déjà atteint (un bouton « Fait » laissait croire que la tâche l'était) */}
        <button type="button" role="checkbox" aria-checked="false" className="coche-tache" onClick={() => majT(t.id, { faite: true })} aria-label={`Marquer comme faite : ${t.titre}`} title="Cocher quand c'est fait"><Check size={14} aria-hidden="true" /></button>
        <div className="auj-ligne-corps">
          <span className="auj-ligne-titre">{t.titre}</span>
          {!groupe && (c ? identite(c) : <span className="muted small">Sans candidature</span>)}
        </div>
        {retard > 0 && <span className="auj-retard">En retard de {retard} j</span>}
        {retard == null && <span className="auj-date">{t.echeance ? fmtDate(t.echeance) : 'Sans date'}</span>}
      </li>
    );
  };

  const blocGroupe = (cle: string, liste: any[], enRetard = false) => {
    const c: any = cle ? parId.get(cle) : null;
    return (
      <details key={cle || 'libres'} className="auj-groupe" open>
        <summary>
          {c ? (
            <>
              <NumeroOffre offre={offreParId.get(c.offre_id)} copiable={false} />
              <span className="auj-groupe-nom"><b>{c.entreprise}</b>{c.poste && <span className="muted"> · {c.poste}</span>}</span>
              <button type="button" className="lien" onClick={e => { e.preventDefault(); ouvrirCandidature(c.id); }}>Ouvrir</button>
            </>
          ) : <span className="auj-groupe-nom"><b>Sans candidature</b></span>}
          <span className="chev" aria-hidden="true" />
        </summary>
        <ul className="auj-liste">{liste.map(t => ligneTache(t, enRetard ? Math.max(0, joursEntre(t.echeance, auj)) : null, true))}</ul>
      </details>
    );
  };

  // ANCHOR: tuiles de l'accueil (ligne 122) : chacune a un id stable, l'ordre affiché est celui que l'utilisateur a choisi (useTuiles)
  // NOTE: ordre d'origine : à faire, ensuite, agenda, entretiens, relances, profil vu par un RH, bilan, journal
  const defs: DefTuile[] = [
    { id: 'a-faire', titre: 'À faire maintenant', noeud: (
      maintenant.length === 0 ? (
        <p className="auj-vide">Aucune tâche pour aujourd'hui. <button type="button" className="lien" onClick={allerOffres}>Voir les offres</button></p>
      ) : (
        <div className="carte">
          <h3 className="carte-titre"><ListChecks size={17} aria-hidden="true" />À faire maintenant</h3>
          {groupesMaintenant.map(([cle, liste]) => blocGroupe(cle, liste, true))}
        </div>
      )
    ) },
    { id: 'ensuite', titre: 'Ensuite', noeud: (
      <div className="carte" ref={ensuiteRef}>
        <h3 className="carte-titre"><CalendarClock size={17} aria-hidden="true" />Ensuite{groupes.length > 1 && <ToutReplier cible={ensuiteRef} selecteur="details.auj-groupe" className="titre-outils" />}</h3>
        {ensuite.length === 0 && <p className="muted small">Aucune tâche à venir.</p>}
        {groupes.map(([cle, liste]) => blocGroupe(cle, liste))}
        <form className="auj-ajout" onSubmit={ajouter}>
          <input className="input" value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ajouter une tâche (mettre à jour le CV, appeler...)" aria-label="Nouvelle tâche" />
          <input className="input cell" type="date" value={echeance} onChange={e => setEcheance(e.target.value)} aria-label="Échéance" />
          <button type="submit" className="btn btn-ghost small">Ajouter</button>
        </form>
      </div>
    ) },
    { id: 'entretiens', titre: 'Entretiens en cours', noeud: (
      entretiens.length > 0 && (
        <div className="carte">
          <h3 className="carte-titre"><Users size={17} aria-hidden="true" />Entretiens en cours</h3>
          <ul className="auj-liste">
            {entretiens.map(c => (
              <li key={c.id} className="auj-ligne"><div className="auj-ligne-corps">{identite(c)}</div></li>
            ))}
          </ul>
        </div>
      )
    ) },
    { id: 'relances', titre: 'Relances', noeud: (
      aRelancer.length > 0 && (
        <div className="carte">
          <h3 className="carte-titre"><BellRing size={17} aria-hidden="true" />Sans nouvelles depuis plus de {JOURS_RELANCE} jours</h3>
          <p className="muted small">Aucune relance n'est prévue pour ces candidatures.</p>
          <ul className="auj-liste">
            {relancesVisibles.map(c => (
              <li key={c.id} className="auj-ligne">
                <div className="auj-ligne-corps">
                  {identite(c)}
                  <span className="muted small">Envoyée il y a {joursEntre(c.date, auj)} j</span>
                </div>
                <button type="button" className="btn btn-ghost small" onClick={() => sansReponse(c)}>Sans réponse</button>
                <button type="button" className="btn btn-ghost small" onClick={() => relancer([c])}>Relancer</button>
              </li>
            ))}
          </ul>
          <div className="btn-group">
            {aRelancer.length > 1 && <button type="button" className="btn btn-primary small" onClick={() => relancer(aRelancer)}>Tout relancer aujourd'hui</button>}
            {aRelancer.length > 5 && <button type="button" className="btn btn-ghost small" onClick={() => setTout(v => !v)}>{tout ? 'Réduire' : `Voir les ${aRelancer.length - 5} autres`}</button>}
          </div>
        </div>
      )
    ) },
    { id: 'bilan', titre: 'Bilan du jour', noeud: <CarteBilan bilan={bilan} /> },
    { id: 'journal', titre: 'Journal du jour', noeud: <CarteJournal bilan={bilan} ouvrirCandidature={ouvrirCandidature} /> },
  ];
  const tuiles = useTuiles(defs);

  return (
    <section aria-labelledby="titre-auj" className="aujourdhui">
      <header className="auj-entete">
        <h2 id="titre-auj">Aujourd'hui</h2>
        <p className={'auj-phrase' + (nbATraiter ? ' a-faire' : '')}>{phrase}</p>
      </header>

      <BarreTraitements recharger={recharger} />

      {/* NOTE: colonne de gauche = offres épinglées, marché local (il comble le vide sous les épingles) puis statistiques, l'agenda à droite */}
      <div className="auj-epinglees-agenda">
        <div className="auj-colonne-gauche">
          <OffresEpinglees offres={offres} chargees={offresChargees} ouvrirOffre={ouvrirOffre} setOffres={setOffres} />
          <MarcheLocal />
          <div className="auj-kpi" aria-label="En bref">
            <div className={'bento-card' + (nbATraiter ? ' alerte' : '')}><ListChecks size={18} aria-hidden="true" /><b>{nbATraiter}</b><span>à traiter</span></div>
            <button type="button" className="bento-card bento-btn" onClick={allerCandidatures}><Hourglass size={18} aria-hidden="true" /><b>{enAttente}</b><span>en attente de réponse</span></button>
            <button type="button" className="bento-card bento-btn" onClick={allerCandidatures}><Users size={18} aria-hidden="true" /><b>{entretiens.length}</b><span>{entretiens.length > 1 ? 'entretiens' : 'entretien'}</span></button>
            <button type="button" className="bento-card bento-btn" onClick={allerOffres}><Inbox size={18} aria-hidden="true" /><b>{nouvellesOffres ?? '·'}</b><span>nouvelles offres en 2 jours</span></button>
          </div>
        </div>
        <MiniAgenda allerAgenda={allerAgenda} allerAdmin={allerAdmin} />
      </div>

      <APostuler offres={offres} chargees={offresChargees} candidatures={candidatures} competences={etat.competences} experiences={etat.experiences} projets={etat.projets} ouvrirOffre={ouvrirOffre} allerOffres={allerOffres} />


      {/* NOTE: cartes en masonry (useMasonry), ordre de lecture : à faire, ensuite, rendez-vous, entretiens, relances, profil vu par l'IA, bilan, journal */}
      <hr className="auj-separateur" />
      <div className="auj-reorg">
        <span className="muted small">Glissez la poignée en haut d'une tuile pour la déplacer.</span>
        {tuiles.personnalise && <button type="button" className="lien small" onClick={tuiles.reinitialiser}>Rétablir l'ordre d'origine</button>}
      </div>
      <div className="sr-only" role="status" aria-live="polite">{tuiles.annonce}</div>
      <div className="auj-masonry" ref={grille}>
        {tuiles.triees.map(d => <Tuile key={d.id} def={d} tuiles={tuiles} />)}
      </div>
      <hr className="auj-separateur" />

      <Progression etat={etat} maj={maj} progression={progression} offresNonVues={offresNonVues} aRelancer={aRelancer.length} enRetard={maintenant.filter(t => t.echeance < auj).length} allerProfil={allerProfil} />
    </section>
  );
}
