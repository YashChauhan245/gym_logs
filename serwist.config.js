import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { serwist } from '@serwist/next/config';

const getManifestRevision = () => {
  const candidates = [
    '.next/server/app/manifest.webmanifest.body',
    '.next/server/app/manifest.webmanifest',
    'src/app/manifest.ts',
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 20);
      } catch {
        // continue
      }
    }
  }
  return createHash('sha256').update(readFileSync('package.json')).digest('hex').slice(0, 20);
};

export default serwist({
  swSrc: 'src/app/sw.ts', swDest: 'public/sw.js',
  globPatterns: ['.next/static/**/*.{js,css,woff2}', 'public/data/{exercises,foods}.json', 'public/icons/*.png'],
  additionalPrecacheEntries: [{
    url: '/manifest.webmanifest',
    revision: getManifestRevision(),
  }],
});
