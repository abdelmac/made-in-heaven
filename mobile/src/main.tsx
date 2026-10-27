import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@/app/globals.css';
import './mobile.css';
import { FoliaApp } from '@/components/folia-app';
import { initializeWorkspaceStorage, workspaceStorage } from '@/lib/workspace-storage';
import { purgeNativeExportCache } from '@/lib/mobile-files';

async function start() {
  await initializeWorkspaceStorage();
  void purgeNativeExportCache().catch(() => undefined);
  try {
    const appearance = JSON.parse(workspaceStorage.getItem('folia.appearance') || '{}');
    const root = document.documentElement;
    const dark =
      appearance.mode === 'dark' ||
      (appearance.mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
  } catch {
    // An invalid appearance cache must never block access to the workspace.
  }
  if (!window.location.search && window.location.pathname === '/') {
    window.history.replaceState(null, '', '/?view=overview');
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <FoliaApp />
    </StrictMode>,
  );
}

void start().catch(() => {
  const root = document.getElementById('root')!;
  root.replaceChildren();
  const message = document.createElement('p');
  message.textContent = 'Impossible d’ouvrir les données locales. Fermez puis rouvrez Solace.';
  message.style.cssText = 'padding:32px;font-family:system-ui,sans-serif';
  root.append(message);
});
