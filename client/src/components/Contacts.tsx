import RendezVousLies from './RendezVousLies.tsx';
import { Sq } from './Squelettes.tsx';
import { AlertTriangle, ArrowLeft, Bookmark, ExternalLink, Mail, MapPin, Phone, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Contact } from '../../../types';
import { aCompleter, avertissementsContact, COULEURS, cssCouleur, EMAIL, libelleOffre, nomContact, simplifier, telLien, TELEPHONE } from '../contacts.ts';
import { aujourdhui, distinctes, ecranLarge, fmtDate, lienMaps, norm, nouvelId } from '../utils.ts';
import ChampRecherche from './ChampRecherche.tsx';
import Etiquettes from './Etiquettes.tsx';
import FilConversations from './FilConversations.tsx';
import FiltresPastilles from './FiltresPastilles.tsx';
import Suggestions from './Suggestions.tsx';
import ToutReplier from './ToutReplier.tsx';

// ANCHOR: onglet Contacts (ligne 119) : liste filtrable et fiche modifiable sur place, offres liées en étiquettes
export default function Contacts({ etat, maj, offres, selection, setSelection, ouvrirOffre, ouvrirCandidature }) {
  const contacts: Contact[] = etat.contacts;
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState('tous');
  const groupesRef = useRef<HTMLDivElement>(null);

  const recherches = useMemo(() => {
    const t = norm(q).trim();
    // NOTE: un contact épinglé ne remonte pas : seuls le marque-page et le filtre Épinglés le signalent, pour ne pas encombrer la recherche
    return contacts.filter(k => !t || norm(`${k.prenom} ${k.nom} ${k.fonction} ${k.entreprise} ${k.email} ${k.telephone}`).includes(t));
  }, [contacts, q]);
  const nbEpingles = recherches.filter(k => k.epingle).length;
  const avecOffre = recherches.filter(k => k.offres.length + k.candidatures.length > 0).length;
  const nbACompleter = recherches.filter(aCompleter).length;
  const liste = recherches.filter(k => filtre === 'tous' || (filtre === 'epingles' ? k.epingle : filtre === 'completer' ? aCompleter(k) : filtre === 'lies' ? k.offres.length + k.candidatures.length > 0 : k.offres.length + k.candidatures.length === 0));
  const choisi = contacts.find(k => k.id === selection) ?? null;

  // ANCHOR: contacts regroupés par société (blocs repliables) : les sociétés par ordre alphabétique, épinglés compris (marque-page sur la carte), les contacts sans société en dernier
  const groupes = useMemo(() => {
    const m = new Map<string, { cle: string; nom: string; items: Contact[] }>();
    for (const k of liste) {
      const cle = simplifier(k.entreprise);
      if (!m.has(cle)) m.set(cle, { cle, nom: k.entreprise || 'Sans société', items: [] });
      m.get(cle)!.items.push(k);
    }
    return [...m.values()].sort((a, b) => Number(a.cle === '') - Number(b.cle === '') || norm(a.nom).localeCompare(norm(b.nom)));
  }, [liste]);

  useEffect(() => {
    if (!choisi && liste.length && ecranLarge()) setSelection(liste[0].id);
  }, [choisi, liste, setSelection]);

  const nouveau = () => {
    const id = nouvelId();
    maj(e => ({ contacts: [...e.contacts, { id, prenom: '', nom: 'Nouveau contact', fonction: '', entreprise: '', adresse: '', telephone: '', email: '', note: '', cree: aujourdhui(), couleur: '', epingle: false, sans_telephone: false, sans_email: false, offres: [], candidatures: [] }] }));
    setQ('');
    setFiltre('tous');
    setSelection(id);
  };

  return (
    <section aria-labelledby="titre-contacts" className={'split' + (choisi ? ' avec-detail' : '')}>
      <h2 id="titre-contacts" className="sr-only">Contacts</h2>
      <div className="split-liste">
        <div className="sync-bar">
          <ChampRecherche className="search" placeholder="Nom, entreprise, fonction..." value={q} onChange={e => setQ(e.target.value)} />
          {groupes.length > 1 && <ToutReplier cible={groupesRef} selecteur="details.auj-groupe" />}
          <button type="button" className="btn btn-primary small" onClick={nouveau} title="Nouveau contact"><Plus size={15} />Contact</button>
        </div>
        <FiltresPastilles label="Filtrer les contacts" valeur={filtre} onChange={setFiltre} items={[
          { cle: 'tous', libelle: 'Tous', couleur: 'var(--c-grey)', nombre: recherches.length },
          ...(nbEpingles > 0 || filtre === 'epingles' ? [{ cle: 'epingles', libelle: 'Épinglés', couleur: 'var(--c-orange)', nombre: nbEpingles }] : []),
          { cle: 'lies', libelle: 'Liés à une offre', couleur: 'var(--accent)', nombre: avecOffre },
          { cle: 'seuls', libelle: 'Sans offre', couleur: 'var(--c-grey)', nombre: recherches.length - avecOffre },
          ...(nbACompleter > 0 || filtre === 'completer' ? [{ cle: 'completer', libelle: 'À compléter', couleur: 'var(--c-amber)', nombre: nbACompleter }] : []),
        ]} />
        {liste.length === 0 ? (
          <p className="empty">{contacts.length ? 'Aucun contact ne correspond à ce filtre ou à cette recherche.' : 'Aucun contact pour le moment. Ajoutez les recruteurs et interlocuteurs rencontrés, puis reliez-les aux offres.'}</p>
        ) : (
          <div className="contacts-groupes" ref={groupesRef}>
            {groupes.map(g => (
              <details key={g.cle} className="auj-groupe" open>
                <summary>
                  <span className="auj-groupe-nom"><b>{g.nom}</b></span>
                  <span className="tag">{g.items.length}</span>
                  <span className="chev" aria-hidden="true" />
                </summary>
                <ul className="rows">
                  {g.items.map(k => (
                    <li key={k.id}>
                      <button type="button" className={'row' + (k.id === selection ? ' on' : '')} onClick={() => setSelection(k.id)} aria-current={k.id === selection}>
                        <span className="row-title">{k.couleur && <i className="pastille-contact" style={{ background: cssCouleur(k.couleur) }} aria-hidden="true" />}{nomContact(k)}{aCompleter(k) && <AlertTriangle size={13} className="alerte-contact" role="img" aria-label={'À compléter : ' + avertissementsContact(k).filter(x => x.niveau === 'avertissement').map(x => x.message).join(' ')} />}</span>
                        {/* NOTE: marque-page en haut à droite de la carte, plein quand le contact est épinglé */}
                        {k.epingle && <Bookmark size={18} fill="currentColor" className="epingle-marque epingle-carte" role="img" aria-label="Épinglé" />}
                        <span className="row-sub">{k.fonction || 'Fonction à préciser'}</span>
                        {k.offres.length + k.candidatures.length > 0 && (
                          <span className="row-badges">
                            {k.offres.length > 0 && <span className="tag">{k.offres.length} offre{k.offres.length > 1 ? 's' : ''}</span>}
                            {k.candidatures.length > 0 && <span className="tag">{k.candidatures.length} candidature{k.candidatures.length > 1 ? 's' : ''}</span>}
                          </span>
                        )}
                        <span className="row-date">{fmtDate(k.cree)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </div>
      <div className="split-detail">
        {choisi
          ? <ContactFiche key={choisi.id} k={choisi} etat={etat} maj={maj} offres={offres} ouvrirOffre={ouvrirOffre} ouvrirCandidature={ouvrirCandidature} fermer={() => setSelection(null)} />
          : <p className="empty">Choisir un contact pour voir ses coordonnées et les offres liées.</p>}
      </div>
    </section>
  );
}

function ContactFiche({ k, etat, maj, offres, ouvrirOffre, ouvrirCandidature, fermer }) {
  const [texteOffre, setTexteOffre] = useState('');
  const [texteCand, setTexteCand] = useState('');
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const alertes = avertissementsContact(k);
  const majK = (champs: Partial<Contact>) => maj(e => ({ contacts: e.contacts.map(x => (x.id === k.id ? { ...x, ...champs } : x)) }));
  const entreprises = useMemo(() => distinctes([...(offres ?? []), ...etat.candidatures, ...etat.contacts], 'entreprise').filter(x => x.length < 80), [offres, etat.candidatures, etat.contacts]);
  const parId = useMemo(() => new Map<string, any>((offres ?? []).map(o => [o.id_offre, o])), [offres]);
  // NOTE: historique du contact = échanges des candidatures liées directement ou par une offre, du plus récent au plus ancien
  const echangesLies = useMemo(() => {
    const cands = new Set(etat.candidatures.filter(d => k.candidatures.includes(d.id) || (d.offre_id && k.offres.includes(d.offre_id))).map(d => d.id));
    return etat.echanges.filter(x => cands.has(x.candidature_id)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.heure || '').localeCompare(a.heure || '') || b.id.localeCompare(a.id));
  }, [etat.candidatures, etat.echanges, k.candidatures, k.offres]);
  // NOTE: candidatures liées directement (v13), utiles pour une offre hors France Travail ou sans fiche d'offre
  const libelleCand = (d: any) => `${d.entreprise || 'Employeur non indiqué'} · ${d.poste || 'Poste non indiqué'}`;
  const candParLibelle = useMemo(() => new Map<string, string>(etat.candidatures.filter(d => !k.candidatures.includes(d.id)).map(d => [libelleCand(d), d.id])), [etat.candidatures, k.candidatures]);
  const parLibelle = useMemo(() => new Map<string, string>((offres ?? []).filter(o => !k.offres.includes(o.id_offre)).map(o => [libelleOffre(o), o.id_offre])), [offres, k.offres]);

  // NOTE: champ enregistré à la sortie, après contrôle ; prénom et nom ne peuvent pas être vides tous les deux (refus du serveur)
  const champ = (cle: keyof Contact, controle?: (v: string) => string) => ({
    defaultValue: k[cle] as string,
    onBlur: e => {
      const v = e.target.value.trim();
      const err = controle?.(v) ?? '';
      setErreurs(x => ({ ...x, [cle]: err }));
      if (err || v === k[cle]) return;
      majK({ [cle]: v });
    },
  });
  const nomRequis = (autre: 'prenom' | 'nom') => (v: string) => (!v && !k[autre] ? 'Un prénom ou un nom est nécessaire.' : '');

  const supprimer = () => {
    if (!confirm(`Supprimer le contact « ${nomContact(k)} » ? Les offres liées sont conservées.`)) return;
    maj(e => ({ contacts: e.contacts.filter(x => x.id !== k.id) }));
    fermer();
  };

  return (
    <article className="fiche">
      <div className="fiche-outils">
        <button type="button" className="btn btn-ghost small retour" onClick={fermer}><ArrowLeft size={15} />Liste</button>
        <button type="button" className="btn btn-ghost small" aria-pressed={k.epingle} onClick={() => majK({ epingle: !k.epingle })} title={k.epingle ? 'Retirer des contacts épinglés' : 'Épingler en tête de la liste'}>
          <Bookmark size={15} fill={k.epingle ? 'currentColor' : 'none'} />{k.epingle ? 'Désépingler' : 'Épingler'}
        </button>
      </div>
      <div className="grid-2">
        <label className="field">Prénom<input className="input" {...champ('prenom', nomRequis('nom'))} /></label>
        <label className="field">Nom<input className="input" {...champ('nom', nomRequis('prenom'))} /></label>
        <label className="field">Fonction<input className="input" {...champ('fonction')} placeholder="Chargée de recrutement, DAF..." /></label>
        <label className="field">Entreprise<Suggestions value={k.entreprise} onChange={e => majK({ entreprise: e.target.value })} options={entreprises} /></label>
        <div className="field">
          <span>Téléphone</span>
          <span className="champ-action">
            <input className="input" type="tel" aria-label="Téléphone" disabled={k.sans_telephone} {...champ('telephone', v => (v && !TELEPHONE.test(v) ? 'Chiffres, espaces, points ou tirets, + en tête.' : ''))} />
            {k.telephone && <a className="btn btn-ghost icon" href={telLien(k.telephone)} title="Appeler" aria-label="Appeler"><Phone size={15} /></a>}
          </span>
          {(k.sans_telephone || !k.telephone) && <label className="switch small"><input type="checkbox" checked={k.sans_telephone} onChange={e => majK({ sans_telephone: e.target.checked })} /> Pas de téléphone possible (ex. France Travail)</label>}
        </div>
        <div className="field">
          <span>Email</span>
          <span className="champ-action">
            <input className="input" type="email" aria-label="Email" disabled={k.sans_email} {...champ('email', v => (v && !EMAIL.test(v) ? 'Adresse email invalide.' : ''))} />
            {k.email && <a className="btn btn-ghost icon" href={'mailto:' + k.email} title="Écrire" aria-label="Écrire"><Mail size={15} /></a>}
          </span>
          {(k.sans_email || !k.email) && <label className="switch small"><input type="checkbox" checked={k.sans_email} onChange={e => majK({ sans_email: e.target.checked })} /> Pas d'email possible (ex. France Travail)</label>}
        </div>
        <details className="field couleur-details">
          <summary>
            <span>Couleur</span>
            <span className="couleur-actuelle">{k.couleur ? <i className="pastille-contact" style={{ background: cssCouleur(k.couleur) }} aria-hidden="true" /> : null}{COULEURS.find(c => c.valeur === k.couleur)?.libelle ?? 'Aucune'}</span>
            <span className="chev" aria-hidden="true" />
          </summary>
          <span className="couleurs" role="radiogroup" aria-label="Couleur du contact, reprise sur ses rendez-vous">
            <button type="button" role="radio" aria-checked={!k.couleur} className={'couleur aucune' + (!k.couleur ? ' on' : '')} onClick={() => majK({ couleur: '' })} title="Aucune couleur" aria-label="Aucune couleur" />
            {COULEURS.map(c => (
              <button key={c.valeur} type="button" role="radio" aria-checked={k.couleur === c.valeur} className={'couleur' + (k.couleur === c.valeur ? ' on' : '')} style={{ background: cssCouleur(c.valeur) }} onClick={() => majK({ couleur: c.valeur })} title={c.libelle} aria-label={c.libelle} />
            ))}
          </span>
        </details>
      </div>
      {alertes.length > 0 && (
        <div className="alertes-contact" role="status">
          {alertes.some(x => x.niveau === 'avertissement') && <p className="warn small"><AlertTriangle size={14} aria-hidden="true" /> Fiche à compléter</p>}
          <ul className="small">{alertes.map(x => <li key={x.message} className={x.niveau === 'info' ? 'muted' : 'warn'}>{x.message}</li>)}</ul>
        </div>
      )}
      {Object.values(erreurs).filter(Boolean).map(m => <p key={m} className="warn small" role="alert">{m}</p>)}
      <label className="field"><span><MapPin size={13} /> Adresse</span>
        <span className="champ-action">
          <input className="input" {...champ('adresse')} placeholder="Adresse du lieu de rendez-vous ou de l'entreprise" />
          {k.adresse && <a className="btn btn-ghost icon" href={lienMaps(k.adresse)} target="_blank" rel="noopener noreferrer" title="Voir sur Google Maps" aria-label="Voir sur Google Maps"><ExternalLink size={15} /></a>}
        </span>
      </label>

      <div className="field">
        <span>Offres liées</span>
        {offres === null ? <Sq h={36} /> : (
          <Etiquettes
            items={k.offres.map(id => {
              const o = parId.get(id);
              return { cle: id, libelle: o ? libelleOffre(o) : id, contenu: <button type="button" className="btn-lien" onClick={() => ouvrirOffre(id)} title="Ouvrir dans Offres">{o ? libelleOffre(o) : id}</button> };
            })}
            retirer={id => majK({ offres: k.offres.filter(o => o !== id) })}
            texte={texteOffre}
            setTexte={setTexteOffre}
            ajouter={v => {
              const id = parLibelle.get(v);
              if (!id) return;
              // NOTE: entreprise vide reprise de l'offre reliée
              const employeur = parId.get(id)?.entreprise;
              majK({ offres: [...k.offres, id], ...(!k.entreprise && employeur ? { entreprise: employeur } : {}) });
              setTexteOffre('');
            }}
            options={[...parLibelle.keys()]}
            placeholder="Relier à une offre (employeur, intitulé ou numéro)"
            label="Relier à une offre"
          />
        )}
      </div>

      <div className="field">
        <span>Candidatures liées</span>
        <Etiquettes
          items={k.candidatures.map(id => {
            const d = etat.candidatures.find(x => x.id === id);
            return { cle: id, libelle: d ? libelleCand(d) : id, contenu: <button type="button" className="btn-lien" onClick={() => ouvrirCandidature(id)} title="Ouvrir dans Candidatures">{d ? libelleCand(d) : id}</button> };
          })}
          retirer={id => majK({ candidatures: k.candidatures.filter(c => c !== id) })}
          texte={texteCand}
          setTexte={setTexteCand}
          ajouter={v => {
            const id = candParLibelle.get(v);
            if (!id) return;
            const d = etat.candidatures.find(x => x.id === id);
            majK({ candidatures: [...k.candidatures, id], ...(!k.entreprise && d?.entreprise ? { entreprise: d.entreprise } : {}) });
            setTexteCand('');
          }}
          options={[...candParLibelle.keys()]}
          placeholder="Relier à une candidature (employeur ou poste)"
          label="Relier à une candidature"
        />
      </div>

      <div className="field"><span>Rendez-vous</span><RendezVousLies contactId={k.id} /></div>
      <div className="field">
        <span>Historique des échanges</span>
        {echangesLies.length === 0 ? <p className="muted small">Aucun échange dans les candidatures liées.</p> : (
          <FilConversations
            echanges={echangesLies} maj={maj} libelle="Conversations des candidatures liées"
            origine={x => {
              const d = etat.candidatures.find(y => y.id === x.candidature_id);
              return d ? <button type="button" className="btn-lien" onClick={() => ouvrirCandidature(d.id)} title="Ouvrir la candidature">{d.entreprise}</button> : null;
            }}
          />
        )}
        {k.candidatures.length + k.offres.length > 0 && <p className="muted small">Échanges des candidatures liées à ce contact (saisis dans leur fiche, rien à recopier ici).</p>}
      </div>

      <label className="field">Notes<textarea className="input" rows={4} {...champ('note')} placeholder="Contexte de la rencontre, disponibilités, points à retenir" /></label>

      <div className="row-end"><button type="button" className="btn btn-danger" onClick={supprimer}><Trash2 size={15} />Supprimer le contact</button></div>
    </article>
  );
}
