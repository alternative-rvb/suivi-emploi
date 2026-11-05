// ANCHOR: boîte du lien entre une offre et sa candidature, identique des deux côtés (fiche d'offre et fiche de candidature)
// NOTE: couleur = couleur d'accent de ce que la boîte désigne : celle du statut pour une candidature, celle de la catégorie pour une offre (constants.ts)
// NOTE: titre = ce que la boîte désigne, infos = lignes = infos secondaires, children = boutons d'action
export default function BoiteLiee({ genre, couleur = '', titre, sous, infos = [], children }: any) {
  return (
    <aside className={'boite-liee' + (couleur ? ' boite-teintee' : '')} style={couleur ? { '--accent-boite': couleur } as any : undefined} aria-label={genre}>
      <span className="boite-genre"><span className="dot" />{genre}</span>
      <b className="boite-titre">{titre}</b>
      {sous && <span className="muted small">{sous}</span>}
      {infos.length > 0 && <span className="boite-infos small muted">{infos.filter(Boolean).join(' · ')}</span>}
      {children && <div className="fiche-actions">{children}</div>}
    </aside>
  );
}
