import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { expect, test, type Page, type Route } from '@playwright/test';

const localEnv = existsSync('.env.local') ? parseEnv(readFileSync('.env.local', 'utf8')) : {};
const configured = Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL ?? localEnv.NEXT_PUBLIC_SUPABASE_URL) &&
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)?.startsWith('sb_publishable_'));
const owner = '9bbf9b24-7145-4cec-8585-b30e5d56fc81';

function cors(route: Route) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': route.request().headers()['access-control-request-headers'] ?? 'authorization, apikey, content-type',
  };
}

async function storeSession(page: Page, email: string) {
  await page.evaluate(({ id, email }) => {
    const expires = Math.floor(Date.now() / 1000) + 3_600;
    const token = [btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), btoa(JSON.stringify({ sub: id, exp: expires })), 'local-test'].join('.');
    localStorage.setItem('liftlog.supabase.session', JSON.stringify({
      access_token: token, refresh_token: 'local-browser-test', token_type: 'bearer', expires_at: expires, expires_in: 3600,
      user: { id, email, aud: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-11-21T00:00:00Z' },
    }));
  }, { id: owner, email });
}

test.use({ serviceWorkers: 'block' });

test('imports a guest Quick Log only after approval and preserves it on sign-out', async ({ page, context }) => {
  test.skip(!configured, 'A configured cloud build is required for this browser test.');
  let records: { kind: string; record_id: string; payload: unknown; revision: number }[] = [];
  const uploaded = new Set<string>();
  await context.route('**/rest/v1/rpc/liftlog_*', async (route) => {
    const headers = cors(route);
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith('liftlog_account_role')) return route.fulfill({ headers, json: 'personal' });
    const request = route.request().postDataJSON();
    expect(request.p_owner).toBe(owner);
    if (route.request().url().endsWith('liftlog_sync_pull')) return route.fulfill({ headers, json: records.filter((row) => row.revision > request.p_after) });
    if (route.request().url().endsWith('liftlog_sync_push')) {
      uploaded.add(request.p_batch_id);
      const items = request.p_changes.map((change: { kind: string; record_id: string; payload: unknown }, index: number) => ({ ...change, revision: records.length + index + 1 }));
      records = [...records, ...items];
      return route.fulfill({ headers, json: items });
    }
    return route.abort();
  });
  await context.route('**/auth/v1/logout?*', (route) => route.fulfill({ status: 204, headers: cors(route) }));

  await page.goto('/#today');
  await page.getByRole('button', { name: 'Open Quick Log' }).click();
  await page.getByLabel('Workout text').fill('Bench press 60kg x 8');
  await page.getByRole('button', { name: 'Save to workout' }).click();
  await expect(page.getByText('60 kg × 8')).toBeVisible();

  await storeSession(page, 'test@example.invalid');
  await page.goto('/?test-cloud-reload=1#profile');
  const cloud = page.getByRole('region', { name: 'Cloud sync' });
  await expect(cloud.getByText('test@example.invalid')).toBeVisible();
  await expect(cloud.getByText('Up to date')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gym', exact: true })).toHaveCount(0);
  expect(uploaded.size).toBe(0);
  await cloud.getByRole('button', { name: 'Import guest data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Import data' }).click();
  await expect(page.getByText('Guest data copied into this account.')).toBeVisible();
  await expect.poll(() => records.some((row) => row.kind === 'sets')).toBe(true);

  await cloud.getByRole('button', { name: 'Sign out' }).click();
  await expect(cloud.getByRole('button', { name: 'Email a sign-in link' })).toBeVisible();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Resume workout' }).click();
  await expect(page.getByText('60 kg × 8')).toBeVisible();
});

test('opens the front desk and owner profile for a gym owner sign-in', async ({ page, context }) => {
  test.skip(!configured, 'A configured cloud build is required for this browser test.');
  const email = 'gym@example.invalid';
  await context.route('**/auth/v1/otp**', async (route) => {
    const headers = cors(route);
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    expect(route.request().postDataJSON().email).toBe(email);
    return route.fulfill({ headers, json: {} });
  });
  await context.route('**/rest/v1/rpc/liftlog_*', async (route) => {
    const headers = cors(route);
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith('liftlog_account_role')) {
      expect(route.request().postDataJSON()).toEqual({ p_role: 'gym_owner' });
      return route.fulfill({ headers, json: 'gym_owner' });
    }
    expect(route.request().postDataJSON().p_owner).toBe(owner);
    return route.fulfill({ headers, json: [] });
  });

  await page.goto('/#profile');
  await page.getByRole('radio', { name: /Gym owner/ }).check();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Email a sign-in link' }).click();
  await expect(page.getByText('Open the sign-in link in the same browser you used to request it.')).toBeVisible();
  await storeSession(page, email);
  await page.goto('/?liftlog_auth=1');
  await expect(page).toHaveURL(/#gym$/);
  await expect(page.getByRole('link', { name: 'Gym', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Workouts', exact: true })).toHaveCount(0);
  await page.evaluate(() => { window.location.hash = 'nutrition'; });
  await expect(page).toHaveURL(/#gym$/);
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gym owner profile' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});
