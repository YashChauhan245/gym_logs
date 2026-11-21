import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('logs and edits food with local portions and a meal draft while fully offline', async ({ page, context }) => {
  await page.goto('/#nutrition');
  await expect(page.locator('.local-status')).toHaveText('Offline ready', { timeout: 25_000 });
  await context.setOffline(true);
  await page.reload();
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'Set targets' }).click();
  await dialog.getByLabel('Calories (kcal)').fill('2200');
  await dialog.getByLabel('Protein (g)').fill('120');
  await dialog.getByRole('button', { name: 'Save targets' }).click();
  await expect(page.getByText('2,200 kcal target')).toBeVisible();

  await page.getByRole('button', { name: 'Add food to lunch' }).click();
  await dialog.getByRole('searchbox', { name: 'Search foods' }).fill('chapati');
  await dialog.getByRole('button', { name: /Roti \(chapati\)/ }).click();
  await dialog.getByLabel('Amount', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'Log food' }).click();
  const calories = page.getByTestId('daily-calories');
  await expect(calories).toHaveText('239');

  await page.getByRole('button', { name: 'Meal assistant' }).click();
  await dialog.getByLabel('Meal description').fill('1 katori dal, and 100 g paneer');
  await dialog.getByRole('button', { name: 'Draft offline' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Food 1', exact: true })).toHaveValue('food:dal');
  await expect(dialog.getByRole('combobox', { name: 'Food 2', exact: true })).toHaveValue('food:paneer');
  await dialog.getByRole('combobox', { name: 'Meal', exact: true }).selectOption('Dinner');
  await dialog.getByRole('button', { name: 'Log meal' }).click();
  await expect(calories).toHaveText('780');

  await page.reload();
  await expect(calories).toHaveText('780');
  await page.getByRole('button', { name: 'Edit Roti (chapati)' }).click();
  await dialog.getByLabel('Amount', { exact: true }).fill('1');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(calories).toHaveText('660');
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(calories).toHaveText('0');
  await page.getByRole('button', { name: 'Back to today' }).click();
  await expect(calories).toHaveText('660');
  const audit = await new AxeBuilder({ page }).include('.nutrition-screen').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
});

test('adjusts a homemade recipe and reuses it with the recalculated serving', async ({ page }) => {
  await page.goto('/#nutrition');
  const dialog = page.getByRole('dialog');
  const breakfast = page.getByRole('button', { name: 'Add food to breakfast' });
  await breakfast.click();
  await dialog.getByRole('searchbox', { name: 'Search foods' }).fill('chai');
  await dialog.getByRole('button', { name: /Milk chai with sugar/ }).click();
  await dialog.getByRole('button', { name: 'Adjust recipe' }).click();
  await dialog.getByRole('button', { name: 'Remove food 2' }).click();
  await dialog.getByLabel('Recipe name').fill('My unsweetened chai');
  await dialog.getByRole('button', { name: 'Save recipe' }).click();
  await expect(dialog).toHaveCount(0);
  await breakfast.click();
  await dialog.getByRole('searchbox').fill('unsweetened chai');
  await dialog.getByRole('button', { name: /My unsweetened chai/ }).click();
  await dialog.getByRole('button', { name: 'Log food' }).click();
  await expect(page.getByTestId('daily-calories')).toHaveText('49');
});

test('uses the weekly diary and reuses a recent portion in a different meal offline', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 18, 12));
  await page.goto('/#nutrition');
  await expect(page.locator('.local-status')).toHaveText('Offline ready', { timeout: 25_000 });
  await context.setOffline(true);

  const week = page.getByRole('group', { name: 'Days of the week' });
  const tuesday = week.getByRole('button', { name: /Tue\s*17/ });
  const wednesday = week.getByRole('button', { name: /Wed\s*18/ });
  const dialog = page.getByRole('dialog');
  const calories = page.getByTestId('daily-calories');

  await tuesday.click();
  await expect(tuesday).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Add food to lunch' }).click();
  await dialog.getByRole('searchbox', { name: 'Search foods' }).fill('chapati');
  await dialog.getByRole('button', { name: /Roti \(chapati\)/ }).click();
  await dialog.getByLabel('Amount', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'Log food' }).click();
  await expect(calories).toHaveText('239');
  await expect(tuesday).toHaveAccessibleName(/food logged/);

  await wednesday.click();
  await expect(calories).toHaveText('0');
  await page.getByRole('button', { name: 'Log food', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Meal', exact: true }).selectOption('Breakfast');
  await dialog.getByRole('region', { name: 'Recent foods' }).getByRole('button', { name: /Roti \(chapati\)/ }).click();
  await expect(dialog.getByLabel('Amount', { exact: true })).toHaveValue('2');
  await expect(dialog.getByRole('combobox', { name: 'Meal', exact: true })).toHaveValue('Breakfast');
  await dialog.getByRole('button', { name: 'Log food' }).click();
  await expect(calories).toHaveText('239');
  await expect(page.getByRole('region', { name: 'Breakfast', exact: true })).toContainText('Roti (chapati)');
  await expect(wednesday).toHaveAccessibleName(/food logged/);
  await tuesday.click();
  await expect(page.getByRole('region', { name: 'Lunch', exact: true })).toContainText('Roti (chapati)');
});

test.describe('Gemini meal review', () => {
  test.use({ serviceWorkers: 'block' });

  test('uses a Gemini draft only after approval and calculates nutrition locally', async ({ page }) => {
    await page.route('**/api/meal-assistant', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true } });
      expect(route.request().postDataJSON()).toEqual({ mode: 'plan', text: 'Make a dinner with paneer and rice' });
      return route.fulfill({ json: { title: 'Paneer and rice', items: [
        { name: 'paneer', amount: 100, unit: 'g' }, { name: 'Cooked white rice', amount: 150, unit: 'g' },
      ] } });
    });
    await page.goto('/#nutrition');
    await page.getByRole('button', { name: 'Meal assistant' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'What would you like to do?' }).selectOption('plan');
    await dialog.getByLabel('Meal description').fill('Make a dinner with paneer and rice');
    await dialog.getByRole('button', { name: 'Draft with Gemini' }).click();
    await expect(dialog.getByText('518 kcal')).toBeVisible();
    await expect(page.getByTestId('daily-calories')).toHaveText('0');
    await dialog.getByRole('combobox', { name: 'Meal', exact: true }).selectOption('Dinner');
    await dialog.getByRole('button', { name: 'Log meal' }).click();
    await expect(page.getByTestId('daily-calories')).toHaveText('518');
    await expect(page.getByRole('region', { name: 'Dinner' }).getByRole('button', { name: 'Edit Cooked white rice' })).toBeVisible();
  });
});
