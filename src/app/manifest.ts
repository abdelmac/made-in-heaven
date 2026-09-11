import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Folia — A little focus, every day',
    short_name: 'folia.',
    description: 'Your calm space for focused work, thoughtful planning, and steady progress.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f8f2',
    theme_color: '#254c3c',
    lang: 'en',
    categories: ['productivity', 'education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      { src: '/icons/folia.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
