import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './style.css';
import App from './App.tsx';

// NOTE: on attend la police Inter (1,5 s au plus) avant le premier rendu : avec la police de secours, l'en-tête fait 84 px au lieu de 69 et tout le contenu descendait puis remontait à l'arrivée d'Inter
const police = Promise.race([
  document.fonts.load('1rem "Inter Variable"').catch(() => undefined),
  new Promise(r => setTimeout(r, 1500)),
]);

police.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
