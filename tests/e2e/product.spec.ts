import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('introduces LiftLog and opens the app from the product page', async ({ page }) => {
  await page.goto('/product');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your training,\s*on the record/);
  await expect.poll(() => page.locator('.product-photo img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  await page.getByRole('link', { name: 'Open LiftLog' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});
