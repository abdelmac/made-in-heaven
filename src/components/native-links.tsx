'use client';

import { useEffect } from 'react';
import { appApiOrigin, isNativeApp } from '@/lib/mobile-platform';
import { openExternalUrl } from '@/lib/mobile-files';
import { useApp } from './app-context';

const publicPaths = new Set([
  '/legal',
  '/privacy',
  '/terms',
  '/support',
  '/account-deletion',
  '/third-party-notices.txt',
]);

export type NativeLinkAction =
  { kind: 'internal' } | { kind: 'external'; url: string } | { kind: 'blocked' };

/** Native webviews keep workspace navigation local and open HTTPS pages in the browser. */
export function resolveNativeLink(
  href: string,
  location: string,
  publicOrigin: string,
): NativeLinkAction {
  if (!href.trim() || href.startsWith('#')) return { kind: 'internal' };
  try {
    const current = new URL(location);
    const destination = new URL(href, current);
    if (destination.username || destination.password) return { kind: 'blocked' };
    if (destination.protocol === 'blob:' || destination.protocol === 'file:') {
      return { kind: 'internal' };
    }
    const local = destination.protocol === current.protocol && destination.host === current.host;
    if (local) {
      if (destination.pathname === '/' || destination.pathname === '/index.html') {
        return { kind: 'internal' };
      }
      if (publicPaths.has(destination.pathname)) {
        return {
          kind: 'external',
          url: new URL(
            `${destination.pathname}${destination.search}${destination.hash}`,
            publicOrigin,
          ).href,
        };
      }
      return { kind: 'blocked' };
    }
    if (destination.protocol === 'https:') return { kind: 'external', url: destination.href };
    return { kind: 'blocked' };
  } catch {
    return { kind: 'blocked' };
  }
}

export function NativeLinks() {
  const { notify } = useApp();
  useEffect(() => {
    if (!isNativeApp()) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element))
        return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.hasAttribute('download')) return;
      const action = resolveNativeLink(
        anchor.getAttribute('href') || '',
        window.location.href,
        appApiOrigin(),
      );
      if (action.kind === 'internal') return;
      event.preventDefault();
      event.stopPropagation();
      if (action.kind === 'blocked') {
        notify('Ce lien n’est pas autorisé dans Solace.');
        return;
      }
      void openExternalUrl(action.url).catch((cause) => {
        notify(cause instanceof Error ? cause.message : 'Impossible d’ouvrir cette page.');
      });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [notify]);
  return null;
}
