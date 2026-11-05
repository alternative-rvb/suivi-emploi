import { Fragment, createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { lienSur } from '../utils.ts';

// ANCHOR: barre d'état unique du CV et de la lettre : date et heure, numéro d'offre (s'il y en a un), début et fin du titre, qui a produit le texte et comment
export const dateHeure = (iso?: string) => {
  const d = new Date(iso ?? '');
  // NOTE: « 27/10/2026 09:14 » en heure locale, sans espaces insécables
  return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`.replace(/[  ]/g, ' ');
};

// NOTE: titre long réduit à son début et sa fin (« Développeur informatique ... H/F »)
export const debutFin = (t: string) => (t.length > 48 ? `${t.slice(0, 28).trim()} ... ${t.slice(-14).trim()}` : t);

interface Props {
  /** date de génération ou de dernière modification (ISO) */
  date?: string;
  /** numéro de l'offre, vide pour un document générique */
  offreId?: string;
  /** adresse de l'annonce : le numéro d'offre devient un lien qui l'ouvre dans un nouvel onglet */
  lien?: string | null;
  /** titre de l'offre ou libellé du document générique */
  titre: string;
  /** compteur affiché avant l'auteur (par exemple « 1262 car. ») */
  compteur?: string;
  /** qui a produit le contenu et comment */
  qui: string;
  /** détail au survol : réglages pris en compte */
  detail?: string;
  /** mention ajoutée en fin de barre (enregistrement en cours) */
  suffixe?: string;
  testid: string;
  /** boutons affichés à droite du badge, au-dessus de l'aperçu (téléchargements) : on télécharge ce que l'on voit */
  actions?: ReactNode;
}

// ANCHOR: emplacement de la ligne du haut de CV/LM (App.tsx) : la barre d'actions de la vue affichée s'y place à côté de la bascule, au lieu d'occuper une bande de plus au-dessus de l'aperçu
// NOTE: null pour la vue masquée, qui garde sa barre en place (invisible) ; une seule vue à la fois reçoit l'emplacement
export const SlotBarre = createContext<HTMLElement | null>(null);

export default function BarreEtat({ date, offreId, titre, compteur, qui, detail, suffixe, testid, actions, lien }: Props) {
  // NOTE: avec des boutons à droite le badge peut passer à la ligne : le titre s'affiche en entier et chaque morceau reste d'un bloc, la coupure se fait aux séparateurs
  const href = lienSur(lien);
  // NOTE: le numéro d'offre porte le lien de l'annonce quand il existe (offre saisie à la main : pas de lien)
  const numero: ReactNode = offreId && href ? <a href={href} target="_blank" rel="noopener noreferrer" title="Ouvrir l'annonce">{offreId}</a> : offreId;
  const morceaux = [dateHeure(date), numero, actions ? titre : debutFin(titre), compteur, qui].filter(Boolean);
  const badge = (
    <span className="badge cv-badge-actif" data-testid={testid} title={detail}>
      <span className="cv-badge-texte"><>{morceaux.map((m, i) => <Fragment key={i}><span className="cv-badge-morceau">{m}{i < morceaux.length - 1 ? ' ·' : ''}</span>{' '}</Fragment>)}{suffixe ?? ''}</></span>
    </span>
  );
  const slot = useContext(SlotBarre);
  if (!actions) return badge;
  const barre = <div className="cv-barre">{badge}<span className="cv-barre-actions">{actions}</span></div>;
  return slot ? createPortal(barre, slot) : barre;
}
