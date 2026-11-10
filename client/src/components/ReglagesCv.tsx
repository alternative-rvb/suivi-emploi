import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePhoto } from '../usePhoto.ts';
import { CATEGORIES } from '../constants.ts';
import VariantesTexte from './VariantesTexte.tsx';
import Select from './Select.tsx';
import { METIERS_CV as METIERS, TITRES_METIER } from '../../../lib/cv.mjs';

const CHAMPS_REGLAGE: ['titres' | 'accroches' | 'resumes', string][] = [['titres', 'Titre'], ['accroches', 'Accroche'], ['resumes', 'Résumé']];
// NOTE: largeur de l'aperçu du CV dans l'onglet CV/LM sur grand écran, en pixels
const LARGEUR_APERCU = 908;
const OPTIONS_CIBLE = [['general', 'CV général'], ...METIERS.map(m => [m, CATEGORIES[m].label])];

// ANCHOR: aperçu du haut du CV (même rendu que l'onglet CV/LM : entête puis Profil), rogné au premier tiers d'une page A4 ; 1 titre, 2 accroche, 3 résumé, la zone réglée est entourée
function ApercuHautCv({ champ, textes, contact, photo }: { champ: 'titres' | 'accroches' | 'resumes'; textes: Record<string, string>; contact: Record<string, string>; photo: string }) {
  const [photoKo, setPhotoKo] = useState(false);
  const cadre = useRef<HTMLDivElement>(null);
  const [echelle, setEchelle] = useState(1);
  // NOTE: le CV est mis en page à la largeur de l'aperçu de l'onglet CV/LM puis réduit à la colonne disponible : mêmes retours à la ligne quelle que soit la place (menu latéral du Profil compris)
  useEffect(() => {
    const e = cadre.current;
    if (!e) return;
    const obs = new ResizeObserver(() => setEchelle(Math.min(1, e.clientWidth / LARGEUR_APERCU)));
    obs.observe(e);
    return () => obs.disconnect();
  }, []);
  const item = (k: string) => (contact[k] ? <span className="cv-item">{contact[k]}</span> : null);
  const lieu = [contact.code_postal, contact.ville].filter(Boolean).join(' ');
  const zone = (k: 'titres' | 'accroches' | 'resumes') => (champ === k ? ' zone-visee' : '');
  return (
    <div className="cv-tiers" ref={cadre} role="img" aria-label="Aperçu du haut du CV : 1 titre, 2 accroche, 3 résumé">
      <article className="cv-apercu" style={{ width: LARGEUR_APERCU, transform: `scale(${echelle})`, transformOrigin: '0 0' }}>
        <header className={photo && !photoKo ? 'avec-photo' : ''}>
          {photo && !photoKo && <img className="cv-photo" src={photo} alt="" onError={() => setPhotoKo(true)} />}
          <h4>{contact.nom || 'Prénom Nom'}</h4>
          <p className={'cv-titre' + zone('titres')}><span className="num" aria-hidden="true">1</span>{textes.titres}</p>
          <p className="muted small cv-coord">{item('adresse')}{lieu && <span className="cv-item">{lieu}</span>}{item('telephone')}{item('email')}</p>
          <p className="muted small cv-coord">{item('site')}{item('linkedin')}{item('github')}</p>
          {contact.mention && <p className="muted small cv-coord">{item('mention')}</p>}
        </header>
        <section>
          <h5>Profil</h5>
          <p className={zone('accroches')}><span className="num" aria-hidden="true">2</span><strong>{textes.accroches}</strong></p>
          <div className={zone('resumes')}>{textes.resumes.split(/\n\s*\n/).map((p, i) => <p key={i}>{i === 0 && <span className="num" aria-hidden="true">3</span>}{p}</p>)}</div>
        </section>
      </article>
    </div>
  );
}

// ANCHOR: titre, accroche et résumé du CV par cible (profil.titres, accroches, resumes et leurs variantes), dans Profil > Modèles CV et lettre ; un champ à la fois, choisi par les pastilles
export default function ReglagesCv({ profil, maj }) {
  const [kReglage, setKReglage] = useState('general');
  const [champReglage, setChampReglage] = useState<'titres' | 'accroches' | 'resumes'>('accroches');
  const contact = profil?.contact ?? {};
  const photo = usePhoto();
  const majProfil = (cle, k, v) => maj(s => ({ profil: { ...s.profil, [cle]: { ...(s.profil?.[cle] ?? {}), [k]: v } } }));
  const personnalise = Boolean(profil?.titres?.[kReglage] || profil?.accroches?.[kReglage] || profil?.resumes?.[kReglage]);
  const texteChamp = { titres: profil?.titres?.[kReglage] || TITRES_METIER[kReglage] || contact.titre || '', accroches: profil?.accroches?.[kReglage] || profil?.accroche || '', resumes: profil?.resumes?.[kReglage] || profil?.resume || '' };
  const variantes = (profil?.variantes?.[champReglage]?.[kReglage] ?? []) as { nom: string; texte: string }[];
  const majVariantes = liste => maj(s => ({ profil: { ...s.profil, variantes: { ...(s.profil?.variantes ?? {}), [champReglage]: { ...(s.profil?.variantes?.[champReglage] ?? {}), [kReglage]: liste } } } }));
  const reinitialiser = () => ['titres', 'accroches', 'resumes'].forEach(cle => majProfil(cle, kReglage, ''));

  return (
    <div className="cv-haut reglages-cv-grille">
    <section className="carte" aria-labelledby="reglages-cv">
      <h3 id="reglages-cv" className="carte-titre"><SlidersHorizontal size={17} aria-hidden="true" />CV : titre, accroche et résumé</h3>
      <label className="field">Cible à régler<Select value={kReglage} onChange={e => setKReglage(e.target.value)} options={OPTIONS_CIBLE} /></label>
      <p className="muted small">Préremplis avec le métier, le titre des Coordonnées et le Parcours. Ce que vous écrivez ici remplace la valeur par défaut pour cette cible seulement et reste contrôlé comme le reste (années, noms propres).</p>
      {/* NOTE: interrupteur sur une ligne, comme CV / Lettre au-dessus : trois choix exclusifs, sans numéro ni point décoratif */}
      <div className="segments" role="radiogroup" aria-label="Texte à régler">
        {CHAMPS_REGLAGE.map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={champReglage === k} className={'segment' + (champReglage === k ? ' on' : '')} onClick={() => setChampReglage(k)}>{l}</button>
        ))}
      </div>
      {champReglage === 'titres' && <textarea className="input" aria-label="Titre (sous le nom)" rows={3} value={texteChamp.titres} onChange={e => majProfil('titres', kReglage, e.target.value)} />}
      {champReglage === 'accroches' && <textarea className="input" aria-label="Accroche" rows={4} value={texteChamp.accroches} onChange={e => majProfil('accroches', kReglage, e.target.value)} />}
      {champReglage === 'resumes' && <textarea className="input" aria-label="Résumé" rows={8} value={texteChamp.resumes} onChange={e => majProfil('resumes', kReglage, e.target.value)} />}
      <VariantesTexte texte={texteChamp[champReglage]} variantes={variantes} onChoisir={t => majProfil(champReglage, kReglage, t)} onListe={majVariantes} />
      <button type="button" className="btn btn-ghost small cv-fichier" onClick={reinitialiser} disabled={!personnalise}><RotateCcw size={15} />Rétablir les valeurs par défaut</button>
    </section>
    <ApercuHautCv champ={champReglage} textes={texteChamp} contact={contact} photo={photo.url} />
    </div>
  );
}
