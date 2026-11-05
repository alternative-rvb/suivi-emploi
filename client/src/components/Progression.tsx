import { Check, Target, Trophy } from 'lucide-react';
import { SqListe } from './Squelettes.tsx';
import { useEffect } from 'react';
import { avancementDefi, badgesObtenus, choisirDefis, DEFIS, defiFait, envoyeesSemaine, FAMILLES, grade, niveauFamille, NIVEAUX, OBJECTIF_JOURS, PREFIXE_DEFI, QUOTA_SEMAINE, semaine, TOUS_BADGES } from '../progression.ts';
import { aujourdhui, nouvelId, useMemoire } from '../utils.ts';
import { EcussonGrade, MedailleBadge } from './Insignes.tsx';

// ANCHOR: défis du jour et progression (ligne 85). offresNonVues vaut null tant que les offres ne sont pas chargées : les défis attendent pour être choisis.
export default function Progression({ etat, maj, progression, offresNonVues, aRelancer, enRetard, allerProfil }) {
  const { candidatures, taches, echanges } = etat;
  const auj = aujourdhui();
  const { periodes, stats } = progression;
  const [memo, setMemo] = useMemoire('defis.jour', { jour: '', ids: [] as string[] });

  const rapportJour = periodes?.find(p => p.periode === auj) ?? null;
  const contexte = { auj, candidatures, taches, echanges, rapportJour, offresNonVues: offresNonVues ?? 0, aRelancer, enRetard };

  // ANCHOR: défis figés au premier affichage de la journée, pour qu'un défi réussi ne disparaisse pas parce que la situation a changé
  useEffect(() => {
    if (memo.jour !== auj && offresNonVues != null) setMemo({ jour: auj, ids: choisirDefis(contexte) });
  }, [auj, memo.jour, offresNonVues]);
  const defis = (memo.jour === auj ? memo.ids : []).map(id => DEFIS[id]).filter(Boolean);
  const reussis = defis.filter(d => defiFait(d, contexte));
  const faits = reussis.length;
  // ANCHOR: défi réussi noté pour le badge Relève-défis, même s'il est ensuite décoché (le succès obtenu ne se retire pas)
  useEffect(() => { if (reussis.length) progression.noterDefis(reussis.map(d => `${auj}:${d.id}`)); }, [auj, reussis.map(d => d.id).join()]);

  const sem = semaine(auj, periodes ?? []);
  const g = grade(stats.envoyees);
  const nSemaine = envoyeesSemaine(candidatures, auj);
  const obtenus = badgesObtenus(stats);
  // NOTE: prochain badge le plus proche en proportion, pour donner un but atteignable
  const prochain = TOUS_BADGES.filter(b => b.famille.cle(stats) < b.seuil && b.niveau === niveauFamille(b.famille, stats) + 1).sort((a, b) => b.famille.cle(stats) / b.seuil - a.famille.cle(stats) / a.seuil)[0];

  const basculer = d => {
    const titre = PREFIXE_DEFI + d.titre;
    maj(e => {
      const existante = e.taches.find(t => t.faite && t.creee === auj && t.titre === titre);
      if (existante) return { taches: e.taches.filter(t => t.id !== existante.id) };
      return { taches: [...e.taches, { id: nouvelId(), candidature_id: null, titre, echeance: auj, faite: true, creee: auj }] };
    });
  };

  const envoyees = stats.envoyees;
  const part = g.suivant ? Math.round(((envoyees - g.actuel.seuil) / (g.suivant.seuil - g.actuel.seuil)) * 100) : 100;

  return (
    <div className="auj-progression">
      <div className="carte">
        <h3 className="carte-titre"><Target size={17} aria-hidden="true" />Défis du jour<span className="prog-compte">{faits}/{defis.length || 3}</span></h3>
        {defis.length === 0 && <div className="sqz" aria-busy="true" role="status" aria-label="Préparation des défis"><SqListe n={3} label="" /></div>}
        <ul className="auj-liste">
          {defis.map(d => {
            const [n, sur] = avancementDefi(d, contexte);
            const fait = n >= sur;
            return (
              <li key={d.id} className={'auj-ligne prog-defi' + (fait ? ' fait' : '')}>
                <span className="prog-coche" aria-hidden="true">{fait && <Check size={14} />}</span>
                <div className="auj-ligne-corps">
                  <span className="auj-ligne-titre">{d.titre}</span>
                  <span className="muted small">{d.pourquoi}</span>
                </div>
                {d.manuel
                  ? <button type="button" className={'btn small ' + (fait ? 'btn-ghost' : 'btn-primary')} onClick={() => basculer(d)}>{fait ? 'Annuler' : 'Fait'}</button>
                  : sur > 1 && <span className="auj-date">{n}/{sur}</span>}
              </li>
            );
          })}
        </ul>
        {defis.length > 0 && faits === defis.length && <p className="prog-bravo">Les trois défis sont relevés. La journée est gagnée, le reste est du bonus.</p>}
      </div>

      <div className="carte">
        <h3 className="carte-titre"><Trophy size={17} aria-hidden="true" />Ma progression</h3>
        <div className="prog-semaine" aria-label={`${sem.actifs} jours actifs sur ${OBJECTIF_JOURS} cette semaine`}>
          {sem.jours.map(j => (
            <span key={j.jour} className={'prog-jour' + (j.actif ? ' actif' : '') + (j.weekend ? ' weekend' : '') + (j.jour === auj ? ' auj' : '')} title={j.weekend ? 'Week-end : en bonus' : undefined}>{j.nom}</span>
          ))}
        </div>
        <p className="small">
          {sem.atteint
            ? <b>Objectif de la semaine atteint{sem.bonus ? `, plus ${sem.bonus} j de bonus` : ''}.</b>
            : <>Objectif : <b>{sem.actifs}/{OBJECTIF_JOURS}</b> jours actifs en semaine. Le week-end compte en bonus, aucune série à perdre.</>}
        </p>

        <p className="small">
          {nSemaine >= QUOTA_SEMAINE
            ? <b>Quota de candidatures atteint : {nSemaine}/{QUOTA_SEMAINE} cette semaine.</b>
            : <>Candidatures de la semaine : <b>{nSemaine}/{QUOTA_SEMAINE}</b>, ciblées et adaptées, pas en masse.</>}
        </p>

        <div className="prog-grade">
          <EcussonGrade rang={g.rang} taille={44} />
          <div>
            <b>{g.actuel.titre}</b>
            <span className="muted small">{g.actuel.mot}</span>
          </div>
        </div>
        {g.suivant
          ? (
            <div className="prog-barre-bloc">
              <div className="prog-barre" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={part}><span style={{ width: part + '%' }} /></div>
              <span className="muted small">{envoyees} candidatures envoyées, prochain grade à {g.suivant.seuil} : {g.suivant.titre}</span>
            </div>
          )
          : <span className="muted small">Grade suprême atteint avec {envoyees} candidatures.</span>}

        <div className="prog-badges">
          {FAMILLES.map(f => niveauFamille(f, stats)).some(n => n > 0) && (
            <div className="prog-badges-liste">
              {FAMILLES.map(f => { const n = niveauFamille(f, stats); return n > 0 && <MedailleBadge key={f.id} famille={f.id} niveau={n} taille={34} titre={`${f.role} ${NIVEAUX[n - 1]}`} />; })}
            </div>
          )}
          <span className="muted small">
            Badges : {obtenus.length}/{TOUS_BADGES.length}{prochain && <> · prochain : {prochain.titre} ({prochain.famille.cle(stats)}/{prochain.seuil})</>}
          </span>
          {allerProfil && <button type="button" className="lien small" onClick={allerProfil}>Voir tous les badges</button>}
        </div>
      </div>
    </div>
  );
}
