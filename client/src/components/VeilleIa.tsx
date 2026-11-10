import { Plus, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { dateHeure } from '../format.ts';
import { norm } from '../utils.ts';
import { useSyntheses } from '../useSyntheses.ts';
import { SqCarte } from './Squelettes.tsx';
import { useHauteur } from '../useHauteur.ts';

// ANCHOR: sujets de veille proposés par le modèle d'après les candidatures (ligne 86). Rien n'est enregistré ici : la sélection passe
// dans le brouillon des réglages, que l'utilisateur vérifie puis enregistre avec le bouton habituel (aperçu des offres retirées compris).
export default function VeilleIa({ champs, brouillon, ajouter }) {
  const { etat, erreur, lancer } = useSyntheses();
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  // NOTE: hauteur réelle mémorisée (clé partagée avec le squelette de Recherche d'offres), pour ne pas pousser les listes à l'arrivée des propositions
  const { ref, hauteur } = useHauteur('recherche.veilleia', 150, Boolean(etat));
  if (!etat) return <div className="sq-hauteur" style={{ minHeight: hauteur }}><SqCarte lignes={2} label="Chargement des suggestions de l'IA" /></div>;
  const s = etat.veille;
  const cle = (champ, valeur) => `${champ}\u0000${valeur}`;

  // NOTE: une proposition déjà dans le brouillon (ajoutée ici ou à la main) n'est plus affichée
  const restantes = champs.map(c => {
    const pris = new Set((brouillon[c.cle] ?? []).map(norm));
    return { champ: c, liste: (s.resultat?.[c.cle] ?? []).filter(x => !pris.has(norm(x.valeur))) };
  }).filter(g => g.liste.length);

  const basculer = k => { setMessage(''); setChoisis(e => { const n = new Set(e); if (n.has(k)) n.delete(k); else n.add(k); return n; }); };
  const valider = () => {
    let total = 0;
    for (const { champ, liste } of restantes) {
      const retenus = liste.filter(x => choisis.has(cle(champ.cle, x.valeur))).map(x => x.valeur);
      if (retenus.length) { ajouter(champ.cle, retenus); total += retenus.length; }
    }
    setChoisis(new Set());
    setMessage(`${total} ajout(s) dans les réglages ci-dessous, à vérifier puis enregistrer.`);
  };
  const nbChoisis = restantes.reduce((t, g) => t + g.liste.filter(x => choisis.has(cle(g.champ.cle, x.valeur))).length, 0);

  return (
    <div className="carte veille-ia" ref={ref}>
      <h3 className="carte-titre">
        <Sparkles size={17} aria-hidden="true" />Suggestions de l'IA pour ces listes
        {etat.actif && (
          <button type="button" className="btn btn-ghost small titre-outils" onClick={() => lancer('veille')} disabled={s.enCours} title="Relire les candidatures avec le modèle local">
            <RefreshCw size={14} className={s.enCours ? 'tourne' : ''} />{s.enCours ? 'Analyse...' : s.resultat ? 'Relancer' : 'Analyser les candidatures'}
          </button>
        )}
      </h3>
      <p className="muted small">Le modèle local relit vos candidatures (postes, employeurs, lieux, plateformes) et propose des mots-clés, zones, employeurs ou mots exclus qui manquent aux listes ci-dessous, avec la raison de chaque proposition. Cochez celles à garder puis « Ajouter aux réglages » : elles rejoignent les listes, qu'il reste à enregistrer.</p>
      {!etat.actif && <p className="muted small">Analyse IA désactivée{etat.erreur ? ` : ${etat.erreur}` : ' (ANALYSE_PROVIDER dans le .env).'}</p>}
      {(erreur || s.erreur) && <p className="warn small" role="alert">{erreur || s.erreur}</p>}
      {s.resultat && (restantes.length === 0
        ? <p className="muted small">Aucune proposition en attente.</p>
        : restantes.map(({ champ, liste }) => (
          <fieldset key={champ.cle} className="veille-ia-groupe" style={{ '--c': champ.couleur }}>
            <legend className="small">{champ.titre}</legend>
            {liste.map(x => (
              <label key={x.valeur} className="veille-ia-ligne">
                <input type="checkbox" checked={choisis.has(cle(champ.cle, x.valeur))} onChange={() => basculer(cle(champ.cle, x.valeur))} />
                <span className="badge" style={{ '--c': champ.couleur }}>{x.valeur}</span>
                {x.raison && <span className="muted small">{x.raison}</span>}
              </label>
            ))}
          </fieldset>
        )))}
      {s.resultat && (
        <p className="muted small">
          {s.modele}, {dateHeure(s.date)}.
          {s.a_jour === false && <b className="warn"> Candidatures modifiées depuis : à relancer.</b>}
        </p>
      )}
      {message && <p className="small" role="status">{message}</p>}
      {restantes.length > 0 && (
        <div className="admin-actions">
          <button type="button" className="btn btn-primary small" onClick={valider} disabled={!nbChoisis}><Plus size={15} />Ajouter {nbChoisis || ''} aux réglages</button>
        </div>
      )}
    </div>
  );
}
