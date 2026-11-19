/// <reference lib="webworker" />
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  clientsClaim: true,
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/exercises/'),
      handler: new CacheFirst({ cacheName: 'liftlog-exercise-media', plugins: [new ExpirationPlugin({ maxEntries: 750, maxAgeSeconds: 60 * 60 * 24 * 30 })] }),
    },
    { matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate', handler: new NetworkOnly() },
  ],
  fallbacks: { entries: [{ url: '/offline', matcher: ({ request }) => request.mode === 'navigate' }] },
}).addEventListeners();
