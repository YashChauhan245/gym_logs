import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'LiftLog Workout Tracker', short_name: 'LiftLog',
    description: 'An offline-first workout and strength training log.', start_url: '/', scope: '/',
    display: 'standalone', background_color: '#101214', theme_color: '#101214',
    icons: [
      { src: '/icons/liftlog-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/liftlog-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/liftlog-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [{ name: 'Start workout', url: '/#active' }, { name: 'Quick Log', url: '/#quick-log' }, { name: 'Log food', url: '/#nutrition' }],
  };
}
