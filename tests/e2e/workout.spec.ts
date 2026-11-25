import { readFileSync } from 'node:fs';
import { expect, test, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const exercises: { id: string; name: string; images: string[] }[] = JSON.parse(
  readFileSync(new URL('../../public/data/exercises.json', import.meta.url), 'utf8'),
);
const media: Record<string, { images?: { src: string }[]; video?: { src: string } }> = JSON.parse(
  readFileSync(new URL('../../src/features/catalog/exercise-media.json', import.meta.url), 'utf8'),
);

async function expectExercisePhotos(photos: Locator, exerciseName: string) {
  const exercise = exercises.find((item) => item.name === exerciseName);
  if (!exercise) throw new Error(`Missing catalog exercise: ${exerciseName}`);
  const images = media[exercise.id]?.images?.map((image) => image.src) ?? exercise.images;
  await expect(photos).toHaveCount(images.length);
  if (images.length) {
    await expect.poll(() => photos.evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  }
  return images;
}

test('filters for licensed exercise videos and loads the movement images and video', async ({ page, request }) => {
  await page.goto('/#workouts');
  await page.getByRole('button', { name: 'Browse exercises' }).click();
  const library = page.getByRole('dialog');
  await library.getByLabel('With demo video').check();
  await library.getByRole('searchbox').fill('Barbell Bench Press');
  await library.getByRole('list', { name: 'Matching exercises' }).getByRole('button', { name: /^Barbell Bench Press\b/ }).first().click();
  const photos = library.getByRole('region', { name: 'Movement images' }).getByRole('img');
  expect(await expectExercisePhotos(photos, 'Barbell Bench Press')).toHaveLength(2);
  const video = library.locator('video');
  await expect(video).toHaveAttribute('controls', '');
  const path = await video.locator('source').getAttribute('src');
  expect(path).toMatch(/^\/exercise-media\/.*\.mp4$/);
  const response = await request.get(path!, { headers: { Range: 'bytes=0-1023' } });
  expect(response.status()).toBe(206);
  expect(response.headers()['content-type']).toContain('video/mp4');
  const supported = await video.evaluate((element: HTMLVideoElement) => element.canPlayType('video/mp4; codecs="avc1.64001e"'));
  if (supported) {
    await video.evaluate((element: HTMLVideoElement) => { element.preload = 'metadata'; element.load(); });
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.videoWidth)).toBeGreaterThan(0);
  }
  await library.getByText('Media credits', { exact: true }).click();
  await expect(library.getByRole('link', { name: 'CC BY-SA 4.0' }).first()).toBeVisible();
});

test('saves manual and pasted sets offline across reloads, then finishes', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.local-status')).toHaveText('Offline ready', { timeout: 25_000 });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('bench press');
  await page.getByRole('button', { name: 'Add Barbell Bench Press', exact: true }).click();
  await page.getByLabel('Weight (kg)').fill('60');
  await page.getByLabel('Reps', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Log set', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Rest timer' })).toBeVisible();
  await expect(page.getByText('60 kg × 8')).toBeVisible();
  await page.reload();
  await expect(page.getByText('60 kg × 8')).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText(/01:[012]\d/);
  await page.getByRole('button', { name: 'Quick Log', exact: true }).click();
  await page.getByLabel('Workout text').fill('Squat 2x5 @ 100\n  Felt steady on the last rep.  ');
  await expect(page.getByRole('region', { name: 'Quick Log preview' }).getByText('Barbell Back Squat')).toBeVisible();
  await page.getByLabel('Squat set 1 reps').fill('6');
  await page.getByRole('button', { name: 'Save to workout' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.session-note')).toContainText('Felt steady on the last rep.');
  await expect(page.getByText('100 kg × 5')).toHaveCount(1);
  await expect(page.getByText('100 kg × 6')).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByText('Workout complete')).toBeVisible();
  await expect(page.getByText('1,580')).toBeVisible();
  await page.getByRole('button', { name: 'Edit set 1 for Barbell Bench Press' }).click();
  await page.getByLabel('Reps', { exact: true }).fill('9');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('1,640')).toBeVisible();
  await page.getByRole('link', { name: 'Back to Today' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('.workout-list')).toContainText('Workout');
  await page.goto('/uncached-route');
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
  await page.getByRole('link', { name: 'Open LiftLog' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});

test('checks Today and Quick Log for accessibility violations and horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open Quick Log' }).click();
  await page.getByLabel('Workout text').fill('Bench Press 60kg x 8, 8, 6');
  await expect(page.getByLabel('Bench Press set 1 reps')).toHaveValue('8');
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});

test('shows weekly training totals and lift results from a completed workout offline', async ({ page, context }) => {
  await page.goto('/#today');
  await expect(page.locator('.local-status')).toHaveText('Offline ready', { timeout: 25_000 });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Open Quick Log' }).click();
  await page.getByLabel('Workout text').fill('Bench press 60kg x 8, 8');
  await page.getByRole('button', { name: 'Save to workout' }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByText('Workout complete')).toBeVisible();
  await page.getByRole('link', { name: 'Progress', exact: true }).click();

  const totals = page.locator('.progress-metrics');
  await expect(totals).toContainText('Sessions1');
  await expect(totals).toContainText('Sets logged2');
  await expect(totals).toContainText('960 kg');
  await page.getByRole('button', { name: '4 weeks' }).click();
  const chart = page.getByRole('region', { name: 'Weekly trend' });
  await expect(chart.getByRole('group', { name: 'Select a week' }).getByRole('button')).toHaveCount(4);
  await chart.getByRole('button', { name: 'Load' }).click();
  await expect(chart.locator('.training-chart-caption')).toContainText('960 kg');
  await expect(page.locator('.progress-lifts').getByRole('link', { name: /Barbell Bench Press/ })).toContainText('60 kg × 8');
});

test('lets Quick Log resolve an unmatched exercise as a note', async ({ page }) => {
  await page.goto('/#quick-log');
  const quickLog = page.getByRole('dialog', { name: 'Quick Log' });
  await quickLog.getByLabel('Workout text').fill('Constructor 30kg x 8');
  await quickLog.getByRole('button', { name: 'Keep as note' }).click();
  await quickLog.getByRole('button', { name: 'Save to workout' }).click();
  await expect(page.locator('.session-note')).toContainText('Constructor 30kg x 8');
});

test('offers an Add to Home Screen guide in mobile Safari', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone install guidance');
  await page.goto('/');
  await page.getByRole('button', { name: 'Install app' }).click();
  await expect(page.getByRole('dialog', { name: 'Install LiftLog' })).toContainText('Add to Home Screen');
  await expect(page.getByRole('dialog')).toContainText('Safari');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('filters exercises by primary muscle and opens an offline form guide', async ({ page, context }) => {
  await page.goto('/#workouts');
  await expect(page.locator('.local-status')).toHaveText('Offline ready', { timeout: 25_000 });
  const browse = page.getByRole('button', { name: 'Browse exercises' });
  await browse.click();
  const library = page.getByRole('dialog');
  const primaryMuscle = library.getByRole('group', { name: 'Muscle group', exact: true });
  await primaryMuscle.getByRole('button', { name: 'Biceps', exact: true }).click();

  const results = library.getByRole('list', { name: 'Matching exercises' });
  await expect(results.getByRole('listitem')).toHaveCount(25);
  const curl = results.getByRole('button', { name: /Alternate Hammer Curl/ });
  await expect(results.getByRole('button', { name: /Alternating Kettlebell Row/ })).toHaveCount(0);

  const secondary = library.getByLabel('Include secondary muscles');
  await secondary.check();
  await expect(results.getByRole('button', { name: /Alternating Kettlebell Row/ })).toBeVisible();
  await secondary.uncheck();

  await curl.click();
  const photos = library.getByRole('region', { name: 'Movement images' }).getByRole('img');
  const form = library.getByRole('region', { name: 'Step-by-step form' });
  const images = await expectExercisePhotos(photos, 'Alternate Hammer Curl');
  await expect(form.getByRole('listitem')).toHaveCount(6);
  if (images.length) {
    await page.waitForFunction((paths) => Promise.all(paths.map((path) => caches.match(path))).then((matches) => matches.every(Boolean)), images);
  }

  await library.getByRole('button', { name: 'Back to library' }).click();
  await expect(primaryMuscle.getByRole('button', { name: 'Biceps', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await primaryMuscle.getByRole('button', { name: 'Triceps', exact: true }).click();
  await expect(results.getByRole('button', { name: /Bench Dips/ })).toBeVisible();
  await expect(curl).toHaveCount(0);

  await context.setOffline(true);
  await page.reload();
  await browse.click();
  await primaryMuscle.getByRole('button', { name: 'Biceps', exact: true }).click();
  await curl.click();
  await expectExercisePhotos(photos, 'Alternate Hammer Curl');
  await expect(form.getByRole('listitem')).toHaveCount(6);
});

test('combines exercise collections with the muscle filter and opens imported guides', async ({ page }) => {
  await page.goto('/#workouts');
  await page.getByRole('button', { name: 'Browse exercises' }).click();
  const library = page.getByRole('dialog');
  const collections = library.getByRole('group', { name: 'Exercise collection' });
  const results = library.getByRole('list', { name: 'Matching exercises' });

  await collections.getByRole('button', { name: 'Essentials' }).click();
  await expect(results.getByRole('button', { name: /Barbell Front Squat/ })).toBeVisible();
  await expect(results.getByRole('button', { name: /Cable Preacher Curl/ })).toHaveCount(0);

  const popular = collections.getByRole('button', { name: 'Popular' });
  await popular.click();
  await library.getByRole('group', { name: 'Muscle group', exact: true }).getByRole('button', { name: 'Biceps', exact: true }).click();
  await expect(results.getByRole('button', { name: /Rope Hammer Curl/ })).toBeVisible();
  await expect(results.getByRole('button', { name: /Cable Face Pull|Barbell Front Squat/ })).toHaveCount(0);
  await results.getByRole('button', { name: /Cable Preacher Curl/ }).click();

  const photos = library.getByRole('region', { name: 'Movement images' }).getByRole('img');
  await expectExercisePhotos(photos, 'Cable Preacher Curl');
  await expect(library.getByRole('region', { name: 'Step-by-step form' })).toBeVisible();
  await library.getByRole('button', { name: 'Back to library' }).click();

  await expect(popular).toHaveAttribute('aria-pressed', 'true');
  await expect(library.getByRole('group', { name: 'Muscle group', exact: true }).getByRole('button', { name: 'Biceps', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await library.getByRole('searchbox', { name: 'Search exercises' }).fill('cable hammer curl');
  await expect(results.getByRole('listitem')).toHaveCount(1);
  await expect(results.getByRole('button', { name: /Rope Hammer Curl/ })).toBeVisible();
});
