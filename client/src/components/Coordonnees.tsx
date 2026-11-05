import { Camera, PenLine, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { separerLieu } from '../../../lib/coordonnees.mjs';
import { envoyerPhoto, envoyerSignature, supprimerPhoto, supprimerSignature } from '../api.ts';
import { definirPhoto, usePhoto } from '../usePhoto.ts';
// ANCHOR: coordonnées de l'entête du CV (kv profil, champ contact), saisies dans Profil > Coordonnées ou directement dans l'aperçu du CV
export const CONTACT: [string, string, string][] = [
  ['nom', 'Nom affiché', 'Prénom Nom'], ['titre', 'Titre sous le nom', "Vide : l'accroche"], ['adresse', 'Adresse', 'Numéro et rue'], ['code_postal', 'Code postal', '49100'], ['ville', 'Ville', 'Villeneuve'],
  ['telephone', 'Téléphone', 'Téléphone'], ['email', 'Email', 'Email'], ['site', 'Site', 'Site'],
  ['linkedin', 'LinkedIn', 'LinkedIn'], ['github', 'GitHub', 'GitHub'], ['mention', 'Mention', 'Permis B, disponibilité...'],
];

// NOTE: champs attendus sur tout CV ; site, réseaux, titre et mention restent facultatifs
const ESSENTIELS = ['nom', 'adresse', 'telephone', 'email', 'code_postal', 'ville'];
export const contactManquant = (contact): string[] => ESSENTIELS.filter(k => !String({ ...contact, ...separerLieu(contact) }[k] ?? '').trim()).map(k => CONTACT.find(c => c[0] === k)![1].toLowerCase());

export const majContact = (maj, k, v) => maj(s => ({ profil: { ...s.profil, contact: { ...(s.profil?.contact ?? {}), [k]: v } } }));

export default function Coordonnees({ profil, maj, signature }) {
  const contact = profil?.contact ?? {};
  const manquants = contactManquant(contact);
  return (
    <div className="carte" id="coordonnees">
      <h3 className="carte-titre">Coordonnées</h3>
      <p className="muted small">Entête des CV et des lettres générés (onglet CV/LM). Elles restent dans la base locale et n'apparaissent que dans le PDF.</p>
      {manquants.length > 0 && <p className="small warn" role="status">À renseigner : {manquants.join(', ')}.</p>}
      <div className="grid-3">
        {CONTACT.map(([k, l, ph]) => (
          <label key={k} className="field">{l}<input className="input" value={contact[k] ?? ''} placeholder={ph} onChange={e => majContact(maj, k, e.target.value)} /></label>
        ))}
      </div>
      <div className="coord-doubles">
        <PhotoProfil />
        <Signature initiale={Boolean(signature)} />
      </div>
    </div>
  );
}

// ANCHOR: image de signature des lettres de motivation (data/signature.png, jamais versionnée), apposée au pied du PDF et du Word
function Signature({ initiale }) {
  const [presente, setPresente] = useState(initiale);
  const [version, setVersion] = useState(0);
  const [erreur, setErreur] = useState('');
  const envoyer = async (fichier?: File) => {
    if (!fichier) return;
    setErreur('');
    try {
      await envoyerSignature(fichier);
      setPresente(true);
      setVersion(n => n + 1);
    } catch (e) {
      setErreur(e.message);
    }
  };
  const retirer = async () => {
    if (!confirm('Supprimer la signature ? Les lettres suivantes porteront le nom seul.')) return;
    try {
      await supprimerSignature();
      setPresente(false);
    } catch (e) {
      setErreur(e.message);
    }
  };
  return (
    <div className="coord-signature">
      <h4 className="small"><PenLine size={14} /> Signature des lettres</h4>
      <p className="muted small">Image PNG ou JPEG (500 Ko au plus), gardée dans data/ et jamais versionnée. Sans image, la lettre se termine par votre nom.</p>
      {presente && <img className="lettre-signature-apercu" src={`/api/signature?v=${version}`} alt="Signature enregistrée" />}
      <div className="cv-actions">
        <label className="btn btn-ghost small cv-fichier"><Upload size={15} />{presente ? 'Remplacer' : 'Envoyer l\'image'}
          <input type="file" accept="image/png,image/jpeg" onChange={e => { envoyer(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {presente && <button type="button" className="btn btn-ghost small" onClick={retirer}><Trash2 size={15} />Supprimer</button>}
      </div>
      {erreur && <p className="alert" role="alert">{erreur}</p>}
    </div>
  );
}

// ANCHOR: photo de profil (data/photo.png ou .jpg, jamais versionnée) : reprise dans le bouton Profil de la barre, et dans l'entête du CV sur option (case « Afficher la photo » de l'aperçu)
function PhotoProfil() {
  const { presente, url } = usePhoto();
  const [erreur, setErreur] = useState('');
  const envoyer = async (fichier?: File) => {
    if (!fichier) return;
    setErreur('');
    try {
      await envoyerPhoto(fichier);
      definirPhoto(true, true);
    } catch (e) {
      setErreur(e.message);
    }
  };
  const retirer = async () => {
    if (!confirm('Supprimer la photo de profil ?')) return;
    try {
      await supprimerPhoto();
      definirPhoto(false);
    } catch (e) {
      setErreur(e.message);
    }
  };
  return (
    <div className="coord-signature">
      <h4 className="small"><Camera size={14} /> Photo de profil</h4>
      <p className="muted small">Image PNG ou JPEG (1 Mo au plus), gardée dans data/ et jamais versionnée. Elle apparaît dans le bouton Profil de la barre ; dans le CV, elle s'active à l'export (case « Afficher la photo » de l'aperçu).</p>
      {presente && <img className="photo-apercu" src={url} alt="Photo de profil enregistrée" />}
      <div className="cv-actions">
        <label className="btn btn-ghost small cv-fichier"><Upload size={15} />{presente ? 'Remplacer' : 'Envoyer l\'image'}
          <input type="file" accept="image/png,image/jpeg" onChange={e => { envoyer(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {presente && <button type="button" className="btn btn-ghost small" onClick={retirer}><Trash2 size={15} />Supprimer</button>}
      </div>
      {erreur && <p className="alert" role="alert">{erreur}</p>}
    </div>
  );
}
