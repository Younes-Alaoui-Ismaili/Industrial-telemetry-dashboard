import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/**
 * Hand the screen over from the static shell in index.html to the React one.
 *
 * Removed a frame after render rather than immediately: React 18 commits the
 * initial mount asynchronously, so removing it on the next line would expose an
 * empty document for however long that takes. Both surfaces are the same page
 * colour, so the handover is invisible.
 */
requestAnimationFrame(() => document.getElementById('boot-shell')?.remove());
