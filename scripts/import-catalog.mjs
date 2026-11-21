import { access, mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import collections from '../src/features/catalog/collections.json' with { type: 'json' };

const revision = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5';
const source = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${revision}`;
const overrides = {
  'Barbell_Bench_Press_-_Medium_Grip': ['Barbell Bench Press', 'bench', 'bench press', 'flat bench', 'barbell bench'],
  Barbell_Full_Squat: ['Barbell Back Squat', 'squat', 'back squat', 'barbell squat'],
  Barbell_Deadlift: ['Barbell Deadlift', 'deadlift', 'conventional deadlift'],
  'Wide-Grip_Lat_Pulldown': ['Lat Pulldown', 'lat pull down', 'pulldown', 'wide grip lat pulldown'],
  'Pushups': ['Push-up', 'push ups', 'pushups', 'push up'],
  'Pullups': ['Pull-up', 'pull ups', 'pullups', 'pull up'],
  'Bent_Over_Barbell_Row': ['Barbell Row', 'barbell bent over row', 'bent over row', 'bb row'],
  'Standing_Military_Press': ['Barbell Overhead Press', 'overhead press', 'ohp', 'military press', 'shoulder press'],
};

const collectionNames = {
  Butterfly: ['Pec Deck Fly', 'pec deck', 'machine chest fly'],
  'Cable_Hammer_Curls_-_Rope_Attachment': ['Rope Hammer Curl', 'cable hammer curl', 'rope curl'],
  Cable_Rope_Overhead_Triceps_Extension: ['Overhead Rope Triceps Extension', 'overhead cable triceps extension', 'overhead rope extension'],
  Dumbbell_Incline_Row: ['Chest-Supported Dumbbell Row', 'chest supported row', 'incline dumbbell row'],
  Dumbbell_Step_Ups: ['Dumbbell Step-up', 'dumbbell step ups', 'step up'],
  Face_Pull: ['Cable Face Pull', 'face pulls'],
  Farmers_Walk: ['Farmer’s Carry', 'farmers carry', 'farmer walk', 'farmers walk'],
  Front_Squat_Clean_Grip: ['Barbell Front Squat', 'front squat'],
  Machine_Bench_Press: ['Machine Chest Press', 'chest press machine'],
  Side_Lateral_Raise: ['Dumbbell Lateral Raise', 'lateral raise', 'db lateral raise'],
  Smith_Machine_Incline_Bench_Press: ['Smith Machine Incline Press', 'smith incline press'],
  Split_Squat_with_Dumbbells: ['Dumbbell Bulgarian Split Squat', 'bulgarian split squat', 'rear foot elevated split squat', 'rfess'],
  'Standing_Low-Pulley_Deltoid_Raise': ['Single-Arm Cable Lateral Raise', 'cable lateral raise', 'standing cable lateral raise'],
  'Triceps_Pushdown_-_Rope_Attachment': ['Rope Triceps Pushdown', 'rope pushdown'],
};

async function fetchAsset(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${source}/${path}`, { signal: AbortSignal.timeout(25_000) });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (response.status < 429 || attempt === 2) throw new Error(`${response.status} ${path}`);
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error(`Unable to download ${path}`);
}

const catalog = JSON.parse((await fetchAsset('dist/exercises.json')).toString('utf8'));
const preferred = Object.keys(overrides);
const equipment = ['barbell', 'dumbbell', 'body only', 'machine', 'cable', 'kettlebells', 'bands'];
const ranks = new Map(equipment.map((item, index) => [item, index]));
const groups = Map.groupBy(catalog.filter((item) => item.images?.length && item.instructions?.length && item.primaryMuscles?.length), (item) => item.primaryMuscles[0]);
const rank = (item) => (preferred.includes(item.id) ? -100 : 0) + (item.category === 'strength' ? 0 : 20) +
  (ranks.get(item.equipment) ?? 12) + (item.level === 'beginner' ? 0 : 5);
const sortedGroups = [...groups.values()].map((group) => group.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)));
const selected = [];
for (let index = 0; selected.length < 340; index++) {
  for (const group of sortedGroups) if (group[index] && selected.length < 340) selected.push(group[index]);
}

// Append collection exercises without displacing existing catalog entries.
const selectedIds = new Set(selected.map((item) => item.id));
const byId = new Map(catalog.map((item) => [item.id, item]));
for (const id of new Set(Object.values(collections).flat())) {
  const item = byId.get(id);
  if (item?.images?.length !== 2 || !item.instructions?.length || !item.primaryMuscles?.length) {
    throw new Error(`Collection exercise ${id} is missing two movement photos or form details.`);
  }
  if (!selectedIds.has(id)) selected.push(item);
}

await mkdir('public/data', { recursive: true });
await mkdir('public/exercises', { recursive: true });
const license = await fetchAsset('LICENSE.md');
await writeFile('public/data/exercise-license.txt', license);

async function processExercise(item) {
  const [name = item.name, ...aliases] = overrides[item.id] ?? collectionNames[item.id] ?? [];
  const images = await Promise.all(item.images.map(async (path, index) => {
    const suffix = index === 0 ? '' : `.position-${index + 1}`;
    const image = `/exercises/${item.id}${suffix}.webp`;
    const filename = `public${image}`;
    const present = await access(filename).then(() => true, () => false);
    if (!present) {
      const asset = await fetchAsset(`exercises/${path.split('/').map(encodeURIComponent).join('/')}`);
      await sharp(asset).rotate().resize({ width: 420, height: 350, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toFile(filename);
    }
    return image;
  }));
  return {
    id: `catalog:${item.id}`, name, aliases: [...new Set([...aliases, ...(name === item.name ? [] : [item.name])])],
    muscle: item.primaryMuscles[0], secondary: item.secondaryMuscles ?? [], equipment: item.equipment ?? 'other',
    level: item.level, movement: item.category, cues: item.instructions, images,
  };
}

const records = [];
for (let group = 0; group < selected.length; group += 12) {
  records.push(...await Promise.all(selected.slice(group, group + 12).map(processExercise)));
}
await writeFile('public/data/exercises.json', JSON.stringify(records.sort((a, b) => a.name.localeCompare(b.name))));
console.log(`Imported ${records.length} exercises and images from ${revision}.`);
