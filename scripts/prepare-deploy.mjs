import { cp, lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = join(root, '.deploy');
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(join(outputRoot, 'liftlog-'));

const entries = [
  '.env.example', '.gitignore', 'README.md', 'DEPLOY.md', 'PROJECT.md', 'package.json', 'package-lock.json',
  'eslint.config.mjs', 'next.config.mjs', 'playwright.config.ts', 'postcss.config.mjs',
  'serwist.config.js', 'tsconfig.json', 'vercel.json', 'vitest.config.ts', 'src', 'tests', 'supabase/migrations',
  'scripts/prepare-deploy.mjs', 'scripts/make-icons.mjs', 'public/icons', 'public/images/liftlog-iron.webp', 'public/images/liftlog-gym-dashboard.webp',
  'public/data/exercise-license.txt', 'public/data/foods.json',
];

async function include(source) {
  const name = basename(source);
  return (!name.startsWith('.env') || name === '.env.example') && !(await lstat(source)).isSymbolicLink();
}

const media = JSON.parse(await readFile(join(root, 'src/features/catalog/exercise-media.json'), 'utf8'));
const mediaFiles = new Set();
for (const { images = [], video } of Object.values(media)) {
  for (const file of video ? [...images, video] : images) {
    if (!/^\/exercise-media\/[a-z0-9-]+\.(webp|mp4)$/.test(file.src) ||
      !file.author || !file.license || !file.source?.startsWith('https://')) {
      throw new Error(`Invalid exercise media or missing attribution: ${file.src}`);
    }
    mediaFiles.add(`public${file.src}`);
  }
}

entries.push(...mediaFiles);
for (const entry of entries) {
  const destination = join(output, entry);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(root, entry), destination, { recursive: true, filter: include });
}

// Remove the legacy preview photos. The credited replacement media is packaged above.
const catalogPath = 'public/data/exercises.json';
const catalog = JSON.parse(await readFile(join(root, catalogPath), 'utf8'));
const writtenGuides = catalog.map((exercise) => ({ ...exercise, images: [] }));
await writeFile(join(output, catalogPath), `${JSON.stringify(writtenGuides)}\n`);

console.log(output);
