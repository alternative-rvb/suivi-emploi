import { Mail, Phone, Plus, UserRound, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Contact } from '../../../types';
import { libelleContact, memeEntreprise, nomContact, telLien } from '../contacts.ts';
import { aujourdhui, nouvelId } from '../utils.ts';
import Suggestions from './Suggestions.tsx';

// ANCHOR: contacts liés à une offre (ligne 119) ou à une candidature (ligne 124), affichés dans le détail d'une offre et dans la fiche candidature ;
// lier un contact existant (ceux du même employeur proposés en tête) ou en créer un, prérempli avec l'employeur
// NOTE: dans une fiche candidature (candidatureId fourni), le lien se fait avec la candidature, même sans offre ; les contacts reliés seulement à l'offre y sont listés sans bouton de retrait
export default function ContactsLies({ contacts, offreId, candidatureId, entreprise, maj, ouvrirContact }: {
  contacts: Contact[];
  offreId?: string | null;
  candidatureId?: string | null;
  entreprise: string;
  maj: (patch: any) => void;
  ouvrirContact: (id: string) => void;
}) {
  const [texte, setTexte] = useState('');
  const [nouveau, setNouveau] = useState<null | { prenom: string; nom: string; fonction: string }>(null);
  const estLie = (k: Contact) => !!((candidatureId && k.candidatures.includes(candidatureId)) || (offreId && k.offres.includes(offreId)));
  const lies = contacts.filter(estLie);
  const autres = useMemo(() => contacts
    .filter(k => !estLie(k))
    .sort((a, b) => Number(memeEntreprise(b.entreprise, entreprise)) - Number(memeEntreprise(a.entreprise, entreprise)) || libelleContact(a).localeCompare(libelleContact(b), 'fr')), [contacts, offreId, candidatureId, entreprise]);

  const majK = (id: string, f: (k: Contact) => Partial<Contact>) => maj(e => ({ contacts: e.contacts.map(k => (k.id === id ? { ...k, ...f(k) } : k)) }));
  const lier = (v: string) => {
    const k = autres.find(x => libelleContact(x) === v);
    if (!k) return;
    majK(k.id, x => (candidatureId ? { candidatures: [...x.candidatures, candidatureId] } : { offres: [...x.offres, offreId!] }));
    setTexte('');
  };
  const delier = (id: string) => majK(id, x => (candidatureId ? { candidatures: x.candidatures.filter(o => o !== candidatureId) } : { offres: x.offres.filter(o => o !== offreId) }));
  const creer = () => {
    if (!nouveau || (!nouveau.prenom.trim() && !nouveau.nom.trim())) return;
    const k: Contact = { id: nouvelId(), prenom: nouveau.prenom.trim(), nom: nouveau.nom.trim(), fonction: nouveau.fonction.trim(), entreprise, adresse: '', telephone: '', email: '', note: '', cree: aujourdhui(), couleur: '', epingle: false, sans_telephone: false, sans_email: false, offres: candidatureId ? [] : [offreId!], candidatures: candidatureId ? [candidatureId] : [] };
    maj(e => ({ contacts: [...e.contacts, k] }));
    setNouveau(null);
  };

  return (
    <div className="contacts-lies">
      {lies.length === 0 ? <p className="muted small">{candidatureId ? 'Aucun contact lié à cette candidature.' : 'Aucun contact lié à cette offre.'}</p> : (
        <ul className="contacts-liste">
          {lies.map(k => (
            <li key={k.id} className="contact-ligne">
              <button type="button" className="btn-lien contact-nom" onClick={() => ouvrirContact(k.id)} title="Ouvrir dans Contacts"><UserRound size={14} />{nomContact(k)}</button>
              {k.fonction && <span className="muted small">{k.fonction}</span>}
              {k.telephone && <a className="tag" href={telLien(k.telephone)}><Phone size={12} />{k.telephone}</a>}
              {k.email && <a className="tag" href={'mailto:' + k.email}><Mail size={12} />{k.email}</a>}
              {candidatureId && !k.candidatures.includes(candidatureId) ? <span className="tag" title="Relié à l'offre de cette candidature">via l'offre</span> : (
              <button type="button" className="btn-lien" onClick={() => delier(k.id)} aria-label={`Retirer le lien avec ${nomContact(k)}`} title="Retirer le lien (le contact est conservé)"><X size={13} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {nouveau ? (
        <div className="contact-nouveau">
          <input className="input" placeholder="Prénom" value={nouveau.prenom} onChange={e => setNouveau({ ...nouveau, prenom: e.target.value })} aria-label="Prénom" autoFocus />
          <input className="input" placeholder="Nom" value={nouveau.nom} onChange={e => setNouveau({ ...nouveau, nom: e.target.value })} aria-label="Nom" />
          <input className="input" placeholder="Fonction" value={nouveau.fonction} onChange={e => setNouveau({ ...nouveau, fonction: e.target.value })} aria-label="Fonction"
            onKeyDown={e => { if (e.key === 'Enter') creer(); }} />
          <button type="button" className="btn btn-primary small" onClick={creer} disabled={!nouveau.prenom.trim() && !nouveau.nom.trim()}>Ajouter</button>
          <button type="button" className="btn btn-ghost small" onClick={() => setNouveau(null)}>Annuler</button>
        </div>
      ) : (
        <div className="contact-ajout">
          {autres.length > 0 && <Suggestions placeholder="Lier un contact existant" value={texte} onChange={e => setTexte(e.target.value)} onCommit={lier} options={autres.map(libelleContact)} aria-label="Lier un contact existant" />}
          <button type="button" className="btn btn-ghost small" onClick={() => setNouveau({ prenom: '', nom: '', fonction: '' })}><Plus size={14} />Nouveau contact</button>
        </div>
      )}
    </div>
  );
}
