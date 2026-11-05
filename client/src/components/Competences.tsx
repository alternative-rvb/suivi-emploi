import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import ChampRecherche from './ChampRecherche.tsx';
import FiltresPastilles from './FiltresPastilles.tsx';
import { useEffect, useMemo, useState } from 'react';
import { avecCompetence } from '../competences.ts';
import Select from './Select.tsx';
import Suggestions from './Suggestions.tsx';
import { POIDS_MAX } from '../../../lib/cv.mjs';
import { METIERS_CV } from '../../../lib/listes.mjs';
import { CATEGORIES } from '../constants.ts';

const NIVEAUX = [null, 0, 1, 2, 3, 4, 5];

// NOTE: une note réduite à la mention « À valider » (ancienne proposition) n'est pas une justification
const justification = (note: string) => (note ?? '').replace(/À valider( \([^)]*\))?/g, '').replace(/^[\s;,]+|[\s;,]+$/g, '');

const LIB_IA = { aucune: 'sans IA', assistee: 'IA assistée', deleguee: 'IA déléguée' };

// NOTE: répartition de la part de l'IA sur les projets d'une compétence ; les projets non renseignés sont comptés à part
function resumeIa(liste: { nom: string; ia: string }[]) {
  if (!liste.length) return '';
  const n = (k: string) => liste.filter(p => p.ia === k).length;
  const morceaux: [number, string][] = [[n('aucune'), 'sans IA'], [n('assistee'), 'assistés'], [n('deleguee'), 'délégués'], [n(''), 'à renseigner']];
  const presents = morceaux.filter(([c]) => c > 0);
  return '· ' + presents.map(([c, l]) => `${c} ${l}`).join(', ');
}

export default function Competences({ competences, projets, maj, cible = '', cibleLue = () => {} }) {
  const [q, setQ] = useState('');
  // NOTE: arrivée depuis une étiquette du Parcours : la recherche est remplie avec la compétence, filtres remis à zéro
  useEffect(() => {
    if (!cible) return;
    setQ(cible); setDomaine('toutes'); setManque('tous'); cibleLue();
  }, [cible]);
  const [domaine, setDomaine] = useState('toutes');
  const [manque, setManque] = useState('tous');
  const [nouveau, setNouveau] = useState({ domaine: '', competence: '' });

  const domaines = useMemo<string[]>(() => [...new Set<string>(competences.map(s => s.domaine))], [competences]);
  // NOTE: renseignée = les deux niveaux posés et une note qui justifie l'expérience
  const sansNiveau = (s: any) => s.enseigner == null || s.executer == null;
  const sansNote = (s: any) => !justification(s.note);
  const nbSansNiveau = competences.filter(sansNiveau).length;
  const nbSansNote = competences.filter(sansNote).length;
  const restantes = competences.filter(s => sansNiveau(s) || sansNote(s)).length;

  // NOTE: nombre de projets par compétence, calculé depuis les liens des projets (jamais saisi)
  const projetsParCompetence = useMemo(() => {
    const m = new Map<string, { nom: string; ia: string }[]>();
    for (const p of projets ?? []) for (const id of p.competences) m.set(id, [...(m.get(id) ?? []), { nom: p.nom, ia: p.ia }]);
    return m;
  }, [projets]);

  const filtrees = competences.filter(s =>
    (domaine === 'toutes' || s.domaine === domaine) &&
    (manque === 'tous' || (manque === 'renseigner' && (sansNiveau(s) || sansNote(s))) || (manque === 'note' && sansNote(s)) || (manque === 'niveau' && sansNiveau(s))) &&
    (!q || `${s.competence} ${s.note} ${s.domaine}`.toLowerCase().includes(q.toLowerCase())));

  const noter = (id, cle, valeur) => {
    maj({ competences: competences.map(s => (s.id === id ? { ...s, [cle]: valeur === '' ? null : Number(valeur) } : s)) });
  };

    const modifier = (id, cle, valeur) => {
    maj({ competences: competences.map(s => (s.id === id ? { ...s, [cle]: valeur } : s)) });
  };

  // NOTE: poids facultatif par métier (vide = pas de poids, le CV suit le niveau seul) ; une valeur vide retire la clé du métier
  const peser = (id: string, metier: string, valeur: string) => {
    maj({ competences: competences.map(s => {
      if (s.id !== id) return s;
      const poids = { ...(s.poids ?? {}) };
      if (valeur === '') delete poids[metier]; else poids[metier] = Number(valeur);
      return { ...s, poids };
    }) });
  };

  const renommerDomaine = (ancien: string, nouveau: string) => {
    maj({ competences: competences.map(s => (s.domaine === ancien ? { ...s, domaine: nouveau } : s)) });
  };

  // NOTE: la suppression passe par la différence d'état (DELETE /api/competences/:id côté serveur, qui retire aussi les liens vers expériences, projets et formations)
  const supprimer = (s: any) => {
    const nb = projetsParCompetence.get(s.id)?.length ?? 0;
    if (!confirm(`Supprimer la compétence « ${s.competence} » ?${nb ? ` Elle est liée à ${nb} projet${nb > 1 ? 's' : ''} : les liens seront retirés.` : ''}`)) return;
    maj({ competences: competences.filter(x => x.id !== s.id) });
  };

  const ajouter = () => {
    const d = nouveau.domaine.trim();
    const c = nouveau.competence.trim();
    if (!d || !c) return;
    maj({ competences: avecCompetence(competences, d, c) });
    setNouveau(v => ({ ...v, competence: '' }));
  };

  // NOTE: lignes regroupées par domaine (ordre de première apparition), même si un domaine modifié sépare deux compétences voisines
  const groupes = [...new Set<string>(filtrees.map(s => s.domaine))].map(d => [d, filtrees.filter(s => s.domaine === d)] as const);
  return (
    <section aria-labelledby="titre-comp">
      <h2 id="titre-comp" className="panel-title">Compétences : enseigner / exécuter</h2>
      <p className="muted small lead">
        Le contexte justifie l'expérience : c'est lui qui a du poids, le score sur 5 reste indicatif (statistique). <b>Enseigner</b> : prêt à l'enseigner. <b>Exécuter</b> : opérationnel pour une mission ou un poste en entreprise. Ces scores serviront aux CV et à l'analyse des offres. Échelle : 5 = maîtrise, pratique régulière. 4 = solide. 3 = opérationnel avec un peu de préparation. 2 = notions, préparation sérieuse nécessaire. 1 = très peu ou jamais pratiqué. 0 = aucune connaissance. Tiret = non noté. Le nom, le domaine et le contexte se modifient sur place.
      </p>
      <p className="small" aria-live="polite"><b>{competences.length}</b> compétences, <b>{competences.length - restantes}</b> renseignées</p>
      {restantes > 0 ? (
        <p className="alerte-comp" role="status">
          <AlertTriangle size={16} />
          <span><b>{restantes}</b> compétence{restantes > 1 ? 's' : ''} à renseigner sur {competences.length} : <b>{nbSansNote}</b> sans note justificative, <b>{nbSansNiveau}</b> sans les deux niveaux.</span>
        </p>
      ) : (
        <p className="alerte-comp ok" role="status"><CheckCircle2 size={16} /><span>Toutes les compétences sont renseignées.</span></p>
      )}
      <div className="toolbar toolbar-row">
        <ChampRecherche className="search" placeholder="Filtrer les compétences..." value={q} onChange={e => setQ(e.target.value)} />
        <Select className="select-sm" value={domaine} onChange={e => setDomaine(e.target.value)} aria-label="Domaine" options={[['toutes', 'Tous les domaines'], ...domaines.map(d => [d, d])]} />
      </div>
      <FiltresPastilles label="Filtrer les compétences à renseigner" valeur={manque} onChange={setManque} items={[
        { cle: 'tous', libelle: 'Toutes', couleur: 'var(--c-grey)', nombre: competences.length },
        { cle: 'renseigner', libelle: 'À renseigner', couleur: 'var(--c-amber)', nombre: restantes },
        { cle: 'note', libelle: 'Sans note', couleur: 'var(--c-red)', nombre: nbSansNote },
        { cle: 'niveau', libelle: 'Sans niveau', couleur: 'var(--c-red)', nombre: nbSansNiveau },
      ]} />
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="table table-comp">
          <thead><tr><th>Compétence</th><th title="Capacité à enseigner">Enseigner</th><th title="Capacité à exécuter">Exécuter</th><th title="Nombre de projets du portfolio qui mobilisent la compétence">Projets</th><th title="Poids de 0 à 3 par métier, pour un CV de métier ou sur mesure (pas le CV général) : 3 en tête et protégée du plafond, 0 masquée (sauf si l'offre la demande). Vide : vaut 2, le niveau départage.">Poids</th><th>Contexte</th></tr></thead>
          <tbody>
            {filtrees.length === 0 && <tr><td colSpan={6}>Aucune compétence.</td></tr>}
            {groupes.flatMap(([d, liste]) => [
              <tr key={'d-' + d} className="group">
                <td colSpan={6}>
                  <input className="input input-nu input-domaine" defaultValue={d} aria-label={`Renommer le domaine ${d}`} size={Math.max(d.length, 8)}
                    onBlur={e => { const v = e.target.value.trim(); if (!v) e.target.value = d; else if (v !== d) renommerDomaine(d, v); }} />
                  <span className="muted"> ({liste.length})</span>
                </td>
              </tr>,
              ...liste.map(s => (
                <tr key={s.id}>
                  <td>
                    {(sansNote(s) || sansNiveau(s)) && (
                      <span className="alerte-ligne" title={[sansNote(s) && 'note justificative manquante', sansNiveau(s) && 'niveau manquant'].filter(Boolean).join(', ')}>
                        <AlertTriangle size={13} /> {[sansNote(s) && 'note', sansNiveau(s) && 'niveau'].filter(Boolean).join(' + ')}
                      </span>
                    )}
                    <textarea className="input input-nu comp-nom" rows={1} defaultValue={s.competence} aria-label="Compétence"
                      onBlur={e => { const v = e.target.value.trim(); if (!v) e.target.value = s.competence; else if (v !== s.competence) modifier(s.id, 'competence', v); }} />
                    <select className="comp-domaine" value={s.domaine} onChange={e => modifier(s.id, 'domaine', e.target.value)} aria-label={`Déplacer ${s.competence} vers un autre domaine`} title="Changer de domaine">
                      {domaines.map((x: string) => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <button type="button" className="btn btn-ghost small comp-suppr" onClick={() => supprimer(s)} aria-label={`Supprimer ${s.competence}`} title="Supprimer cette compétence"><Trash2 size={14} /></button>
                  </td>
                  {['enseigner', 'executer'].map(cle => (
                    <td key={cle}>
                      <span className="niveau-lib">{cle === 'enseigner' ? 'Enseigner' : 'Exécuter'}</span>
                      <select className={'level l' + (s[cle] ?? 'x')} value={s[cle] ?? ''} onChange={e => noter(s.id, cle, e.target.value)} aria-label={`${cle} ${s.competence}`}>
                        {NIVEAUX.map(n => <option key={String(n)} value={n ?? ''}>{n ?? '-'}</option>)}
                      </select>
                    </td>
                  ))}
                  <td>
                    <span className="niveau-lib">Projets</span>
                    <div className="comp-ia"><b>{projetsParCompetence.get(s.id)?.length ?? 0}</b> {resumeIa(projetsParCompetence.get(s.id) ?? [])}</div>
                    {/* NOTE: rappel des noms en ligne continue pour vérifier le rattachement, avec la part de l'IA entre parenthèses quand elle est renseignée */}
                    <p className="comp-projets">
                      {(projetsParCompetence.get(s.id) ?? []).map((p, i) => <span key={i}>{p.nom}{p.ia ? ` (${LIB_IA[p.ia] ?? p.ia})` : ''}</span>)}
                    </p>
                  </td>
                  <td>
                    <span className="niveau-lib">Poids</span>
                    <div className="comp-poids">
                      {METIERS_CV.map(m => (
                        <label key={m} className="comp-poids-metier" title={CATEGORIES[m]?.label ?? m}>
                          <span>{CATEGORIES[m]?.label ?? m}</span>
                          <select className="input poids-select" value={s.poids?.[m] ?? ''} onChange={e => peser(s.id, m, e.target.value)} aria-label={`Poids pour ${CATEGORIES[m]?.label ?? m} : ${s.competence}`}>
                            <option value="">-</option>
                            {Array.from({ length: POIDS_MAX + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="note-cell">
                    <textarea className="input input-nu" rows={2} defaultValue={s.note} aria-label={`Contexte de ${s.competence}`} placeholder="Contexte, remarque..."
                      onBlur={e => { if (e.target.value !== s.note) modifier(s.id, 'note', e.target.value); }} />
                  </td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <div className="add-row">
        <Suggestions placeholder="Domaine" value={nouveau.domaine} onChange={e => setNouveau(v => ({ ...v, domaine: e.target.value }))} options={domaines} />
        <input className="input" placeholder="Nouvelle compétence" value={nouveau.competence} onChange={e => setNouveau(v => ({ ...v, competence: e.target.value }))} onKeyDown={e => e.key === 'Enter' && ajouter()} />
        <button type="button" className="btn btn-primary" onClick={ajouter}>Ajouter</button>
      </div>
    </section>
  );
}
