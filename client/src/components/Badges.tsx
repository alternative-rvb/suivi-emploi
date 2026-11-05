import { badgesFamille, FAMILLES, grade, GRADES, niveauFamille, NIVEAUX } from '../progression.ts';
import { Bell, BellOff } from 'lucide-react';
import { useState } from 'react';
import { useMemoire } from '../utils.ts';
import { EcussonGrade, MedailleBadge } from './Insignes.tsx';
import { CLE_NOTIFS } from './Succes.tsx';
import BlocRepliable from './BlocRepliable.tsx';

// ANCHOR: partie Badges du Profil (ligne 85) : l'échelle complète des grades, puis chaque famille de badges sur ses trois niveaux
export default function Badges({ progression }) {
  const { periodes, stats } = progression;
  const g = grade(stats.envoyees);
  const disponible = typeof Notification !== 'undefined';
  const [notifs, setNotifs] = useMemoire(CLE_NOTIFS, false);
  const [permission, setPermission] = useState(disponible ? Notification.permission : 'denied');
  const actives = notifs && permission === 'granted';

  // ANCHOR: la permission se demande sur un clic (exigence des navigateurs), puis une notification de test confirme le réglage
  const basculerNotifs = async () => {
    if (actives) { setNotifs(false); return; }
    const p = permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermission(p);
    if (p !== 'granted') return;
    setNotifs(true);
    try { new Notification('Notifications de succès activées', { body: 'Vos prochains grades et badges s\'afficheront ici.', icon: '/favicon.svg' }); } catch { /* sans effet : le réglage reste actif */ }
  };

  // NOTE: tout le détail est replié par défaut, les badges gagnés sont déjà sous la lecture du Profil (ProfilIa)
  return (
    <BlocRepliable id="badges-detail" memoire="profil" titre="Notifications, grades et badges">
    <div className="badges">
      <div className="carte badges-notifs">
        <div>
          <b>Notifications de succès</b>
          <span className="muted small">
            {!disponible ? 'Ce navigateur ne propose pas de notifications.'
              : permission === 'denied' ? 'Notifications bloquées pour ce site : autorisez-les dans les réglages du navigateur (icône à gauche de l\'adresse).'
                : actives ? 'Activées : chaque nouveau grade, badge ou objectif de semaine s\'affiche aussi en notification du système, tant que l\'app est ouverte dans un onglet.'
                  : 'Recevoir une notification du système à chaque nouveau grade, badge ou objectif de semaine. Rien ne sort de la machine.'}
          </span>
        </div>
        {disponible && permission !== 'denied' && (
          <button type="button" className={'btn small ' + (actives ? 'btn-ghost' : 'btn-primary')} onClick={basculerNotifs}>
            {actives ? <><BellOff size={15} />Désactiver</> : <><Bell size={15} />Activer</>}
          </button>
        )}
      </div>

      <div className="carte">
        <h3 className="carte-titre">Grades</h3>
        <p className="muted small">Un grade par palier de candidatures envoyées : bronze, argent puis or, jusqu'au grade suprême. Vous en êtes à {stats.envoyees}.</p>
        <ol className="badges-grades">
          {GRADES.map((gr, rang) => {
            const obtenu = rang <= g.rang;
            return (
              <li key={gr.seuil} className={(obtenu ? 'ok' : '') + (rang === g.rang ? ' actuel' : '')}>
                <EcussonGrade rang={rang} obtenu={obtenu} taille={44} />
                <div>
                  <b>{gr.titre}</b>
                  <span className="muted small">{gr.seuil === 0 ? 'Au départ' : `Dès ${gr.seuil} candidature${gr.seuil > 1 ? 's' : ''}`}{obtenu ? ` · ${gr.mot}` : ''}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="carte">
        <h3 className="carte-titre">Badges</h3>
        <p className="muted small">Chaque effort a sa famille, sur trois niveaux : apprenti, confirmé, émérite.{periodes == null ? ' Chargement du journal...' : ''}</p>
        <ul className="badges-familles">
          {FAMILLES.map(f => {
            const n = niveauFamille(f, stats);
            const valeur = f.cle(stats);
            const suivant = f.seuils[n];
            const depart = n ? f.seuils[n - 1] : 0;
            const part = suivant ? Math.round(((valeur - depart) / (suivant - depart)) * 100) : 100;
            return (
              <li key={f.id}>
                <div className="badges-medailles">
                  {badgesFamille(f).map(b => <MedailleBadge key={b.id} famille={f.id} niveau={b.niveau} obtenu={b.niveau <= n} taille={48} titre={b.titre} />)}
                </div>
                <div className="badges-texte">
                  <b>{n ? `${f.role} ${NIVEAUX[n - 1]}` : f.role}</b>
                  <span className="muted small">{n ? f.mots[n - 1] : 'Pas encore de badge dans cette famille.'}</span>
                  <div className="prog-barre" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={part}><span style={{ width: part + '%' }} /></div>
                  <span className="muted small">{suivant ? `${valeur}/${suivant} pour le niveau suivant` : 'Niveau maximal atteint.'}{f.id === 'serie' ? ' Record de jours actifs consécutifs, week-end compris : il ne se perd jamais.' : ''}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
    </BlocRepliable>
  );
}
