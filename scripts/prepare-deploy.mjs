import { cp, lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = join(root, '.deploy');
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(join(outputRoot, 'liftlog-'));

const entries = [
  '.env.example', '.gitignore', 'DEPLOY.md', 'PROJECT.md', 'package.json', 'package-lock.json',
  'eslint.config.mjs', 'next.config.mjs', 'playwright.config.ts', 'postcss.config.mjs',
  'serwist.config.js', 'tsconfig.json', 'vitest.config.ts', 'src', 'tests', 'supabase/migrations',
  'scripts/prepare-deploy.mjs', 'public/icons', 'public/images/liftlog-iron.webp',
  'public/data/exercise-license.txt', 'public/data/foods.json',
];

async function include(source) {
  const name = basename(source);
  return (!name.startsWith('.env') || name === '.env.example') && !(await lstat(source)).isSymbolicLink();
}

for (const entry of entries) {
  const destination = join(output, entry);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(root, entry), destination, { recursive: true, filter: include });
}

// Keep catalog IDs and written guides so searches and recorded sets remain compatible.
const catalogPath = 'public/data/exercises.json';
const catalog = JSON.parse(await readFile(join(root, catalogPath), 'utf8'));
const writtenGuides = catalog.map((exercise) => ({ ...exercise, images: [] }));
await writeFile(join(output, catalogPath), `${JSON.stringify(writtenGuides)}\n`);

console.log(output);
