import { Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { enregistrerMatrice } from '../api.ts';
import Select from './Select.tsx';
import { BLOCS_LETTRE, LIBELLES_BLOC, MATRICE_DEFAUT, MOTS_MAX, MOTS_MIN, TONS_LETTRE } from '../../../lib/lettre.mjs';
import type { LettreMatrice } from '../../../types';

const TONS = { sobre: 'Sobre', chaleureux: 'Chaleureux', dynamique: 'Dynamique' };
const copie = (m: LettreMatrice | undefined): LettreMatrice => structuredClone(m ?? MATRICE_DEFAUT) as LettreMatrice;

// ANCHOR: matrice de lettre par défaut (kv lettre_matrice), dans Profil > Modèles CV et lettre : ton, longueur et blocs repris par chaque nouvelle lettre ; les compétences à citer dépendent de l'offre et restent dans l'onglet Lettre
// NOTE: avec `rendre`, le parent place lui-même les deux parties (ton et longueur, plan) dans ses étapes ; une seule matrice et un seul bouton Enregistrer, pour qu'une partie n'écrase jamais l'autre
export default function MatriceLettreDefaut({ matrice: enregistree, integre = false, rendre }: { matrice?: LettreMatrice; integre?: boolean; rendre?: (p: { ton: any; plan: any; bouton: any }) => any }) {
  const [matrice, setMatrice] = useState<LettreMatrice>(copie(enregistree));
  const [modifie, setModifie] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  // NOTE: suit la matrice du serveur (bouton « Garder comme matrice par défaut » de l'onglet Lettre, rechargement de l'état) tant que rien n'est en cours de saisie
  useEffect(() => { if (!modifie) setMatrice(copie(enregistree)); }, [JSON.stringify(enregistree)]);
  const majMatrice = (f: (m: LettreMatrice) => void) => { setMatrice(m => { const n = copie(m); f(n); return n; }); setModifie(true); setMessage(''); };
  const enregistrer = async () => {
    try {
      setMatrice(copie(await enregistrerMatrice(matrice)));
      setModifie(false);
      setErreur('');
      setMessage('Matrice enregistrée : elle sert de point de départ aux prochaines lettres.');
    } catch (e) {
      setErreur(e.message);
    }
  };

  const ton = (
    <>
      <div className="grid-2">
        <label className="field">Ton<Select value={matrice.ton} onChange={e => majMatrice(m => { m.ton = e.target.value; })} options={TONS_LETTRE.map(t => [t, TONS[t]])} /></label>
        <label className="field">Longueur (mots)<input className="input" type="number" min={MOTS_MIN} max={MOTS_MAX} step={10} value={matrice.mots} onChange={e => majMatrice(m => { m.mots = Number(e.target.value) || MATRICE_DEFAUT.mots; })} /></label>
      </div>
    </>
  );
  const plan = (
    <>
      {BLOCS_LETTRE.map(b => (
        <div key={b} className="lettre-bloc">
          <label className="switch"><input type="checkbox" checked={matrice.blocs[b].actif} onChange={e => majMatrice(m => { m.blocs[b].actif = e.target.checked; })} /> {LIBELLES_BLOC[b]}</label>
          {matrice.blocs[b].actif && <input className="input" aria-label={`Consigne pour ${LIBELLES_BLOC[b]}`} maxLength={500} placeholder={b === 'faible' ? 'Écart à assumer comme un atout (reconversion, distance...)' : 'Consigne facultative (fait à citer, expérience à mettre en avant)'} value={matrice.blocs[b].consigne} onChange={e => majMatrice(m => { m.blocs[b].consigne = e.target.value; })} />}
        </div>
      ))}
    </>
  );
  const bouton = (
    <button type="button" className="btn btn-ghost small cv-fichier" onClick={enregistrer} disabled={!modifie}><Save size={15} />Enregistrer</button>
  );
  const retours = (
    <>
      {message && <p className="small ok-texte" role="status">{message}</p>}
      {erreur && <p className="alert" role="alert">{erreur}</p>}
    </>
  );
  if (rendre) return <>{rendre({ ton, plan, bouton })}{retours}</>;

  return (
    <section className={integre ? 'matrice-integree' : 'carte'} aria-labelledby={integre ? undefined : 'matrice-lettre'} aria-label={integre ? 'Matrice de lettre par défaut' : undefined}>
      {!integre && <h3 id="matrice-lettre" className="carte-titre"><SlidersHorizontal size={17} aria-hidden="true" />Lettre : matrice par défaut</h3>}
      <p className="muted small">Point de départ de chaque nouvelle lettre (plan Vous, Moi, Nous). Une lettre déjà commencée garde sa propre matrice, modifiable dans l'onglet Lettre avec les compétences à citer pour l'offre.</p>
      {ton}
      {plan}
      {bouton}
      {retours}
    </section>
  );
}
