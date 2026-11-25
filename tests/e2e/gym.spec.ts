import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { addDays } from '../../src/domain/gym';
import { localDate } from '../../src/domain/date';

test('owner registers a member, records partial fees and attendance, renews and exports offline', async ({ page, context }) => {
  await page.goto('/#gym');
  await expect(page.getByRole('heading', { name: 'Gym management', exact: true })).toBeVisible();
  await expect(page.locator('.local-status')).toHaveText('Offline ready', { timeout: 25_000 });
  const dialog=page.getByRole('dialog');
  await page.getByRole('button', { name: 'Gym settings', exact: true }).click();
  await dialog.getByLabel('Gym name').fill('Central Barbell');
  await dialog.getByLabel('Gym contact phone').fill('01234 567890');
  const logo = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#e5c588' } }).png().toBuffer();
  await dialog.getByLabel('Gym logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo });
  await dialog.getByRole('button', { name: 'Save gym settings' }).click();
  await expect(page.getByRole('heading', { name: 'Central Barbell', exact: true })).toBeVisible();
  await expect(page.locator('.gym-header img')).toHaveAttribute('src', /^data:image\//);
  await page.getByRole('button', { name: 'Create membership plan', exact: true }).click();
  await dialog.getByLabel('Plan name').fill('Standard monthly');
  await dialog.getByLabel('Fee (INR)').fill('1500');
  await dialog.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  await dialog.getByLabel('Member name', { exact: true }).fill('Asha Patel');
  await dialog.getByLabel('Phone', { exact: true }).fill('9876543210');
  await dialog.getByLabel('Assigned trainer').fill('Ravi');
  await dialog.getByRole('button', { name: 'Save member', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('group', { name: 'Gym section' }).getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: 'View Asha Patel' }).click();
  await dialog.getByRole('button', { name: 'Record payment', exact: true }).click();
  await dialog.getByLabel('Amount received (INR)').fill('1000');
  await dialog.getByRole('button', { name: 'Save payment', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.gym-member-balance')).toContainText('500.00');
  await page.getByRole('button', { name: 'View Asha Patel' }).click();
  const receiptDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Receipt', exact: true }).click();
  const receipt = await receiptDownload;
  expect(receipt.suggestedFilename()).toMatch(/\.html$/);
  const receiptHtml = await readFile(await receipt.path(), 'utf8');
  expect(receiptHtml).toContain('Central Barbell');
  expect(receiptHtml).toContain('01234 567890');
  expect(receiptHtml).toContain('<img src="data:image/');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Check in member', exact: true }).click();
  await dialog.getByRole('searchbox', { name: 'Find a member' }).fill('9876');
  await dialog.getByRole('button', { name: 'Check in Asha Patel', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Check out Asha Patel' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('button', { name: 'Check out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check out', exact: true }).click();
  await expect(page.getByText('Visited today', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Central Barbell', exact: true })).toBeVisible();
  await page.getByRole('group', { name: 'Gym section' }).getByRole('button', { name: 'Members', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Asha Patel' })).toBeVisible();
  await expect(page.getByText('Visited today', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Asha Patel' }).click();
  await dialog.getByRole('button', { name: 'Renew membership', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save renewal', exact: true }).click();
  await page.getByRole('button', { name: 'View Asha Patel' }).click();
  await expect(dialog.getByRole('heading', { name: 'Membership history', exact: true })).toBeVisible();
  await expect(dialog.getByText('Standard monthly', { exact: true })).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  const csv=page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export members CSV' }).click();
  expect((await csv).suggestedFilename()).toContain('gym-members');
  const backup=page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup JSON' }).click();
  expect((await backup).suggestedFilename()).toContain('gym-backup');
  expect(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:`test-results/gym-${test.info().project.name}.png`,fullPage:true});
});

test('filters by muscle, target area, difficulty and equipment, and clears stale targets',async({page})=>{
  await page.goto('/#workouts');
  await page.getByRole('button',{name:'Browse exercises'}).click();
  const library=page.getByRole('dialog');
  const groups=library.getByRole('group',{name:'Muscle group',exact:true});
  await groups.getByRole('button',{name:'Biceps',exact:true}).click();
  await library.getByRole('combobox',{name:'Target area',exact:true}).selectOption('brachialis');
  await library.getByRole('combobox',{name:'Equipment',exact:true}).selectOption('cable');
  await expect(library.getByRole('button',{name:/Rope Hammer Curl/})).toBeVisible();
  await expect(library.getByRole('button',{name:/Cable Preacher Curl/})).toHaveCount(0);
  await groups.getByRole('button',{name:'Legs',exact:true}).click();
  await expect(library.getByRole('combobox',{name:'Target area',exact:true})).toHaveValue('');
  await library.getByRole('button',{name:'Reset filters',exact:true}).click();
  await groups.getByRole('button',{name:'Legs',exact:true}).click();
  await library.getByRole('combobox',{name:'Target area',exact:true}).selectOption('hamstrings');
  await expect(library.getByRole('status')).not.toContainText('No exercises');
  await library.getByRole('combobox',{name:'Difficulty',exact:true}).selectOption('beginner');
  await expect(library.getByRole('list',{name:'Matching exercises'}).getByRole('listitem').first()).toBeVisible();
  await library.getByRole('button',{name:'Reset filters',exact:true}).click();
  await expect(library.getByRole('combobox',{name:'Target area',exact:true})).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:`test-results/exercise-filters-${test.info().project.name}.png`,fullPage:true});
});

test('restores a backup into an empty gym workspace and protects existing records', async ({ page }) => {
  const backup = {
    format: 'liftlog-gym', version: 1, exportedAt: '2026-11-25T08:00:00Z',
    members: [{ id: 'backup-member', name: 'Riya Das', email: '', phone: '', trainer: '', notes: '', archived: false, createdAt: 1 }],
    plans: [], memberships: [], payments: [], attendance: [],
  };
  await page.goto('/#gym');
  const dialog = page.getByRole('dialog');
  async function restore() {
    await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
    await dialog.getByLabel('Gym backup JSON').setInputFiles({
      name: 'gym-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
    });
    await dialog.getByRole('button', { name: 'Restore gym backup', exact: true }).click();
  }
  await restore();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await expect(page.getByText('1 member', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Riya Das' })).toBeVisible();
  await restore();
  await expect(dialog.getByRole('alert')).toHaveText('Restore a gym backup into an empty workspace.');
});

test('imports reviewed members, corrects fees, and controls access during a freeze', async ({ page }) => {
  const today = localDate();
  const csv = `${[
    'Name,Phone,Email,Plan,Start,End,Fee INR,Outstanding INR,Duration days',
    `Isha Verma,9000000001,isha@example.invalid,Monthly,${today},${addDays(today, 29)},1500,500,30`,
    `Duplicate,9000000001,,Monthly,${today},,1500,,30`,
    `Nila Singh,,nila@example.invalid,Monthly,${addDays(today, -40)},${addDays(today, -11)},1500,,30`,
    'Invalid,,,Monthly,broken,,,,',
  ].join('\r\n')}\r\n`;
  await page.goto('/#gym');
  const navigation = page.getByRole('group', { name: 'Gym section' });
  await navigation.getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: 'Import members CSV' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Members CSV').setInputFiles({ name: 'members.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(dialog.getByRole('status')).toContainText('2 ready · 2 skipped · 1 new plan');
  await expect(dialog.getByRole('region', { name: 'CSV import preview' })).toContainText('Matches an earlier row');
  await dialog.getByRole('button', { name: 'Import 2 members' }).click();
  await expect(page.getByRole('button', { name: 'View Isha Verma' })).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('expired');
  await expect(page.getByRole('button', { name: 'View Nila Singh' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Isha Verma' })).toHaveCount(0);
  await page.getByLabel('Status', { exact: true }).selectOption('all');

  await page.getByRole('button', { name: 'View Isha Verma' }).click();
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await dialog.getByLabel('Amount received (INR)').fill('300');
  await dialog.getByRole('button', { name: 'Save payment' }).click();
  await expect(dialog).toHaveCount(0);
  await navigation.getByRole('button', { name: 'Payments', exact: true }).click();
  await page.getByRole('button', { name: 'Correct amount' }).click();
  await dialog.getByLabel('Corrected amount (INR)').fill('100');
  await dialog.getByLabel('Reason for correction').fill('Corrected cash entry');
  await dialog.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText('Corrected · Original ₹300.00')).toBeVisible();
  await navigation.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Gym activity' })).toContainText('Corrected cash entry');
  await navigation.getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: 'View Isha Verma' }).click();
  await expect(dialog.getByText('₹400.00 outstanding')).toBeVisible();
  await dialog.getByRole('button', { name: 'Freeze plan' }).click();
  await dialog.getByLabel('Last freeze day').fill(addDays(today, 2));
  await dialog.getByLabel('Reason for freeze').fill('Away for three days');
  await dialog.getByRole('button', { name: 'Save freeze' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel('Status', { exact: true }).selectOption('frozen');
  await expect(page.getByRole('button', { name: 'View Isha Verma' })).toBeVisible();
  await page.getByRole('button', { name: 'Check in member', exact: true }).click();
  await dialog.getByRole('searchbox', { name: 'Find a member' }).fill('Isha');
  await expect(dialog.getByText('Check-in unavailable')).toBeVisible();
  await dialog.getByRole('button', { name: 'View Isha Verma' }).click();
  await dialog.getByRole('button', { name: 'Cancel freeze' }).click();
  await dialog.getByLabel('Reason for change').fill('Member stayed in town');
  await dialog.getByRole('button', { name: 'End freeze' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Check in member', exact: true }).click();
  await dialog.getByRole('searchbox', { name: 'Find a member' }).fill('Isha');
  await expect(dialog.getByRole('button', { name: 'Check in Isha Verma' })).toBeEnabled();
});
