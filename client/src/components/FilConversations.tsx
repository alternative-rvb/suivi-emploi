import { ArrowDownLeft, ArrowUpRight, Briefcase, Ellipsis, Globe, Mail, MessageCircle, MessageSquare, Phone, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { CANAUX } from '../constants.ts';
import { aujourdhui, fmtDate, joursEntre } from '../utils.ts';

// NOTE: pas d'icône de marque dans lucide-react : LinkedIn prend la mallette
export const ICONES_CANAL: Record<string, React.ComponentType<any>> = { email: Mail, telephone: Phone, whatsapp: MessageCircle, sms: MessageSquare, linkedin: Briefcase, entretien: Users, plateforme: Globe, autre: Ellipsis };

export const SENS = { recu: 'Ils m\'ont contacté', envoye: 'J\'ai contacté l\'entreprise' };
// NOTE: forme courte et flèche dans la chronologie : entrant (reçu) ou sortant (envoyé)
export const SENS_COURT = { recu: ['Reçu', ArrowDownLeft], envoye: ['Envoyé', ArrowUpRight] };

export const heureLisible = h => (h ? ' à ' + h.replace(':', ' h ') : '');

// ANCHOR: fil des conversations, partagé par l'Historique d'une candidature et par la fiche d'un contact (même composant, même affichage) :
// filtre par type puis bulles du plus ancien (en haut) au plus récent (en bas), comme dans une messagerie
// NOTE: echanges reçus du plus récent au plus ancien ; origine affiche en plus l'entreprise de la candidature dans la bulle (fiche contact)
export default function FilConversations({ echanges, maj, origine, libelle = "Conversations avec l'entreprise" }: {
  echanges: any[];
  maj: (patch: any) => void;
  origine?: (x: any) => ReactNode;
  libelle?: string;
}) {
  const [filtre, setFiltre] = useState('');
  const types: string[] = [...new Set<string>(echanges.map(x => x.canal))];
  const visibles = (filtre ? echanges.filter(x => x.canal === filtre) : echanges).slice().reverse();

  return (
    <>
      {types.length > 1 && (
        <div className="chips chips-compact" role="group" aria-label="Filtrer les conversations par type">
          <button type="button" className={'chip' + (!filtre ? ' on' : '')} aria-pressed={!filtre} onClick={() => setFiltre('')}><span className="chip-libelle">Tous</span></button>
          {types.map(k => {
            const Ico = ICONES_CANAL[k] || Ellipsis;
            return <button key={k} type="button" className={'chip' + (filtre === k ? ' on' : '')} aria-pressed={filtre === k} title={CANAUX[k] || 'Autre'} onClick={() => setFiltre(filtre === k ? '' : k)}><Ico size={14} /><span className="chip-libelle">{CANAUX[k] || 'Autre'}</span></button>;
          })}
        </div>
      )}

      {visibles.length > 0 && (
        <ol className="fil" aria-label={libelle}>
          {visibles.map(x => {
            const Ico = ICONES_CANAL[x.canal] || Ellipsis;
            const [libSens, IcoSens] = SENS_COURT[x.sens] || [];
            const ilYa = x.date ? joursEntre(x.date, aujourdhui()) : 0;
            return (
              <li key={x.id} className={'bulle bulle-' + (x.sens || 'neutre')}>
                <div className="bulle-corps">
                  <span className="bulle-tete">
                    <Ico size={14} aria-hidden="true" />
                    <b>{CANAUX[x.canal] || 'Échange'}</b>
                    {libSens && <span className="bulle-sens" title={SENS[x.sens]}><IcoSens size={12} aria-hidden="true" />{libSens}</span>}
                    {origine?.(x)}
                  </span>
                  {x.resume ? <p className="bulle-texte">{x.resume}</p> : <p className="bulle-texte muted">Sans résumé</p>}
                  <span className="bulle-pied">
                    <time dateTime={x.date + (x.heure ? 'T' + x.heure : '')}>{fmtDate(x.date)}{heureLisible(x.heure)}{ilYa > 0 ? ` (il y a ${ilYa} j)` : ''}</time>
                    <button type="button" className="bulle-suppr" onClick={() => { if (confirm('Supprimer cette conversation ?')) maj(e => ({ echanges: e.echanges.filter(y => y.id !== x.id) })); }} aria-label="Supprimer la conversation" title="Supprimer cette conversation"><Trash2 size={12} /></button>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
