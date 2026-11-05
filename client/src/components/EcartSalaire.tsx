import { useEffect, useState } from 'react';
import { chargerTrajets } from '../api.ts';
import { calculerEcart, libelleEcart } from '../ecart.ts';

// ANCHOR: écart entre le salaire (ou TJM) de l'offre et l'attente saisie dans Admin, du rouge au vert. Sans attente saisie, rien ne s'affiche.
export default function EcartSalaire({ salaire, trajets }: any) {
  const [charge, setCharge] = useState<any>(null);
  useEffect(() => {
    if (trajets) return;
    chargerTrajets().then(d => setCharge(d.trajets)).catch(() => {}); // NOTE: facultatif, sans réponse l'écart est simplement omis
  }, [trajets]);
  const t = trajets ?? charge;
  const e = t && calculerEcart(salaire, t.attente_annuelle, t.tjm);
  if (!e) return null;
  return <span className="ecart-salaire" style={{ color: e.couleur }} title={libelleEcart(e)}>{e.pourcent > 0 ? '+' : ''}{e.pourcent} %</span>;
}
