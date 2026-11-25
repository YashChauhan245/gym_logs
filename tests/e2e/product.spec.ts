import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('introduces LiftLog and opens the app from the product page', async ({ page }) => {
  await page.goto('/product');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Manage your gym\s*with LiftLog/);
  await expect(page.getByRole('link', { name: 'Try the gym demo' })).toHaveAttribute('href', '/gym-demo');
  await expect(page.getByRole('link', { name: 'Open gym management' })).toHaveAttribute('href', '/#gym');
  const sampleImage = page.getByRole('img', { name: /sample gym dashboard/ });
  await sampleImage.scrollIntoViewIfNeeded();
  await expect.poll(() => sampleImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.product-photo img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  await page.getByRole('link', { name: 'Open LiftLog' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});

test('lets an owner try the front desk and a renewal with disposable sample records', async ({ page }) => {
  await page.goto('/product');
  await page.getByRole('link', { name: 'Try the gym demo' }).click();
  await expect(page.getByRole('heading', { name: 'Northline Strength' })).toBeVisible();
  await page.getByRole('button', { name: 'Check in member', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('searchbox', { name: 'Find a member' })).toBeFocused();
  await dialog.getByRole('searchbox', { name: 'Find a member' }).fill('Asha');
  await expect(dialog.getByRole('listitem')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Check in Asha Mehta' }).click();
  await expect(dialog.getByRole('button', { name: 'Check out Asha Mehta' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  const attendance = page.getByRole('region', { name: 'Today’s attendance' });
  await expect(attendance.getByRole('button', { name: /Asha Mehta.*In gym/ })).toBeVisible();
  const renewals = page.getByRole('region', { name: 'Renewals in the next 7 days' });
  await renewals.getByRole('button', { name: /Asha Mehta/ }).click();
  await dialog.getByRole('button', { name: 'Renew membership' }).click();
  await expect(renewals.getByRole('button', { name: /Asha Mehta/ })).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText(/Asha Mehta renewed/);
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(attendance.getByRole('button', { name: /Asha Mehta/ })).toHaveCount(0);
  await expect(renewals.getByRole('button', { name: /Asha Mehta/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: 'Open gym management' }).click();
  await expect(page.getByRole('heading', { name: 'Gym management' })).toBeVisible();
  await expect(page.getByText('Asha Mehta')).toHaveCount(0);
});
