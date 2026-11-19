import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

test('offers an Add to Home Screen guide in mobile Safari', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone install guidance');
  await page.goto('/');
  await page.getByRole('button', { name: 'Install app' }).click();
  await expect(page.getByRole('dialog', { name: 'Install LiftLog' })).toContainText('Add to Home Screen');
  await expect(page.getByRole('dialog')).toContainText('Safari');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('filters illustrated exercises by primary muscle and opens an offline form guide', async ({ page, context }) => {
  await page.goto('/#workouts');
  await expect(page.locator('.local-status')).toHaveText('Offline ready', { timeout: 25_000 });
  const browse = page.getByRole('button', { name: 'Browse exercises' });
  await browse.click();
  const library = page.getByRole('dialog');
  const primaryMuscle = library.getByLabel('Primary muscle');
  await primaryMuscle.selectOption('biceps');

  const results = library.getByRole('list', { name: 'Matching exercises' });
  await expect(results.getByRole('listitem')).toHaveCount(23);
  const curl = results.getByRole('button', { name: /Alternate Hammer Curl/ });
  await expect(curl.locator('img')).toBeVisible();
  await expect(results.getByRole('button', { name: /Alternating Kettlebell Row/ })).toHaveCount(0);

  const secondary = library.getByLabel('Include exercises that also work biceps');
  await secondary.check();
  await expect(results.getByRole('button', { name: /Alternating Kettlebell Row/ })).toBeVisible();
  await secondary.uncheck();

  await curl.click();
  const photos = library.getByRole('region', { name: 'Movement photos' }).getByRole('img');
  const form = library.getByRole('region', { name: 'Step-by-step form' });
  await expect(photos).toHaveCount(2);
  await expect.poll(() => photos.evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(form.getByRole('listitem')).toHaveCount(6);
  await page.waitForFunction(() => caches.match('/exercises/Alternate_Hammer_Curl.position-2.webp').then(Boolean));

  await library.getByRole('button', { name: 'Back to library' }).click();
  await expect(primaryMuscle).toHaveValue('biceps');
  await primaryMuscle.selectOption('triceps');
  await expect(results.getByRole('button', { name: /Bench Dips/ })).toBeVisible();
  await expect(curl).toHaveCount(0);

  await context.setOffline(true);
  await page.reload();
  await browse.click();
  await primaryMuscle.selectOption('biceps');
  await curl.click();
  await expect(photos).toHaveCount(2);
  await expect.poll(() => photos.evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(form.getByRole('listitem')).toHaveCount(6);
});
