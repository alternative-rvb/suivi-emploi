// ANCHOR: lecture d'un CSV (guillemets doublés, retours à la ligne dans les champs, BOM retiré), utilisée par l'import LinkedIn

// Texte CSV vers tableau de lignes (tableaux de cellules)
export function lignesCsv(texte) {
  const brut = texte.replace(/^﻿/, '');
  const lignes = [];
  let l = [], c = '', q = false;
  for (let i = 0; i < brut.length; i++) {
    const x = brut[i];
    if (q) {
      if (x === '"') { if (brut[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += x;
    } else if (x === '"') q = true;
    else if (x === ',') { l.push(c); c = ''; }
    else if (x === '\n') { l.push(c); lignes.push(l); l = []; c = ''; }
    else if (x !== '\r') c += x;
  }
  if (c || l.length) { l.push(c); lignes.push(l); }
  return lignes;
}

// Texte CSV vers objets, la première ligne donnant les noms de colonnes
export function lireCsvTexte(texte) {
  const [h = [], ...corps] = lignesCsv(texte);
  return corps.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
