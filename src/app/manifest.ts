import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Solace — A little focus, every day',
    short_name: 'Solace',
    description: 'Your calm space for focused work, thoughtful planning, and steady progress.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#17181e',
    theme_color: '#17181e',
    lang: 'en',
    categories: ['productivity', 'education'],
    icons: [
      { src: '/icons/solace-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/solace-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/solace-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      { src: '/icons/solace.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
