import { AlertTriangle, Lightbulb, ArrowDownLeft, ArrowLeft, ArrowUpRight, CalendarClock, Briefcase, CheckCircle2, Download, Ellipsis, FileText, ExternalLink, Globe, History, Contact, Link2, ListChecks, Mail, MessageCircle, MessageSquare, Phone, Plus, Send, Settings2, StickyNote, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { lienPdfVersion, lienVersionLettre, vueCandidature } from '../api.ts';
import { CANAUX, CATEGORIES, INTERETS, JOURS_RELANCE, MODES_ENVOI, PLATEFORMES, RAISONS, SENT, STATUTS } from '../constants.ts';
import { ajouterJours, aujourdhui, detailOffre, distinctes, fmtDate, joursEntre, maintenant, nouvelId, lienSur } from '../utils.ts';
import BlocRepliable from './BlocRepliable.tsx';
import FilConversations, { heureLisible, ICONES_CANAL, SENS, SENS_COURT } from './FilConversations.tsx';
import CompetencesOffre from './CompetencesOffre.tsx';
import ContactsLies from './ContactsLies.tsx';
import RendezVousLies from './RendezVousLies.tsx';
import Markdown from './Markdown.tsx';
import Select from './Select.tsx';
import BoiteLiee from './BoiteLiee.tsx';
import NoteInteret from './NoteInteret.tsx';
import NumeroOffre from './NumeroOffre.tsx';
import { repliCandidature } from '../format.ts';
import Suggestions from './Suggestions.tsx';
import OffreLiee from './OffreLiee.tsx';
import TrajetsCandidature from './TrajetsCandidature.tsx';
import ToutReplier from './ToutReplier.tsx';
import EcartSalaire from './EcartSalaire.tsx';

const AVEC_RAISON = ['refuse', 'sans_reponse', 'ecarte'];

// ANCHOR: prochaine étape proposée à la saisie d'un contact (jours avant relance, 0 = rien de prévu), pour ne pas oublier de relancer
const RELANCES: [number, string][] = [[0, 'Rien de prévu'], [3, 'Dans 3 jours'], [7, 'Dans 7 jours'], [14, 'Dans 14 jours']];


// Fiche d'une candidature, modifiable sur place : chaque changement part par l'enregistrement automatique
export default function CandidatureFiche({ c, etat, maj, offres, offreTrouvee, ouvrirOffre, ouvrirCv, ouvrirLettre, ouvrirContact, fermer }) {
  const [apercu, setApercu] = useState(Boolean(c.notes));
  const blocs = useRef<HTMLDivElement>(null);
  const majC = champs => maj(e => ({ candidatures: e.candidatures.map(x => (x.id === c.id ? { ...x, ...champs } : x)) }));
  // NOTE: consultation journalisée si la fiche reste ouverte 3 s (le parcours rapide avec j/k ne compte pas, une candidature neuve a eu le temps d'être enregistrée)
  useEffect(() => {
    const t = setTimeout(() => vueCandidature(c.id).catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, [c.id]);
  const set = k => e => majC({ [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const taches = etat.taches.filter(t => t.candidature_id === c.id).sort((a, b) => a.faite - b.faite || (a.echeance || '9999').localeCompare(b.echeance || '9999'));
  const echanges = etat.echanges.filter(x => x.candidature_id === c.id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.heure || '').localeCompare(a.heure || '') || b.id.localeCompare(a.id));
  const cvs = useMemo(() => distinctes(etat.candidatures, 'cv'), [etat.candidatures]);
  // NOTE: version de CV à télécharger : lien fiable par candidature_id, repli sur le nom saisi dans le champ ; cvVersions arrive du plus récent au plus ancien
  // NOTE: dernière lettre exportée pour cette candidature (ou pour son offre avant la création de la candidature), lettreVersions arrive du plus récent au plus ancien
  const versionLettre = useMemo(() => etat.lettreVersions?.find(v => v.candidature_id === c.id) ?? (c.offre_id ? etat.lettreVersions?.find(v => v.offre_id === c.offre_id) : undefined), [etat.lettreVersions, c.id, c.offre_id]);
  const versionCv = useMemo(() => etat.cvVersions?.find(v => v.candidature_id === c.id) ?? (c.cv ? etat.cvVersions?.find(v => v.nom === c.cv) : undefined), [etat.cvVersions, c.id, c.cv]);
  const plateformes = useMemo(() => distinctes(etat.candidatures, 'plateforme', PLATEFORMES).filter(p => p.length < 40), [etat.candidatures]);
  const prises = useMemo(() => new Map(etat.candidatures.filter(d => d.offre_id && d.id !== c.id).map(d => [d.offre_id, d.entreprise])), [etat.candidatures, c.id]);
  // NOTE: sans lien explicite, l'offre peut être retrouvée par son numéro écrit dans la candidature
  const offre = (c.offre_id && offres?.find(o => o.id_offre === c.offre_id)) || offreTrouvee;
  const nbContacts = etat.contacts.filter(k => k.candidatures.includes(c.id) || (c.offre_id && k.offres.includes(c.offre_id))).length;

  // NOTE: entreprise et poste ne peuvent pas être vides (refus du serveur) : valeur rétablie si le champ est vidé
  const texteObligatoire = k => ({
    defaultValue: c[k],
    onBlur: e => {
      const v = e.target.value.trim();
      if (!v) e.target.value = c[k];
      else if (v !== c[k]) majC({ [k]: v });
    },
  });

  const supprimer = () => {
    if (!confirm(`Supprimer la candidature « ${c.entreprise} » avec ses tâches et échanges ?`)) return;
    maj(e => ({
      candidatures: e.candidatures.filter(x => x.id !== c.id),
      taches: e.taches.filter(x => x.candidature_id !== c.id),
      echanges: e.echanges.filter(x => x.candidature_id !== c.id),
    }));
    fermer();
  };

  const idOffre = c.offre_id || offre?.id_offre;
  // NOTE: sans numéro, le badge du titre affiche déjà la plateforme : pas répétée dans le résumé
  const plateformeDansBadge = !idOffre || idOffre.startsWith('man-');
  const resumeEnvoi = [c.date && fmtDate(c.date), !plateformeDansBadge && c.plateforme, c.mode_envoi && MODES_ENVOI[c.mode_envoi], c.interet && `intérêt ${INTERETS[c.interet].toLowerCase()}`].filter(Boolean).join(' · ');

  return (
    <article className="fiche">
      <button type="button" className="btn btn-ghost small retour" onClick={fermer}><ArrowLeft size={15} />Liste</button>
      <div className="fiche-titre-id">
        <NumeroOffre offre={{ id_offre: idOffre }} repli={repliCandidature(c)} />
        <input className="input fiche-titre input-nu" aria-label="Entreprise" {...texteObligatoire('entreprise')} />
      </div>
      <input className="input card-sub input-nu" aria-label="Poste" {...texteObligatoire('poste')} />

      <div className="chips chips-compact" role="radiogroup" aria-label="Statut">
        {Object.entries(STATUTS).map(([k, s]) => (
          <button key={k} type="button" role="radio" aria-checked={c.statut === k} className={'chip' + (c.statut === k ? ' on' : '')} style={{ '--c': s.color }} onClick={() => majC({ statut: k })}>
            <span className="dot" />{s.label}
          </button>
        ))}
      </div>
      {SENT.includes(c.statut) && !c.plateforme && <p className="warn small">Plateforme d'envoi à renseigner.</p>}

      <div className="fiche-blocs-outils"><ToutReplier cible={blocs} selecteur=":scope > details.bloc-rep" /></div>
      <div className="fiche-blocs" ref={blocs}>
        <Taches c={c} taches={taches} maj={maj} />
        <Historique c={c} echanges={echanges} maj={maj} majC={majC} />

        <BlocRepliable id="envoi" titre="Informations d'envoi" Icone={Send} resume={resumeEnvoi}>
          <div className="grid-3 grille-envoi">
            <label className="field">Date d'envoi<input className="input" type="date" value={c.date || ''} onChange={set('date')} /></label>
            <label className="field">Plateforme<Suggestions value={c.plateforme || ''} onChange={set('plateforme')} options={plateformes} /></label>
            <label className="field">Envoyée par
              <Select value={c.mode_envoi || ''} onChange={set('mode_envoi')} options={[['', 'Non renseigné'], ...Object.entries(MODES_ENVOI)]} />
            </label>
            <div className="champ-cv">
              <label className="field">Version du CV<Suggestions value={c.cv || ''} onChange={set('cv')} options={cvs} /></label>
              <div className="champ-liens">
                <button type="button" className="lien" onClick={() => ouvrirCv({ candidature_id: c.id, offre_id: offre?.id_offre })} title="Composer un CV ciblé pour cette candidature (Profil > CV)"><FileText size={13} /> CV sur mesure</button>
                {versionCv && <a className="lien" href={lienPdfVersion(versionCv.id)} download={versionCv.nom + '.pdf'} title={`Télécharger ${versionCv.nom}`}><Download size={13} /> Télécharger</a>}
              </div>
            </div>
            <div className="field"><span>Intérêt</span>
              <NoteInteret value={c.interet || ''} onChange={v => majC({ interet: v })} />
            </div>
            {/* NOTE: libellé invisible pour caler la case sur la ligne des champs voisins (grille alignée en haut) */}
            <div className="champ-cv">
              <div className="field">
                <span aria-hidden="true" style={{ visibility: 'hidden' }}>Lettre</span>
                <label className="switch switch-champ"><input type="checkbox" checked={Boolean(c.lettre)} onChange={set('lettre')} /> Lettre jointe</label>
              </div>
              <div className="champ-liens">
                <button type="button" className="lien" onClick={() => ouvrirLettre({ candidature_id: c.id, offre_id: offre?.id_offre })} title="Ouvrir la lettre de motivation de cette candidature (CV et lettre)"><FileText size={13} /> Lettre sur mesure</button>
                {versionLettre && <a className="lien" href={lienVersionLettre(versionLettre.id, 'pdf')} download={versionLettre.nom + '.pdf'} title={`Télécharger ${versionLettre.nom}`}><Download size={13} /> Télécharger</a>}
              </div>
            </div>
          </div>
          <div className="champ-cv">
            <label className="field">Lien de candidature<input className="input" type="url" inputMode="url" placeholder="https://" value={c.lien || ''} onChange={set('lien')} /></label>
            {lienSur(c.lien) && <a className="lien" href={lienSur(c.lien)} target="_blank" rel="noopener noreferrer" title="Ouvrir la page où la candidature a été envoyée"><ExternalLink size={13} /> Ouvrir</a>}
          </div>
          {AVEC_RAISON.includes(c.statut) && (
            <label className="field">Raison
              <Select value={c.raison || ''} onChange={set('raison')} options={[['', 'Non renseignée'], ...RAISONS.map(r => [r, r])]} />
            </label>
          )}
        </BlocRepliable>

        {offre && (
          <BlocRepliable id="offre" titre={c.offre_id ? 'Offre liée' : 'Offre retrouvée'} Icone={Link2} resume={offre.titre}>
            <BoiteLiee genre={c.offre_id ? 'Offre liée' : 'Offre retrouvée par le numéro, non liée'} couleur={(CATEGORIES[offre.categorie as keyof typeof CATEGORIES] ?? CATEGORIES.autre).color} titre={offre.titre} sous={offre.entreprise || 'Employeur non indiqué'} infos={detailOffre(offre).split(' · ').slice(1)}>
              <EcartSalaire salaire={offre.salaire} />
              {lienSur(offre.lien) && <a className="btn btn-ghost small" href={lienSur(offre.lien)} target="_blank" rel="noopener noreferrer">Voir l'annonce<ExternalLink size={13} /></a>}
              <button type="button" className="btn btn-ghost small" onClick={() => ouvrirOffre(offre.id_offre)}>Ouvrir dans Offres</button>
            </BoiteLiee>
          </BlocRepliable>
        )}

        {/* NOTE: relevées dans l'annonce à l'ouverture de l'offre, gardées ici après sa purge ; rien n'est affiché sans extraction */}
        {c.offre_id && <CompetencesOffre candidatureId={c.id} />}

        {/* NOTE: un contact se relie à la candidature elle-même (v13), l'offre liée éventuelle ajoute ses propres contacts */}
        {(
          <BlocRepliable id="contacts" titre="Contacts" Icone={Contact} defaut={nbContacts > 0} resume={nbContacts ? `${nbContacts} contact${nbContacts > 1 ? 's' : ''}` : 'Aucun contact'}>
            <ContactsLies contacts={etat.contacts} offreId={c.offre_id} candidatureId={c.id} entreprise={c.entreprise} maj={maj} ouvrirContact={ouvrirContact} />
          </BlocRepliable>
        )}

        <BlocRepliable id="rdv" titre="Rendez-vous" Icone={CalendarClock} defaut={false} resume="Entretiens et appels">
          <RendezVousLies candidatureId={c.id} offreId={c.offre_id} />
        </BlocRepliable>

        <TrajetsCandidature c={c} majC={majC} offre={offre} />

        {(AVEC_RAISON.includes(c.statut) || c.enseignements) && (
          <BlocRepliable id="enseignements" titre="Enseignements" Icone={Lightbulb} defaut={Boolean(c.enseignements)} resume={c.enseignements ? '' : 'À noter'}>
            <textarea className="input" rows={6} value={c.enseignements || ''} onChange={set('enseignements')} aria-label="Enseignements" placeholder="Ce que cette réponse apprend : motif probable, version de CV utilisée, ce qu'on change pour la suite." />
          </BlocRepliable>
        )}

        <BlocRepliable id="notes" titre="Notes" Icone={StickyNote} defaut={Boolean(c.notes)} resume={c.notes ? '' : 'Aucune note'}>
          <div className="field-line">
            <span className="muted small">Markdown accepté</span>
            <button type="button" className="btn btn-ghost small" onClick={() => setApercu(a => !a)}>{apercu ? 'Modifier' : 'Aperçu'}</button>
          </div>
          {apercu
            ? <div className="md" onDoubleClick={() => setApercu(false)}>{c.notes ? <Markdown>{c.notes}</Markdown> : <p className="muted">Aucune note.</p>}</div>
            : <textarea className="input" rows={6} value={c.notes || ''} onChange={set('notes')} aria-label="Notes" placeholder="Contexte, liens, points de vigilance. Markdown accepté." />}
        </BlocRepliable>

        <BlocRepliable id="avance" titre="Avancé" Icone={Settings2} resume="Description, offre liée, suppression">
          <label className="field">Description courte<input className="input" value={c.description || ''} onChange={set('description')} /></label>
          <OffreLiee valeur={c.offre_id} onChange={v => majC({ offre_id: v })} offres={offres} prises={prises} entreprise={c.entreprise} poste={c.poste} />
          <div className="row-end"><button type="button" className="btn btn-danger" onClick={supprimer}><Trash2 size={15} />Supprimer la candidature</button></div>
        </BlocRepliable>
      </div>
    </article>
  );
}

function Taches({ c, taches, maj }) {
  const [titre, setTitre] = useState('');
  const [echeance, setEcheance] = useState('');
  const majT = (id, champs) => maj(e => ({ taches: e.taches.map(t => (t.id === id ? { ...t, ...champs } : t)) }));
  const ajouter = (t, d) => maj(e => ({ taches: [...e.taches, { id: nouvelId(), candidature_id: c.id, titre: t, echeance: d, faite: false, creee: aujourdhui() }] }));
  const auj = aujourdhui();
  const faites = taches.filter(t => t.faite).length;
  const nbRetard = taches.filter(t => !t.faite && t.echeance && t.echeance < auj).length;
  const prochaine = taches.find(t => !t.faite);

  const pastille = (
    <>
      {/* NOTE: un seul indicateur par information, pas de pastille de couleur en double : tout fait remplace le compteur */}
      {taches.length > 0 && prochaine && <span className="count">{faites} sur {taches.length} faite{faites > 1 ? 's' : ''}</span>}
      {nbRetard > 0 && <span className="tag retard tag-icone"><AlertTriangle size={12} />{nbRetard} en retard</span>}
      {taches.length > 0 && !prochaine && <span className="tag ok tag-icone"><CheckCircle2 size={12} />Tout est fait</span>}
    </>
  );
  const resume = !nbRetard && prochaine ? `Prochaine : ${prochaine.titre}${prochaine.echeance ? ` · ${fmtDate(prochaine.echeance)}` : ''}` : '';

  return (
    <BlocRepliable id="taches" titre="Tâches" Icone={ListChecks} pastille={pastille} resume={resume} defaut prioritaire>
      {taches.length === 0 && <p className="muted small">Aucune tâche : ajoutez la prochaine étape (relance, préparation d'entretien, document à envoyer).</p>}
      {taches.length > 0 && (
        <ul className="taches">
          {taches.map(t => (
            <li key={t.id} className={t.faite ? 'faite' : t.echeance && t.echeance < auj ? 'retard' : ''}>
              <input type="checkbox" checked={t.faite} onChange={e => majT(t.id, { faite: e.target.checked })} aria-label={`Fait : ${t.titre}`} />
              <input className="input input-nu" defaultValue={t.titre} onBlur={e => { const v = e.target.value.trim(); if (!v) e.target.value = t.titre; else if (v !== t.titre) majT(t.id, { titre: v }); }} aria-label="Titre de la tâche" />
              <input className="input cell" type="date" value={t.echeance} onChange={e => majT(t.id, { echeance: e.target.value })} aria-label="Échéance" />
              <button type="button" className="btn btn-ghost small icon" onClick={() => maj(e => ({ taches: e.taches.filter(x => x.id !== t.id) }))} aria-label={`Supprimer ${t.titre}`} title="Supprimer cette tâche"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <form className="ajout-ligne" onSubmit={e => { e.preventDefault(); if (titre.trim()) { ajouter(titre.trim(), echeance); setTitre(''); setEcheance(''); } }}>
        <input className="input" value={titre} onChange={e => setTitre(e.target.value)} placeholder="Nouvelle tâche" aria-label="Nouvelle tâche" />
        <input className="input cell" type="date" value={echeance} onChange={e => setEcheance(e.target.value)} aria-label="Échéance de la nouvelle tâche" />
        <button type="submit" className="btn btn-ghost small">Ajouter</button>
        {!taches.some(t => !t.faite && /relan/i.test(t.titre)) && (
          <button type="button" className="btn btn-ghost small" onClick={() => ajouter('Relancer', ajouterJours(auj, JOURS_RELANCE))}>Relance dans {JOURS_RELANCE} j</button>
        )}
      </form>
    </BlocRepliable>
  );
}

// ANCHOR: statut proposé après l'ajout d'un contact, seulement quand le contact le justifie
function statutsSuggeres(canal, sens, statut) {
  if (canal === 'entretien' && statut !== 'entretien') return ['entretien'];
  if (sens === 'recu' && statut === 'sans_reponse') return ['en_cours'];
  return [];
}

// Historique des contacts avec l'entreprise (mêmes données que les anciens « échanges » : canal, sens, date, heure, résumé)
function Historique({ c, echanges, maj, majC }) {
  const vide = () => ({ canal: 'email', sens: 'recu', date: aujourdhui(), heure: maintenant(), resume: '', relance: 0 });
  const [ouvert, setOuvert] = useState(false);
  const [f, setF] = useState(vide);
  const [suggestion, setSuggestion] = useState<any>(null);
  const set = k => e => setF(v => ({ ...v, [k]: e.target.value }));

  const ajouter = e => {
    e.preventDefault();
    const { relance, ...contact } = f;
    maj(etat => ({
      echanges: [...etat.echanges, { id: nouvelId(), candidature_id: c.id, ...contact, heure: f.heure || maintenant(), resume: f.resume.trim() }],
      taches: relance ? [...etat.taches, { id: nouvelId(), candidature_id: c.id, titre: `Relancer (${(CANAUX[f.canal] || 'contact').toLowerCase()})`, echeance: ajouterJours(aujourdhui(), relance), faite: false, creee: aujourdhui() }] : etat.taches,
    }));
    const s = statutsSuggeres(f.canal, f.sens, c.statut);
    setSuggestion(s.length ? s : null);
    setOuvert(false);
    setF(vide());
  };

  const dernier = echanges[0];
  const resume = dernier ? `Dernière conversation : ${CANAUX[dernier.canal] || 'Échange'} · ${fmtDate(dernier.date)}${heureLisible(dernier.heure)}` : 'Aucune conversation notée';

  return (
    <BlocRepliable id="historique" titre="Historique" Icone={History} resume={resume} defaut>
      <p className="muted small">Notez chaque échange avec l'entreprise : ce qu'ils vous disent à gauche, ce que vous leur dites à droite.</p>

      <FilConversations echanges={echanges} maj={maj} />

      {suggestion && (
        <div className="suggestion-statut" role="status">
          <span>Mettre à jour le statut de la candidature ?</span>
          {suggestion.map(k => (
            <button key={k} type="button" className="chip on" style={{ '--c': STATUTS[k].color }} onClick={() => { majC({ statut: k }); setSuggestion(null); }}><span className="dot" />Passer en : {STATUTS[k].label}</button>
          ))}
          <button type="button" className="btn btn-ghost small" onClick={() => setSuggestion(null)}>Non merci</button>
        </div>
      )}

      {!ouvert && <div><button type="button" className="btn btn-primary small" onClick={() => setOuvert(true)}><Plus size={15} />Ajouter une conversation</button></div>}

      {ouvert && (
        <form className="contact-form" onSubmit={ajouter}>
          <fieldset>
            <legend>1. Quoi</legend>
            <div className="chips chips-compact" role="radiogroup" aria-label="Type de conversation">
              {Object.entries(CANAUX).map(([k, l]) => {
                const Ico = ICONES_CANAL[k] || Ellipsis;
                return <button key={k} type="button" role="radio" aria-checked={f.canal === k} className={'chip' + (f.canal === k ? ' on' : '')} onClick={() => setF(v => ({ ...v, canal: k }))}><Ico size={14} />{l}</button>;
              })}
            </div>
            <div className="btn-group" role="radiogroup" aria-label="Qui a contacté qui">
              {Object.entries(SENS).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={f.sens === k} className={'btn btn-ghost small' + (f.sens === k ? ' on' : '')} onClick={() => setF(v => ({ ...v, sens: k, relance: k === 'envoye' ? 7 : 0 }))}>{(() => { const Ico = SENS_COURT[k][1]; return <Ico size={14} />; })()}{l}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>2. Quand</legend>
            <div className="ajout-ligne">
              <input className="input cell" type="date" value={f.date} onChange={set('date')} aria-label="Date de la conversation" />
              <input className="input cell" type="time" value={f.heure} onChange={set('heure')} aria-label="Heure approximative de la conversation" />
            </div>
          </fieldset>
          <fieldset>
            <legend>3. Résumé</legend>
            <textarea className="input" rows={3} value={f.resume} onChange={set('resume')} placeholder="Ce qui a été dit ou décidé : entretien proposé jeudi, documents demandés..." aria-label="Résumé de la conversation" />
          </fieldset>
          <fieldset>
            <legend>4. Et ensuite ?</legend>
            <div className="chips chips-compact" role="radiogroup" aria-label="Relance à prévoir">
              {RELANCES.map(([j, l]) => (
                <button key={j} type="button" role="radio" aria-checked={f.relance === j} className={'chip' + (f.relance === j ? ' on' : '')} onClick={() => setF(v => ({ ...v, relance: j }))}>{j > 0 && <CalendarClock size={14} />}{l}</button>
              ))}
            </div>
            {f.relance > 0 && <p className="muted small">Une tâche de relance sera ajoutée pour le {fmtDate(ajouterJours(aujourdhui(), f.relance))}.</p>}
          </fieldset>
          <div className="row-end">
            <button type="button" className="btn btn-ghost small" onClick={() => { setOuvert(false); setF(vide()); }}>Annuler</button>
            <button type="submit" className="btn btn-primary small">Enregistrer la conversation</button>
          </div>
        </form>
      )}

    </BlocRepliable>
  );
}
