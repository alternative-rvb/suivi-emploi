import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { importerLinkedin } from '../api.ts';
import { CATEGORIES } from '../constants.ts';
import { periodeFormation } from '../../../lib/periode.mjs';
import { nouvelId } from '../utils.ts';

const SECTIONS = [
  ['experiences', 'Expériences', x => x.poste, x => [x.employeur, [x.debut, x.fin || 'en cours'].filter(Boolean).join(' à '), CATEGORIES[x.categorie]?.label].filter(Boolean).join(' · ')],
  ['formations', 'Diplômes et certifications', f => f.titre, f => [f.etablissement, periodeFormation(f), f.type === 'certification' ? 'Certification' : 'Diplôme'].filter(Boolean).join(' · ')],
  ['competences', 'Compétences et langues', c => c.competence, c => [c.domaine, c.note].filter(Boolean).join(' · ')],
] as const;

// ANCHOR: import de l'export LinkedIn (ZIP) : le serveur lit le fichier et propose, l'utilisateur coche, l'ajout passe par maj (routes, journal) comme une saisie
export default function ImportLinkedin({ etat, maj, fermer }) {
  const [proposition, setProposition] = useState<any>(null);
  const [coches, setCoches] = useState<Record<string, boolean>>({});
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState('');

  const lire = async fichier => {
    if (!fichier) return;
    setErreur(''); setBilan(''); setEnCours(true);
    try {
      const p = await importerLinkedin(fichier);
      setProposition(p);
      // NOTE: coché par défaut ce qui manque au Profil ; l'accroche et le résumé seulement s'ils sont vides dans l'app
      const c: Record<string, boolean> = {};
      for (const [cle] of SECTIONS) p[cle].forEach((e, i) => { c[`${cle}.${i}`] = !e.present; });
      c['profil.accroche'] = !!p.profil.accroche && !etat.profil?.accroche;
      c['profil.resume'] = !!p.profil.resume && !etat.profil?.resume;
      setCoches(c);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnCours(false);
    }
  };

  const nombre = Object.values(coches).filter(Boolean).length;

  const ajouter = () => {
    const p = proposition;
    const choisis = cle => p[cle].filter((_, i) => coches[`${cle}.${i}`]).map(({ present, ...e }) => e);
    const comp = choisis('competences');
    const form = choisis('formations');
    const exp = choisis('experiences');
    maj(e => {
      const suite = (liste, i) => Math.max(-1, ...liste.map((x, j) => x.ordre ?? j)) + 1 + i;
      const profil = { ...e.profil };
      if (coches['profil.accroche']) profil.accroche = p.profil.accroche;
      if (coches['profil.resume']) profil.resume = p.profil.resume;
      return {
        profil,
        competences: [...e.competences, ...comp.map((c, i) => ({ ...c, id: `c-${nouvelId()}${i}`, valide: false, ordre: suite(e.competences, i) }))],
        formations: [...e.formations, ...form.map((f, i) => ({ ...f, id: `f-${nouvelId()}${i}`, ordre: suite(e.formations, i) }))],
        experiences: [...e.experiences, ...exp.map((x, i) => ({ ...x, id: `x-${nouvelId()}${i}`, ordre: 0, competences: [] }))],
      };
    });
    setBilan(`${exp.length} expérience${exp.length > 1 ? 's' : ''}, ${form.length} formation${form.length > 1 ? 's' : ''} et ${comp.length} compétence${comp.length > 1 ? 's' : ''} ajoutées. Les compétences importées sont dans le domaine « À classer (LinkedIn) », à noter dans Compétences.`);
    setProposition(null);
  };

  const basculer = (cle, valeur) => setCoches(c => ({ ...c, [cle]: valeur }));
  const toutes = (section, valeur) => setCoches(c => ({ ...c, ...Object.fromEntries(proposition[section].map((_, i) => [`${section}.${i}`, valeur])) }));

  return (
    <div className="carte import-li">
      <div className="parcours-entete">
        <h3 className="carte-titre">Importer l'export LinkedIn</h3>
        <button type="button" className="btn btn-ghost small icon" onClick={fermer} aria-label="Fermer l'import"><X size={15} /></button>
      </div>
      <p className="muted small">
        Sur LinkedIn : Préférences, Confidentialité des données, Obtenir une copie de vos données. Choisissez le fichier ZIP reçu par email. Il est lu sur cette machine, puis effacé ; seuls le titre, le résumé, les postes, formations, certifications, compétences et langues sont repris. Rien n'est ajouté avant votre validation.
      </p>
      <input type="file" accept=".zip,application/zip" className="input" onChange={e => lire(e.target.files?.[0])} disabled={enCours} aria-label="Fichier ZIP de l'export LinkedIn" />
      {enCours && <p className="muted small">Lecture du fichier...</p>}
      {erreur && <p className="import-err small" role="alert">{erreur}</p>}
      {bilan && <p className="import-ok small" role="status"><Check size={15} aria-hidden="true" />{bilan}</p>}

      {proposition && (
        <>
          {(proposition.profil.accroche || proposition.profil.resume) && (
            <fieldset className="import-section">
              <legend>Accroche et résumé</legend>
              {proposition.profil.accroche && <label className="import-ligne"><input type="checkbox" checked={!!coches['profil.accroche']} onChange={e => basculer('profil.accroche', e.target.checked)} /><span><b>Accroche</b><span className="muted small">{proposition.profil.accroche}</span></span></label>}
              {proposition.profil.resume && <label className="import-ligne"><input type="checkbox" checked={!!coches['profil.resume']} onChange={e => basculer('profil.resume', e.target.checked)} /><span><b>Résumé</b><span className="muted small import-resume">{proposition.profil.resume}</span></span></label>}
            </fieldset>
          )}
          {SECTIONS.map(([cle, titre, principal, detail]) => proposition[cle].length > 0 && (
            <fieldset key={cle} className="import-section">
              <legend>{titre} ({proposition[cle].length})</legend>
              <div className="import-tout">
                <button type="button" className="btn btn-ghost small" onClick={() => toutes(cle, true)}>Tout cocher</button>
                <button type="button" className="btn btn-ghost small" onClick={() => toutes(cle, false)}>Tout décocher</button>
              </div>
              {proposition[cle].map((e, i) => (
                <label key={i} className="import-ligne">
                  <input type="checkbox" checked={!!coches[`${cle}.${i}`]} onChange={ev => basculer(`${cle}.${i}`, ev.target.checked)} />
                  <span>
                    <span className="import-titre"><b>{principal(e)}</b>{e.present ? <span className="tag">déjà présent</span> : <span className="tag ok">nouveau</span>}</span>
                    <span className="muted small">{detail(e)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
          <div className="parcours-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setProposition(null)}>Annuler</button>
            <button type="button" className="btn btn-primary" onClick={ajouter} disabled={!nombre}>Ajouter la sélection ({nombre})</button>
          </div>
        </>
      )}
    </div>
  );
}
