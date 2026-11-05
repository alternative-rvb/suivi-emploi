import { useEffect, useSyncExternalStore } from 'react';
import { chargerPlateformes } from './api.ts';
import { norm } from '../../lib/correspondance.mjs';

// ANCHOR: plateformes qui obligent à recréer un compte pour postuler (kv plateformes_compte, liste gérée dans l'Admin), partagées entre l'Admin et les offres sans passer par App
let liste: string[] = [];
let chargee = false;
const abonnes = new Set<() => void>();

export const definirPlateformes = (l: string[]) => {
  liste = l;
  chargee = true;
  abonnes.forEach(f => f());
};

export function usePlateformes(): string[] {
  useEffect(() => {
    if (!chargee) chargerPlateformes().then(d => definirPlateformes(d.plateformes)).catch(() => { /* liste vide : aucune icône */ });
  }, []);
  return useSyncExternalStore(f => { abonnes.add(f); return () => { abonnes.delete(f); }; }, () => liste);
}

const echapper = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hote = (lien: string) => { try { return new URL(lien).hostname; } catch { return ''; } };

// NOTE: nom de la plateforme connue d'une offre, cherchée dans « Postuler via », la source, l'employeur et l'adresse de l'annonce, en mot entier (« Malt » ne trouve pas « Malte »)
export function plateformeCompte(offre: { postuler_via?: string; source?: string; entreprise?: string | null; lien?: string | null }, plateformes: string[]): string {
  if (!plateformes.length) return '';
  const texte = norm([offre.postuler_via, offre.source, offre.entreprise, hote(offre.lien ?? '')].filter(Boolean).join(' | '));
  return plateformes.find(nom => new RegExp(`(^|[^a-z0-9])${echapper(norm(nom))}($|[^a-z0-9])`).test(texte)) ?? '';
}
