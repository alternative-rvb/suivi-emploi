import { useEffect, useState } from 'react';
import { SqCarte } from './Squelettes.tsx';
import { chargerVeille } from '../api.ts';
import { CONTRATS } from '../constants.ts';

// ANCHOR: filtres de la veille, explication en lecture seule (les listes modifiables sont dans Réglages de recherche) : copie locale de la configuration de la veille n8n, réutilisée par le provider France Travail direct
export default function Veille() {
  const [d, setD] = useState<any>(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => { chargerVeille().then(setD).catch(e => setErreur(e.message)); }, []);

  if (erreur) return <p className="empty">Filtres indisponibles : {erreur}</p>;
  if (!d) return <SqCarte lignes={6} label="Chargement des filtres de la veille" />;
  const c = d.config;
  if (!c) return <p className="empty">Aucune synchro réussie depuis la mise à jour : cliquer sur Actualiser dans l'onglet Offres.</p>;
  const s = c.stats || {};
  const nb = n => (n == null ? '' : ` (${n})`);

  return (
    <div className="veille">
      <div className="carte">
        <h3 className="carte-titre">Fonctionnement de la recherche</h3>
        <p className="muted small">Configuration lue à la synchro du {new Date(c.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}. Pour la modifier, demander à Claude : la copie vient de la base de veille n8n.</p>
        <ol className="veille-etapes">
          <li><b>{c.provider === 'n8n' ? 'Recherche toutes les 4 heures (veille n8n)' : 'Recherche à chaque synchro'}</b> : via l'API France Travail ({c.plateformes.length > 1 ? `plateformes actives : ${c.plateformes.join(', ')}` : 'seule plateforme active'}), chacun des {c.mots_cles.length} mots-clés dans chacun des départements ({c.zones.join(', ')}), offres publiées depuis 31 jours, {c.provider === 'n8n' ? '50 résultats au plus par recherche' : 'toutes les pages de résultats (1000 au plus par recherche)'}.</li>
          <li><b>Contrats écartés</b> : {c.contrats_exclus.map(x => CONTRATS[x] || x).join(', ') || 'aucun'}.</li>
          <li><b>Hors sujet</b> : l'intitulé doit contenir au moins un mot de 5 lettres ou plus du mot-clé cherché (« formateur web » garde les titres contenant « formateur »){c.entreprises.length > 0 && <>, sauf pour les offres publiées par les employeurs surveillés ({c.entreprises.join(', ')})</>}.</li>
          <li><b>Mots exclus</b> : un intitulé qui contient l'un des {c.mots_exclus.length} mots exclus est écarté. Les offres restantes partent sur Discord et dans la base de veille.</li>
          <li><b>Dans l'app, à chaque synchro</b> : offres de plus de {d.app.jours_max} jours retirées{nb(s.anciennes)}, hors zone{nb(s.hors_zone)}, puis les mêmes mots exclus et quelques intitulés toujours écartés ({d.app.exclus_toujours.join(', ')}){nb(s.exclues)}. {s.retenues != null && <>Résultat : {s.retenues} offres gardées.</>}</li>
          <li><b>Classement</b> : catégorie d'après l'intitulé, puis score de pertinence (métier visé, compétences du Profil trouvées dans l'annonce, proximité, fraîcheur).</li>
        </ol>
      </div>

    </div>
  );
}
