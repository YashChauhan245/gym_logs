import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { serwist } from '@serwist/next/config';

export default serwist({
  swSrc: 'src/app/sw.ts', swDest: 'public/sw.js',
  globPatterns: ['.next/static/**/*.{js,css,woff2}', 'public/data/exercises.json', 'public/images/training-hero.webp', 'public/icons/*.png'],
  additionalPrecacheEntries: [{
    url: '/manifest.webmanifest',
    revision: createHash('sha256').update(readFileSync('.next/server/app/manifest.webmanifest.body')).digest('hex').slice(0, 20),
  }],
});
