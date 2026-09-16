import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Solace — Un peu de concentration, chaque jour',
    short_name: 'Solace',
    description: 'Votre espace serein pour vous concentrer, vous organiser et avancer à votre rythme.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#17181e',
    theme_color: '#17181e',
    lang: 'fr',
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
