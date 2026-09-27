'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { opensWorkspace } from '@/lib/site-entry';
import { FoliaApp } from './folia-app';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

function workspaceSnapshot() {
  return opensWorkspace(window.location.search);
}

function serverSnapshot() {
  return false;
}

export function SiteEntry({ home }: { home: ReactNode }) {
  const workspace = useSyncExternalStore(subscribe, workspaceSnapshot, serverSnapshot);

  // The public HTML stays static and never initializes workspace storage. Keeping
  // FoliaApp in this entry's bundle lets the cached public shell open workspace
  // deep links offline, using the same URL selection after hydration.
  return workspace ? <FoliaApp /> : home;
}
