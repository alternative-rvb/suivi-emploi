import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TYPES_FORMATION as VALEURS_TYPE } from '../../../lib/listes.mjs';
import { MOIS_NOMS, erreurPeriode, periodeFormation } from '../../../lib/periode.mjs';
import Select from './Select.tsx';
import Etiquettes, { type Etiquette } from './Etiquettes.tsx';

// NOTE: valeurs tirées de lib/listes.mjs (celles que le serveur accepte), seuls les libellés vivent ici
const LIBELLES_TYPE = { diplome: 'Diplôme', titre_pro: 'Titre enseigné', certification: 'Certification' };
export const TYPES_FORMATION = VALEURS_TYPE.map(k => [k, LIBELLES_TYPE[k] ?? k]);

// ANCHOR: deux listes distinctes de la table formations (ligne 110), pour qu'un titre enseigné ne passe jamais pour un diplôme de l'utilisateur :
// « obtenus » (diplômes et certifications détenus) et « enseignes » (titres professionnels sur lesquels il intervient comme formateur)
const GENRES = {
  obtenus: {
    titre: 'Diplômes et certifications',
    aide: "Diplômes obtenus et certifications détenues. Seule cette liste est présentée comme vos diplômes, dans le CV comme dans l'analyse par l'IA.",
    types: TYPES_FORMATION.filter(([k]) => k !== 'titre_pro'),
    colonnes: [['etablissement', 'Établissement'], ['lieu', 'Ville (dép.)'], ['periode', 'Dates'], ['note', 'Remarques']],
    placeholder: 'Nouveau diplôme ou certification',
    vide: 'Aucun diplôme ni certification.',
  },
  enseignes: {
    titre: 'Titres enseignés',
    aide: "Titres professionnels sur lesquels vous intervenez en tant que formateur, avec les compétences du Profil que vous y enseignez. Ce ne sont pas vos diplômes : ils ne sont jamais présentés comme tels, et l'analyse par l'IA ne les lit pas.",
    types: null,
    colonnes: [['etablissement', 'Organisme'], ['periode', 'Dates'], ['note', 'Remarques']],
    matieres: true,
    multiple: 'etablissement',
    placeholder: 'Nouveau titre enseigné',
    vide: 'Aucun titre enseigné.',
  },
};

// ANCHOR: matières enseignées (ligne 111) : sélection multiple de compétences du Profil (formation_competences), niveau « enseigner » affiché ;
// matieres ne garde que les anciennes matières en texte libre qu'aucune compétence ne reprenait sans ambiguïté, à reclasser
function Matieres({ t, competences, modifier }) {
  const [texte, setTexte] = useState('');
  const parId = new Map<string, any>(competences.map(c => [c.id, c]));
  const liees: string[] = t.competences ?? [];
  const reste = (t.matieres ?? '').split(',').map(m => m.trim()).filter(Boolean);
  // NOTE: les compétences les plus enseignables d'abord
  const options = competences.filter(c => !liees.includes(c.id)).sort((a, b) => (b.enseigner ?? -1) - (a.enseigner ?? -1)).map(c => c.competence);
  const lier = v => {
    const c = competences.find(k => k.competence === v);
    if (c && !liees.includes(c.id)) modifier(t.id, 'competences', [...liees, c.id]);
    setTexte('');
  };
  const items: Etiquette[] = [
    ...liees.map(id => {
      const c = parId.get(id);
      const sansNiveau = !c?.enseigner;
      return {
        cle: 'c:' + id, libelle: c?.competence ?? id, classe: sansNiveau ? 'matiere-sans-niveau' : '',
        titre: sansNiveau ? 'Niveau « enseigner » vide ou à 0 dans Profil > Compétences' : `Enseigner ${c.enseigner}/5`,
        contenu: <>{c?.competence ?? id}{!sansNiveau && <span className="muted"> {c.enseigner}/5</span>}</>,
      };
    }),
    ...reste.map(m => ({ cle: 'm:' + m, libelle: m, classe: 'matiere-a-reclasser', titre: 'Ancienne matière en texte libre : choisir la compétence correspondante puis la retirer', contenu: `À reclasser : ${m}` })),
  ];
  const retirer = (cle: string) => cle.startsWith('c:')
    ? modifier(t.id, 'competences', liees.filter(k => k !== cle.slice(2)))
    : modifier(t.id, 'matieres', reste.filter(x => x !== cle.slice(2)).join(', '));
  return <Etiquettes className="matieres" champ="cell" items={items} retirer={retirer} texte={texte} setTexte={setTexte} ajouter={lier} options={options} placeholder="Ajouter une compétence..." label={`Compétences enseignées ${t.titre}`} />;
}

// ANCHOR: organismes d'un titre enseigné (ligne 113) : étiquettes rangées dans etablissement, séparées par des virgules ; suggestions fournies, saisie libre acceptée
export const listeOrganismes = (texte: string) => (texte ?? '').split(',').map(o => o.trim()).filter(Boolean);

function Organismes({ t, options, modifier }) {
  const [texte, setTexte] = useState('');
  const choisis = listeOrganismes(t.etablissement);
  const ajouter = v => {
    const o = v.replace(/,/g, ' ').trim();
    if (o && !choisis.some(x => x.toLowerCase() === o.toLowerCase())) modifier(t.id, 'etablissement', [...choisis, o].join(', '));
    setTexte('');
  };
  const items: Etiquette[] = choisis.map(o => ({ cle: o, libelle: o, contenu: o }));
  return <Etiquettes className="matieres" champ="cell" items={items} retirer={o => modifier(t.id, 'etablissement', choisis.filter(x => x !== o).join(', '))} texte={texte} setTexte={setTexte} ajouter={ajouter} options={options.filter(o => !choisis.includes(o))} placeholder="Ajouter un organisme..." label={`Organismes ${t.titre}`} />;
}

// ANCHOR: dates d'une formation (ligne 112) : année (4 chiffres) et mois facultatif, stockés AAAA ou AAAA-MM dans debut et fin ;
// fin vide avec un début = en cours, un diplôme n'a le plus souvent que la fin (année d'obtention)
function DateFormation({ valeur, onChange, libelle }) {
  const [annee, setAnnee] = useState(valeur.slice(0, 4));
  const mois = valeur.slice(5, 7);
  // NOTE: la saisie partielle (20, 200) reste locale, seule une année complète ou vide est enregistrée
  useEffect(() => setAnnee(valeur.slice(0, 4)), [valeur]);
  const saisir = (texte: string) => {
    const a = texte.replace(/\D/g, '').slice(0, 4);
    setAnnee(a);
    if (a === '') onChange('');
    else if (a.length === 4) onChange(mois ? `${a}-${mois}` : a);
  };
  const choisirMois = (m: string) => { if (annee.length === 4) onChange(m ? `${annee}-${m}` : annee); };
  return (
    <span className="date-formation">
      <span className="muted small">{libelle}</span>
      <Select className="select-sm" value={mois} onChange={e => choisirMois(e.target.value)} disabled={annee.length !== 4}
        options={[['', 'Mois'], ...MOIS_NOMS.map((n, i) => [String(i + 1).padStart(2, '0'), n])]} aria-label={`Mois, ${libelle.toLowerCase()}`} />
      <input className="input cell date-annee" inputMode="numeric" placeholder="AAAA" value={annee} onChange={e => saisir(e.target.value)} aria-label={`Année, ${libelle.toLowerCase()}`} />
    </span>
  );
}

function Periode({ t, modifier }) {
  const erreur = erreurPeriode(t);
  return (
    <div className="periode-formation">
      <DateFormation libelle="Début" valeur={t.debut ?? ''} onChange={v => modifier(t.id, 'debut', v)} />
      <DateFormation libelle="Fin" valeur={t.fin ?? ''} onChange={v => modifier(t.id, 'fin', v)} />
      {erreur ? <p className="err small">{erreur}</p> : <p className="muted small" title="Début vide : année d'obtention. Fin vide avec un début : en cours.">{periodeFormation(t) || 'Dates à préciser'}</p>}
    </div>
  );
}

export default function Formations({ formations, competences = [], experiences = [] as any[], maj, genre = 'obtenus' }) {
  const g = GENRES[genre];
  const [nouveau, setNouveau] = useState({ titre: '', etablissement: '', type: g.types ? 'diplome' : 'titre_pro' });
  const lignes = formations.filter(t => (t.type === 'titre_pro') === (genre === 'enseignes'));
  // NOTE: organismes déjà saisis puis employeurs des expériences de formateur, sans doublon
  const organismes = [...new Set([...lignes.flatMap(t => listeOrganismes(t.etablissement)), ...experiences.filter(x => x.type === 'formateur').map(x => x.employeur.trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'fr'));

  const modifier = (id, cle, valeur) => maj({ formations: formations.map(t => (t.id === id ? { ...t, [cle]: valeur } : t)) });
  const supprimer = id => maj({ formations: formations.filter(t => t.id !== id) });
  const ajouter = () => {
    const titre = nouveau.titre.trim();
    if (!titre) return;
    let n = formations.length + 1;
    while (formations.some(t => t.id === 't' + n)) n++;
    const ordre = Math.max(-1, ...formations.map((t, i) => t.ordre ?? i)) + 1;
    maj({ formations: [...formations, { id: 't' + n, type: nouveau.type, titre, etablissement: nouveau.etablissement.trim(), debut: '', fin: '', matieres: '', note: '', ordre, competences: [] }] });
    setNouveau(v => ({ ...v, titre: '', etablissement: '' }));
  };

  return (
    <section aria-labelledby={`titre-formations-${genre}`}>
      <h2 id={`titre-formations-${genre}`} className="panel-title">{g.titre}</h2>
      <p className="muted small lead">{g.aide} Les champs sont modifiables directement et l'enregistrement est automatique.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Intitulé</th>{g.types && <th>Type</th>}{g.colonnes.map(([, l]) => <th key={l}>{l}</th>)}{g.matieres && <th>Compétences enseignées</th>}<th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {lignes.length === 0 && <tr><td colSpan={g.colonnes.length + (g.types ? 3 : 2) + (g.matieres ? 1 : 0)}>{g.vide}</td></tr>}
            {lignes.map(t => (
              <tr key={t.id}>
                <td className="strong">{t.titre}</td>
                {g.types && <td><Select className="select-sm" value={t.type} onChange={e => modifier(t.id, 'type', e.target.value)} options={g.types} aria-label={`Type ${t.titre}`} /></td>}
                {g.colonnes.map(([cle, l]) => cle === g.multiple ? <td key={cle}><Organismes t={t} options={organismes} modifier={modifier} /></td> : cle === 'periode' ? <td key={cle}><Periode t={t} modifier={modifier} /></td> : (
                  <td key={cle}><input className="input cell" value={t[cle] ?? ''} onChange={e => modifier(t.id, cle, e.target.value)} aria-label={`${l} ${t.titre}`} /></td>
                ))}
                {g.matieres && <td><Matieres t={t} competences={competences} modifier={modifier} /></td>}
                <td><button type="button" className="btn btn-ghost small icon" onClick={() => supprimer(t.id)} aria-label={`Supprimer ${t.titre}`} title="Supprimer cette ligne"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={'add-row' + (g.types ? ' add-row-4' : '')}>
        <input className="input" placeholder={g.placeholder} value={nouveau.titre} onChange={e => setNouveau(v => ({ ...v, titre: e.target.value }))} />
        <input className="input" placeholder={g.colonnes[0][1]} value={nouveau.etablissement} onChange={e => setNouveau(v => ({ ...v, etablissement: e.target.value }))} onKeyDown={e => e.key === 'Enter' && ajouter()} />
        {g.types && <Select value={nouveau.type} onChange={e => setNouveau(v => ({ ...v, type: e.target.value }))} options={g.types} aria-label="Type du nouvel élément" />}
        <button type="button" className="btn btn-primary" onClick={ajouter}>Ajouter</button>
      </div>
    </section>
  );
}
