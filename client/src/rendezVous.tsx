import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { RendezVous, RendezVousSaisie } from '../../types';
import { creerRdv, modifierRdv, rattacherEvenement, supprimerRdv } from './api.ts';
import { cssCouleur } from './contacts.ts';
import RendezVousForm from './components/RendezVousForm.tsx';

// ANCHOR: rendez-vous partagés par tout l'interface (ligne 121) : liste, écritures par l'API du serveur (qui les envoie à Google) et formulaire ouvert de n'importe quel écran
// NOTE: les RDV restent hors de l'envoi par différence d'App.tsx (le serveur est le seul à écrire google_id et synchro) : majRdv met à jour l'état sans déclencher d'enregistrement

// cible : valeurs de départ du formulaire. id = modification, rattacher = id Google d'un événement externe à rattacher
export type CibleRdv = {
  id?: string;
  jour?: string;
  heure?: string;
  titre?: string;
  offre_id?: string | null;
  candidature_id?: string | null;
  contact_id?: string | null;
  rattacher?: { google_id: string; titre: string; quand: string };
};

type Valeur = {
  rdvs: RendezVous[];
  // NOTE: change après chaque écriture, pour que les vues qui lisent Google relisent aussi
  version: number;
  ouvrirFormulaire: (cible?: CibleRdv) => void;
  supprimer: (id: string, localSeulement?: boolean) => Promise<void>;
  // NOTE: couleur CSS du contact d'un rendez-vous, undefined sans contact ou sans couleur
  couleurDe: (r?: RendezVous | null) => string | undefined;
};

const Contexte = createContext<Valeur>({ rdvs: [], version: 0, ouvrirFormulaire: () => {}, supprimer: async () => {}, couleurDe: () => undefined });
export const useRendezVous = () => useContext(Contexte);

export function RendezVousProvider({ rdvs, majRdv, candidatures, contacts, offres, maj, children }: {
  rdvs: RendezVous[];
  majRdv: (f: (l: RendezVous[]) => RendezVous[]) => void;
  candidatures: any[];
  contacts: any[];
  offres: any[];
  maj: (patch: any) => void;
  children: ReactNode;
}) {
  const [cible, setCible] = useState<CibleRdv | null>(null);
  const [version, setVersion] = useState(0);

  const ecrit = useCallback((r: RendezVous, remplace: boolean) => {
    majRdv(l => (remplace ? l.map(x => (x.id === r.id ? r : x)) : [...l, r]));
    setVersion(v => v + 1);
    return r;
  }, [majRdv]);

  const enregistrer = useCallback(async (id: string | undefined, d: RendezVousSaisie) => ecrit(id ? await modifierRdv(id, d) : await creerRdv(d), Boolean(id)), [ecrit]);
  const rattacher = useCallback(async (googleId: string, liens: { offre_id?: string | null; candidature_id?: string | null; contact_id?: string | null }) => ecrit(await rattacherEvenement(googleId, liens), false), [ecrit]);
  const supprimer = useCallback(async (id: string, localSeulement = false) => {
    await supprimerRdv(id, localSeulement);
    majRdv(l => l.filter(x => x.id !== id));
    setVersion(v => v + 1);
  }, [majRdv]);

  const couleurDe = useCallback((r?: RendezVous | null) => cssCouleur(contacts.find(k => k.id === r?.contact_id)?.couleur), [contacts]);
  const valeur = useMemo<Valeur>(() => ({ rdvs, version, ouvrirFormulaire: (c = {}) => setCible(c), supprimer, couleurDe }), [rdvs, version, supprimer, couleurDe]);

  return (
    <Contexte.Provider value={valeur}>
      {children}
      {cible && (
        <RendezVousForm
          cible={cible} rdvs={rdvs} candidatures={candidatures} contacts={contacts} offres={offres} maj={maj}
          enregistrer={enregistrer} rattacher={rattacher} supprimer={supprimer} onClose={() => setCible(null)}
        />
      )}
    </Contexte.Provider>
  );
}
