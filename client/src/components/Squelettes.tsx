import { SqGabarit } from '../gabarit.tsx';
// ANCHOR: squelettes de chargement (barres grises animées, voir .sq dans style.css) : ils occupent la place du contenu à venir pour que les blocs ne bougent pas à l'arrivée des données
// NOTE: la classe .sqz sur le conteneur donne aux barres une teinte translucide, lisible en thème clair comme sombre

/** Barre grise : largeur et hauteur en CSS (px, %, rem) */
export const Sq = ({ l = '100%', h = 14, className = '', style }: { l?: string | number; h?: string | number; className?: string; style?: React.CSSProperties }) => <div className={'sq ' + className} style={{ width: l, height: h, margin: 0, ...style }} />;

/** n lignes de texte, la dernière plus courte */
export const SqLignes = ({ n = 3 }) => (
  <div className="sq-lignes">{Array.from({ length: n }, (_, i) => <Sq key={i} l={i === n - 1 && n > 1 ? '60%' : '100%'} />)}</div>
);

/** Carte avec un titre et n lignes ; label annonce le contenu attendu aux lecteurs d'écran */
export const SqCarte = ({ lignes = 3, label = 'Chargement' }) => (
  <div className="carte sqz" aria-busy="true" role="status" aria-label={label}>
    <Sq l="35%" h={18} />
    <SqLignes n={lignes} />
  </div>
);

/** Liste de lignes à deux niveaux (titre et détail), pour les listes d'offres, de candidatures ou de contacts */
export const SqListe = ({ n = 6, label = 'Chargement de la liste' }) => (
  <div className="sq-liste sqz" aria-busy="true" role="status" aria-label={label}>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="sq-rangee">
        <Sq l={i % 3 === 1 ? '70%' : '85%'} h={16} />
        <Sq l="45%" h={12} />
      </div>
    ))}
  </div>
);

/** Page en deux colonnes (liste et fiche), forme des onglets Offres, Candidatures et Contacts */
export const SqSplit = ({ label = 'Chargement' }) => (
  <section className="split sqz" aria-busy="true" role="status" aria-label={label}>
    <div className="split-liste">
      <Sq h={38} />
      <SqListe n={7} label="" />
    </div>
    <div className="split-detail">
      <div className="fiche">
        <Sq l="60%" h={26} />
        <Sq l="40%" h={14} />
        <SqLignes n={5} />
        <Sq l="30%" h={18} />
        <SqLignes n={6} />
      </div>
    </div>
  </section>
);

/** Bilan du jour : sections à titre et tuiles libellé + chiffre, comme la vraie carte */
export const SqBilan = ({ sections = 3, tuiles = 3 }) => (
  <div className="bilan-parties sqz" aria-busy="true" role="status" aria-label="Chargement du bilan">
    {Array.from({ length: sections }, (_, i) => (
      <section key={i}>
        <Sq l="30%" h={14} />
        <div className="bilan">
          {Array.from({ length: tuiles }, (_, j) => (
            <div key={j} className="bilan-item"><Sq l="60%" h={12} /><div style={{ height: 6 }} /><Sq l="35%" h={22} /></div>
          ))}
        </div>
      </section>
    ))}
  </div>
);

/** Journal : lignes heure + intitulé */
export const SqJournal = ({ n = 5 }) => (
  <div className="sq-liste sqz" aria-busy="true" role="status" aria-label="Chargement du journal">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Sq l={38} h={12} /><Sq l={i % 2 ? '70%' : '85%'} h={14} /></div>
    ))}
  </div>
);

const NB_ONGLETS = 8;

/** Page entière pour le premier chargement de l'état : en-tête (logo, titre, onglets, outils) puis la forme de l'accueil ou d'une liste selon l'onglet visé */
export const SqPage = () => {
  const page = window.location.hash.slice(1) || 'auj';
  const accueil = page === 'auj';
  return (
    <>
      <header className="topbar" aria-hidden="true">
        <div className="topbar-inner sqz">
          <Sq l={40} h={40} />
          <div style={{ display: 'grid', gap: 6 }}><Sq l={110} h={16} /><Sq l={170} h={11} /></div>
          <div style={{ display: 'flex', gap: 8, flex: 1, justifyContent: 'center' }}>
            {Array.from({ length: NB_ONGLETS }, (_, i) => <Sq key={i} l={84} h={30} />)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}><Sq l={70} h={30} /><Sq l={34} h={34} /></div>
        </div>
      </header>
      <main className="shell sqz" aria-busy="true" role="status" aria-label="Chargement de l'application">
        <SqGabarit page={page} repli={accueil ? (
          <>
            <div className="auj-epinglees-agenda" style={{ marginBottom: 16 }}>
              <div className="auj-colonne-gauche"><SqCarte lignes={3} /><SqCarte lignes={4} /><div className="auj-kpi">{[0, 1, 2, 3].map(i => <Sq key={i} h={86} />)}</div></div>
              <SqCarte lignes={3} />
            </div>
            <div className="carte auj-postuler">
              <Sq l="25%" h={18} />
              <div className="auj-postuler-colonnes" style={{ marginTop: 14 }}>
                {[0, 1, 2].map(c => <div key={c} className="sq-lignes"><Sq l="50%" h={16} /><Sq h={52} /><Sq h={52} /><Sq h={52} /></div>)}
              </div>
            </div>
            <div className="sq-grille" style={{ marginTop: 16 }}><SqCarte lignes={5} /><SqCarte lignes={5} /></div>
          </>
        ) : <SqSplit label="" />} />
      </main>
    </>
  );
};
