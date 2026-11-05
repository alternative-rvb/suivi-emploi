import { Download, Eye, History, Trash2 } from 'lucide-react';
import { fmtDate } from '../utils.ts';
import BlocRepliable from './BlocRepliable.tsx';

// ANCHOR: liste repliable des versions exportées (CV et lettres), même présentation : nom, entreprise liée, date, écarts du contrôle, fichiers à rouvrir, suppression
// NOTE: fichiers(v) rend les liens propres au type de document : { href, titre, nom, voir? } ; sans voir, le lien télécharge le fichier sous le nom donné
export type FichierVersion = { href: string; titre: string; libelle: string; telecharger?: string };

export default function VersionsListe({ id, memoire, titre, versions, candidatures, fichiers, retirer }: {
  id: string; memoire: string; titre: string; versions: any[]; candidatures: any[]; fichiers: (v: any) => FichierVersion[]; retirer: (v: any) => void;
}) {
  if (!versions.length) return null;
  return (
    <BlocRepliable id={id} memoire={memoire} titre={titre} Icone={History} pastille={<span className="count">{versions.length}</span>}>
      <ul className="cv-versions">
        {versions.map(v => {
          const cand = v.candidature_id && candidatures.find(c => c.id === v.candidature_id);
          return (
            <li key={v.id}>
              <span><strong>{v.nom}</strong> <span className="muted small">{cand ? `${cand.entreprise}, ` : ''}{fmtDate(v.cree_le.slice(0, 10))}{v.ecarts ? `, ${v.ecarts} écart${v.ecarts > 1 ? 's' : ''}` : ''}</span></span>
              <span className="btn-group">
                {fichiers(v).map(f => f.telecharger
                  ? <a key={f.href + f.titre} className="btn btn-ghost small icon" href={f.href} download={f.telecharger} title={f.titre} aria-label={f.libelle}><Download size={15} /></a>
                  : <a key={f.href + f.titre} className="btn btn-ghost small icon" href={f.href} target="_blank" rel="noopener" title={f.titre} aria-label={f.libelle}><Eye size={15} /></a>)}
                <button type="button" className="btn btn-ghost small icon" onClick={() => retirer(v)} title="Supprimer la version" aria-label={`Supprimer ${v.nom}`}><Trash2 size={15} /></button>
              </span>
            </li>
          );
        })}
      </ul>
    </BlocRepliable>
  );
}
