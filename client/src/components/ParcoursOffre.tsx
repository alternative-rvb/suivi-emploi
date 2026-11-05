import { Bookmark, Check, ExternalLink, Eye, FileText, FileQuestion, Send, Share2, ThumbsDown, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';

// ANCHOR: parcours d'une offre en étapes reliées par un trait (ligne 157) : Vue, Épingler (optionnel), Annonce, CV sur mesure, Postulé. Expirée et Écarter sortent du parcours.
// NOTE: l'annonce France Travail renvoie le plus souvent vers le site de l'employeur ou une autre plateforme : le lien « Postuler sur le site » apparaît une fois le CV fait,
// avec la plateforme saisie dans « Postuler via » et un rappel de vérification quand elle n'a jamais servi
export default function ParcoursOffre({ offre, lienAnnonce, candidature, cvFait, compteAcreer, plateformeNouvelle, postulerOuvert, estManuelle, actions }) {
  // NOTE: partage de l'annonce (titre, employeur, adresse) : feuille de partage du système quand elle existe, sinon copie dans le presse-papiers
  const [copiee, setCopiee] = useState('');
  const partager = async () => {
    if (!lienAnnonce) return;
    const texte = [offre.titre, offre.entreprise].filter(Boolean).join(' chez ');
    try {
      if (navigator.share) await navigator.share({ title: offre.titre, text: texte, url: lienAnnonce });
      else {
        await navigator.clipboard.writeText(`${texte}\n${lienAnnonce}`);
        setCopiee(offre.id_offre);
        setTimeout(() => setCopiee(''), 2000);
      }
    } catch (e) {
      if (e.name !== 'AbortError') alert('Partage impossible : ' + e.message);
    }
  };
  const postule = Boolean(candidature);
  const etapes = [
    { cle: 'vue', libelle: 'Vue', Icone: Eye, fait: Boolean(offre.vue), titre: offre.vue ? 'Vue : cliquer pour retirer (raccourci v)' : 'Marquer comme vue (raccourci v)', clic: actions.vue },
    { cle: 'epingle', libelle: offre.epinglee ? `Épinglée, ${offre.jours_epingle} j` : 'Épingler', Icone: Bookmark, fait: Boolean(offre.epinglee), optionnel: true, remplie: Boolean(offre.epinglee), titre: offre.epinglee ? `Épinglée, il reste ${offre.jours_epingle} jour(s) : cliquer pour retirer` : 'Optionnel : épingler pour 14 jours, à traiter ou elle retombe dans la purge', clic: actions.epingle },
    { cle: 'annonce', libelle: 'Annonce', Icone: ExternalLink, fait: Boolean(offre.vue), lien: lienAnnonce, titre: "Ouvre l'annonce (France Travail ou site d'origine, raccourci o)", clic: actions.annonce },
    { cle: 'cv', libelle: 'CV', Icone: FileText, fait: cvFait, titre: 'CV sur mesure : composer un CV ciblé sur cette offre', clic: actions.cv },
    { cle: 'postule', libelle: postule ? 'Postulé' : 'Postulé ?', Icone: Send, fait: postule, titre: postule ? 'Candidature créée : voir sa fiche' : 'Enregistrer la candidature (plateforme, date, relance)', clic: postule ? actions.candidature : actions.postule, ouvert: postulerOuvert },
  ];
  // NOTE: la prochaine étape à faire est mise en avant, les optionnelles n'en font pas partie
  const prochaine = etapes.find(e => !e.fait && !e.optionnel)?.cle;

  return (
    <div className="fiche-actions parcours-offre">
      <ol className="etapes" aria-label="Parcours de l'offre">
        {etapes.map(({ cle, libelle, Icone, fait, optionnel, remplie, lien, titre, clic, ouvert }, i) => {
          const classe = ['etape', fait && 'faite', optionnel && 'optionnelle', cle === prochaine && 'prochaine'].filter(Boolean).join(' ');
          const contenu = <>
            <span className="etape-rond">{fait && !remplie ? <Check size={13} aria-hidden="true" /> : <Icone size={13} fill={remplie ? 'currentColor' : 'none'} aria-hidden="true" />}</span>
            <span className="etape-lib">{libelle}</span>
          </>;
          return (
            <li key={cle} className={classe}>
              {i > 0 && <span className={'etape-trait' + (etapes[i - 1].fait && fait ? ' plein' : '')} aria-hidden="true" />}
              {lien
                ? <a className="etape-bouton" href={lien} target="_blank" rel="noopener noreferrer" onClick={clic} title={titre}>{contenu}</a>
                : <button type="button" className="etape-bouton" onClick={clic} title={titre} aria-pressed={cle === 'vue' || cle === 'epingle' ? fait : undefined} aria-expanded={ouvert}>{contenu}</button>}
            </li>
          );
        })}
      </ol>
      <div className="parcours-sorties" role="group" aria-label="Autres actions">
        {lienAnnonce && <button type="button" className="btn btn-ghost small" onClick={partager} title="Partager l'annonce (feuille de partage, sinon copie du lien)" aria-label="Partager l'annonce">{copiee === offre.id_offre ? <Check size={14} /> : <Share2 size={14} />}<span className="btn-lib">{copiee === offre.id_offre ? 'Copié' : 'Partager'}</span></button>}
        <button type="button" className={'btn btn-ghost small' + (offre.expiree ? ' on' : '')} aria-pressed={Boolean(offre.expiree)} onClick={actions.expiree} title={offre.expiree ? 'Annonce expirée : cliquer pour la remettre (raccourci x)' : 'Annonce plus disponible (raccourci x)'} aria-label="Expirée"><FileQuestion size={14} /><span className="btn-lib">Expirée</span></button>
        <button type="button" className="btn btn-ghost small" onClick={actions.ecarter} title={offre.ignoree ? 'Remettre dans la liste' : 'Écarter cette offre'} aria-label={offre.ignoree ? 'Remettre' : 'Écarter'}>{offre.ignoree ? <Undo2 size={14} /> : <ThumbsDown size={14} />}<span className="btn-lib">{offre.ignoree ? 'Remettre' : 'Écarter'}</span></button>
        {estManuelle && !postule && <button type="button" className="btn btn-danger small" onClick={actions.supprimer} aria-label="Supprimer"><Trash2 size={14} /><span className="btn-lib">Supprimer</span></button>}
      </div>
      {cvFait && !postule && lienAnnonce && (
        <p className="parcours-postuler small">
          <a className="lien" href={lienAnnonce} target="_blank" rel="noopener noreferrer" onClick={actions.annonce}>Postuler sur le site{offre.postuler_via ? ` (${offre.postuler_via})` : ''}<ExternalLink size={12} aria-hidden="true" /></a>
          {compteAcreer && <span className="warn">Compte à créer sur {compteAcreer} : prévoir quelques minutes.</span>}
          {plateformeNouvelle
            ? <span className="warn">Plateforme jamais utilisée : à vérifier avant d'envoyer.</span>
            : !offre.postuler_via && <span className="muted">France Travail redirige souvent ailleurs : notez la destination dans « Postuler via » plus bas.</span>}
        </p>
      )}
    </div>
  );
}
