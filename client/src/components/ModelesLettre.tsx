import { Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { enregistrerStyle } from '../api.ts';
import { useMemoire } from '../utils.ts';
import MatriceLettreDefaut from './MatriceLettreDefaut.tsx';
import Select from './Select.tsx';
import { BLOCS_LETTRE, CLICHES, HUMILITE, LIBELLES_BLOC, LIBELLES_METIER, METIERS_LETTRE, STYLE_DEFAUT } from '../../../lib/lettre.mjs';
import type { LettreMatrice, LettreStyle, MetierLettre } from '../../../types';

const TONS = { sobre: 'Sobre', chaleureux: 'Chaleureux', dynamique: 'Dynamique' };
const copie = (s: LettreStyle | undefined): LettreStyle => structuredClone(s ?? STYLE_DEFAUT) as LettreStyle;
// NOTE: un angle sans métier précisé vaut pour tous ; activer le dernier métier manquant ramène à « tous »
const actifPour = (a: LettreStyle['angles'][number], m: MetierLettre) => !a.metiers.length || a.metiers.includes(m);
const metiersApres = (a: LettreStyle['angles'][number], m: MetierLettre, actif: boolean): MetierLettre[] => {
  const base: MetierLettre[] = a.metiers.length ? a.metiers : [...METIERS_LETTRE];
  const n = actif ? [...new Set([...base, m])] : base.filter(x => x !== m);
  return n.length === METIERS_LETTRE.length ? [] : n;
};

// ANCHOR: aperçu à gauche : une lettre schématique avec les trois zones réglables numérotées directement dessus, la zone de l'étape active en couleur, les autres en gris ; un clic sur une zone ouvre l'étape
// NOTE: 1 = en-tête (ton et longueur), 2 = les blocs Vous, Moi, Nous, Conclusion (plan et consignes), 3 = l'accroche dans le bloc Vous (angles d'accroche), 4 = formule repérée dans le texte (formules à éviter). Même numéro et même libellé que les étapes
function ApercuLettre({ etape, matrice, angle, ouvrir }: { etape: number; matrice?: LettreMatrice; angle?: { nom: string; consigne: string }; ouvrir: (n: number) => void }) {
  const blocs = BLOCS_LETTRE.filter(b => matrice?.blocs?.[b]?.actif ?? b !== 'faible');
  const zone = (n: number) => 'apercu-bloc apercu-zone' + (etape === n ? ' vise' : '');
  return (
    <aside className="apercu-lettre" aria-label="Aperçu : où se place le réglage en cours">
      <div className="apercu-page">
        <button type="button" className={zone(1)} onClick={() => ouvrir(1)} aria-label="Ouvrir l'étape 1, ton et longueur">
          <span className="small"><span className="num" aria-hidden="true">1</span>{TONS[matrice?.ton ?? 'sobre']}, {matrice?.mots ?? 250} mots</span>
        </button>
        <p className="apercu-ligne">Madame, Monsieur,</p>
        {blocs.map(b => (
          <div key={b} className={zone(2)} role="button" tabIndex={0} onClick={() => ouvrir(2)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(2); } }} aria-label={`Ouvrir l'étape 2, plan de la lettre : ${LIBELLES_BLOC[b]}`}>
            <strong className="small"><span className="num" aria-hidden="true">2</span>{LIBELLES_BLOC[b]}</strong>
            {b === 'vous' ? (
              <button type="button" className={'apercu-sous' + (etape === 3 ? ' vise' : '')} onClick={e => { e.stopPropagation(); ouvrir(3); }} aria-label="Ouvrir l'étape 3, angles d'accroche">
                <span className="small"><span className="num" aria-hidden="true">3</span>{etape === 3 && angle ? angle.nom : 'Accroche'}</span>
              </button>
            ) : <span className="apercu-traits" aria-hidden="true"><i /><i /><i /></span>}
          </div>
        ))}
        <button type="button" className={zone(4)} onClick={() => ouvrir(4)} aria-label="Ouvrir l'étape 4, formules à éviter">
          <span className="small"><span className="num" aria-hidden="true">4</span><s>formule repérée</s></span>
        </button>
        <p className="apercu-ligne">Signature</p>
      </div>
    </aside>
  );
}

// NOTE: chaque étape s'enroule et se déroule librement (plusieurs ouvertes, ou aucune) ; l'aperçu suit la dernière étape ouverte. Composant défini hors de ModelesLettre : défini dedans, il serait recréé à chaque frappe et ferait perdre le focus aux champs
function Etape({ actif, ouverte, bascule, n, titre, resume, children }: { actif: boolean; ouverte: boolean; bascule: (n: number, ouvert: boolean) => void; n: number; titre: string; resume: string; children: any }) {
  return (
    <details className="bloc-rep" open={ouverte} onToggle={e => { if (e.currentTarget.open !== ouverte) bascule(n, e.currentTarget.open); }}>
      <summary>
        <span className="bloc-rep-titre"><span className={'num' + (actif ? ' actif' : '')} aria-hidden="true">{n}</span>{titre}</span>
        <span className="bloc-rep-resume">{resume}</span>
        <span className="chev" aria-hidden="true" />
      </summary>
      <div className="bloc-rep-corps">{children}</div>
    </details>
  );
}

// ANCHOR: Profil > Modèles CV et lettre > Lettre : un métier à la fois (liste déroulante), puis trois étapes dont une seule est ouverte (ton et longueur, angles d'accroche, formules à éviter)
// NOTE: la matrice et les formules à éviter valent pour tous les métiers ; seuls les angles se choisissent par métier
export default function ModelesLettre({ matrice, style: enregistre }: { matrice?: LettreMatrice; style?: LettreStyle }) {
  const [metier, setMetier] = useMemoire('lettre.metier', 'formateur_digital') as [MetierLettre, (m: MetierLettre) => void];
  const [ouvertes, setOuvertes] = useMemoire('lettre.etapes2', [1]) as [number[], (o: number[]) => void];
  const [etape, setEtape] = useMemoire('lettre.etape2', 1) as [number, (n: number) => void];
  const bascule = (n: number, ouvert: boolean) => {
    // NOTE: mise à jour fonctionnelle : « tout replier » bascule les quatre étapes dans le même tick, chacune doit partir de l'état précédent
    (setOuvertes as any)((o: number[]) => ouvert ? [...new Set([...o, n])] : o.filter(x => x !== n));
    if (ouvert) setEtape(n);
  };
  // NOTE: l'aperçu suit la dernière étape ouverte ; aucune zone en couleur quand tout est enroulé
  const vue = ouvertes.includes(etape) ? etape : (ouvertes[ouvertes.length - 1] ?? 0);
  const [style, setStyle] = useState<LettreStyle>(copie(enregistre));
  const [modifie, setModifie] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [editee, setEditee] = useState('');
  const [formule, setFormule] = useState('');
  // NOTE: suit le serveur tant que rien n'est en cours de saisie (même principe que la matrice)
  useEffect(() => { if (!modifie) setStyle(copie(enregistre)); }, [JSON.stringify(enregistre)]);
  const maj = (f: (s: LettreStyle) => void) => { setStyle(s => { const n = copie(s); f(n); return n; }); setModifie(true); setMessage(''); };
  const enregistrer = async () => {
    try {
      setStyle(copie(await enregistrerStyle(style)));
      setModifie(false);
      setErreur('');
      setMessage('Style enregistré : le modèle local, Claude et le contrôle l\'utilisent dès la prochaine lettre.');
    } catch (e) {
      setErreur(e.message);
    }
  };
  const ajouterFormule = () => {
    const f = formule.trim();
    if (f.length < 4) return;
    maj(s => { s.eviter = [...new Set([...s.eviter, f.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/’/g, '\'')])]; });
    setFormule('');
  };
  const actifs = style.angles.filter(a => actifPour(a, metier)).length;
  const bouton = (
    <button type="button" className="btn btn-ghost small cv-fichier" onClick={enregistrer} disabled={!modifie}><Save size={15} />Enregistrer</button>
  );
  return (
    <div className="modeles-lettre-grille">
    <ApercuLettre etape={vue} matrice={matrice} angle={style.angles.find(a => a.id === editee)} ouvrir={n => bascule(n, true)} />
    <section className="carte modeles-lettre" aria-label="Style des lettres">
      <label className="field">Métier visé<Select value={metier} onChange={e => setMetier(e.target.value)} options={METIERS_LETTRE.map(m => [m, LIBELLES_METIER[m]])} /></label>
      <p className="muted small">Les lettres du métier choisi piochent dans ces angles d'accroche. Le ton, la longueur et les formules à éviter valent pour tous les métiers.</p>

      <MatriceLettreDefaut matrice={matrice} integre rendre={({ ton, plan, bouton: enreg }) => (
        <>
          <Etape actif={vue === 1} ouverte={ouvertes.includes(1)} bascule={bascule} n={1} titre="Ton et longueur" resume={`${TONS[(matrice?.ton ?? 'sobre')]}, ${matrice?.mots ?? 250} mots`}>
            {ton}
            {enreg}
          </Etape>
          <Etape actif={vue === 2} ouverte={ouvertes.includes(2)} bascule={bascule} n={2} titre="Plan de la lettre" resume={`${BLOCS_LETTRE.filter(b => matrice?.blocs?.[b]?.actif ?? b !== 'faible').length} blocs`}>
            <p className="muted small">Les paragraphes de chaque lettre. Activez ou non un bloc, et donnez-lui une consigne facultative (fait à citer, expérience à mettre en avant). L'accroche du bloc Vous se règle à l'étape 3.</p>
            {plan}
            {enreg}
          </Etape>
        </>
      )} />

      <Etape actif={vue === 3} ouverte={ouvertes.includes(3)} bascule={bascule} n={3} titre="Angles d'accroche" resume={`${actifs} sur ${style.angles.length} pour ${LIBELLES_METIER[metier]}`}>
        <p className="muted small">Un angle est une façon d'ouvrir la lettre. Le modèle en choisit un selon l'annonce, et le contrôle signale une ouverture déjà utilisée. Cliquez sur un angle pour le modifier.</p>
        <ul className="angles-liste">
          {style.angles.map(a => (
            <li key={a.id} className="angle-ligne">
              <div className="angle-tete">
                <label className="switch"><input type="checkbox" checked={actifPour(a, metier)} aria-label={`Angle ${a.nom} actif pour ${LIBELLES_METIER[metier]}`} onChange={e => maj(s => { const x = s.angles.find(y => y.id === a.id); if (x) x.metiers = metiersApres(x, metier, e.target.checked); })} /></label>
                <button type="button" className="angle-nom" aria-expanded={editee === a.id} onClick={() => setEditee(editee === a.id ? '' : a.id)}>
                  <strong>{a.nom}</strong>
                  {editee !== a.id && <span className="muted small angle-extrait">{a.consigne}</span>}
                </button>
              </div>
              {editee === a.id && (
                <div className="angle-edition">
                  <label className="field">Nom<input className="input" maxLength={60} value={a.nom} onChange={e => maj(s => { const x = s.angles.find(y => y.id === a.id); if (x) x.nom = e.target.value; })} /></label>
                  <label className="field">Consigne<textarea className="input" rows={3} maxLength={400} value={a.consigne} onChange={e => maj(s => { const x = s.angles.find(y => y.id === a.id); if (x) x.consigne = e.target.value; })} /></label>
                  <button type="button" className="btn btn-ghost small" onClick={() => { maj(s => { s.angles = s.angles.filter(y => y.id !== a.id); }); setEditee(''); }}><Trash2 size={15} />Supprimer cet angle</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="angles-actions">
          <button type="button" className="btn btn-ghost small" onClick={() => { const id = 'angle-' + Date.now().toString(36); maj(s => { s.angles.push({ id, nom: 'Nouvel angle', consigne: 'Décrire la façon d\'ouvrir la lettre, avec une forme d\'exemple.', metiers: [metier] }); }); setEditee(id); }}><Plus size={15} />Ajouter un angle pour ce métier</button>
          <button type="button" className="btn btn-ghost small" onClick={() => maj(s => { s.angles = copie(STYLE_DEFAUT as any).angles; })}><RotateCcw size={15} />Rétablir les angles par défaut</button>
          {bouton}
        </div>
      </Etape>

      <Etape actif={vue === 4} ouverte={ouvertes.includes(4)} bascule={bascule} n={4} titre="Formules à éviter" resume={`${style.eviter.length} à vous, ${CLICHES.length + HUMILITE.length} intégrées`}>
        <p className="muted small">Le modèle local ne les écrit pas, et le contrôle les signale dans une lettre. Les formules creuses courantes ({CLICHES.length + HUMILITE.length}) sont déjà surveillées : ajoutez ici les vôtres, par exemple une phrase déjà envoyée trop souvent.</p>
        <div className="chips" aria-label="Formules à éviter">
          {style.eviter.map(f => (
            <button key={f} type="button" className="chip on" title="Retirer cette formule" onClick={() => maj(s => { s.eviter = s.eviter.filter(x => x !== f); })}>{f}<X size={13} aria-label="Retirer" /></button>
          ))}
        </div>
        <div className="formule-ajout">
          <input className="input" aria-label="Ajouter une formule à éviter" placeholder="Une formule à éviter, puis Entrée" maxLength={80} value={formule} onChange={e => setFormule(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterFormule(); } }} />
          <button type="button" className="btn btn-ghost small" onClick={ajouterFormule} disabled={formule.trim().length < 4}><Plus size={15} />Ajouter</button>
          {bouton}
        </div>
      </Etape>
      {message && <p className="small ok-texte" role="status">{message}</p>}
      {erreur && <p className="alert" role="alert">{erreur}</p>}
    </section>
    </div>
  );
}
