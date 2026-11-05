import { useEffect, useState } from 'react';

// ANCHOR: pastille de la photo de profil dans le bouton Profil ; si l'image ne se charge pas, l'icône d'origine reprend la place
export default function AvatarProfil({ url, Icone }) {
  const [ko, setKo] = useState(false);
  useEffect(() => setKo(false), [url]);
  if (ko) return <Icone size={15} aria-hidden="true" />;
  return <img className="tab-photo" src={url} alt="" onError={() => setKo(true)} />;
}
