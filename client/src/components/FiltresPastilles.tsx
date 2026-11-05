// ANCHOR: rangée de filtres à pastilles partagée par Offres (catégories) et Candidatures (statuts) : point de couleur, libellé, compteur en simple texte
// NOTE: items = [{ cle, libelle, couleur, nombre }]
export default function FiltresPastilles({ items, valeur, onChange, label }) {
  return (
    <div className="chips chips-compact" role="group" aria-label={label}>
      {items.map(i => (
        <button key={i.cle} type="button" className={'chip' + (valeur === i.cle ? ' on' : '')} style={{ '--c': i.couleur }} aria-pressed={valeur === i.cle} title={i.libelle} onClick={() => onChange(i.cle)}>
          <span className="dot" /><span className="chip-libelle">{i.libelle}</span> <span className="count">{i.nombre}</span>
        </button>
      ))}
    </div>
  );
}
