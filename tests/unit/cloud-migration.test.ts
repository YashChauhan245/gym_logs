import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const accountA = '69417540-5334-4d62-b606-834f31b0a702';
const accountB = 'cc9f1d29-3f7a-45a5-b942-66673fe927ca';
const migration = readFileSync('supabase/migrations/202611210001_liftlog_sync.sql', 'utf8');
let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
  await pg.query('insert into auth.users(id) values ($1), ($2)', [accountA, accountB]);
  await pg.exec(migration);
  await pg.exec(readFileSync('supabase/migrations/202611250001_gym_management.sql', 'utf8'));
  await pg.exec(readFileSync('supabase/migrations/202611250002_gym_operations.sql', 'utf8'));
  await asUser(accountA);
  await push(accountA, crypto.randomUUID(), [{ kind: 'gymSettings', record_id: 'gym', seen_revision: 0, payload: { id: 'gym', name: 'Legacy gym', phone: '' } }]);
  await pg.exec('reset role');
  await pg.exec(readFileSync('supabase/migrations/202611250003_account_roles.sql', 'utf8'));
});
afterAll(async () => { await pg?.close(); });

async function asUser(owner: string) {
  await pg.exec('set role authenticated');
  await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
}

type Row = { record_id: string; revision: number; payload: { id: string; title: string } | null };
async function push(owner: string, batch: string, changes: object[]) {
  return (await pg.query<Row>('select * from public.liftlog_sync_push($1, $2, $3::jsonb)', [owner, batch, JSON.stringify(changes)])).rows;
}

const record = (title: string, seen_revision = 0) => ({ kind: 'workouts', record_id: 'test-entry', payload: { id: 'test-entry', title }, seen_revision });

describe('Supabase migration in PostgreSQL', () => {
  it('backfills legacy gym owners and rejects gym writes and role changes for personal accounts', async () => {
    const assigned = () => pg.query('select public.liftlog_account_role($1) as role', ['personal']);
    await asUser(accountA);
    expect((await assigned()).rows).toEqual([{ role: 'gym_owner' }]);
    await asUser(accountB);
    expect((await assigned()).rows).toEqual([{ role: 'personal' }]);
    expect((await pg.query("select public.liftlog_account_role('gym_owner') as role")).rows).toEqual([{ role: 'personal' }]);
    await expect(push(accountB, crypto.randomUUID(), [{ kind: 'gymSettings', record_id: 'gym', seen_revision: 0, payload: { id: 'gym', name: 'Personal gym', phone: '' } }])).rejects.toMatchObject({ code: '42501' });
    await expect(pg.query('select * from public.liftlog_sync_pull($1, 0)', [accountA])).rejects.toMatchObject({ code: '42501' });
  });
  it('keeps gym events owner-private and returns the original when a change reuses an event ID', async () => {
    await asUser(accountA);
    const payload = { id: 'import-test', kind: 'members-imported', count: 2, createdAt: 1, actor: 'Test owner' };
    const row = { kind: 'gymEvents', record_id: payload.id, payload, seen_revision: 0 };
    const [first] = await push(accountA, crypto.randomUUID(), [row]);
    const reused = await push(accountA, crypto.randomUUID(), [{ ...row, seen_revision: first.revision, payload: { ...payload, count: 50 } }]);
    expect(reused[0]).toEqual(first);
    await expect(push(accountA, crypto.randomUUID(), [{ ...row, seen_revision: first.revision, payload: null }])).rejects.toMatchObject({ code: '22023' });
    await asUser(accountB);
    const second = await pg.query('select * from public.liftlog_sync_pull($1, 0) where kind = $2', [accountB, 'gymEvents']);
    expect(second.rows).toEqual([]);
  });
  it('has a public readiness probe and keeps record access behind authenticated RPCs', async () => {
    await pg.exec('set role anon');
    expect((await pg.query('select public.liftlog_cloud_ready() as ready')).rows).toEqual([{ ready: true }]);
    await expect(pg.query('select * from public.liftlog_sync_pull($1, 0)', [accountA])).rejects.toMatchObject({ code: '42501' });
    await asUser(accountA);
    await expect(pg.query('select * from liftlog_private.records')).rejects.toMatchObject({ code: '42501' });
    await expect(push(accountB, crypto.randomUUID(), [record('Wrong owner')])).rejects.toMatchObject({ code: '42501' });
  });

  it('isolates accounts, replays a batch once, and rejects resurrection after a delete', async () => {
    await asUser(accountA);
    const batch = crypto.randomUUID();
    const [first] = await push(accountA, batch, [record('Account A')]);
    expect(await push(accountA, batch, [record('Account A')])).toEqual([first]);
    await expect(push(accountA, batch, [record('Changed batch')])).rejects.toMatchObject({ code: '22023' });
    await asUser(accountB);
    expect((await pg.query('select * from public.liftlog_sync_pull($1, 0)', [accountB])).rows).toEqual([]);
    await expect(pg.query('select * from public.liftlog_sync_pull($1, 0)', [accountA])).rejects.toMatchObject({ code: '42501' });
    await push(accountB, crypto.randomUUID(), [record('Account B')]);
    await asUser(accountA);
    const [deleted] = await push(accountA, crypto.randomUUID(), [{ ...record('Account A', first.revision), payload: null }]);
    expect(deleted.payload).toBeNull();
    expect(await push(accountA, crypto.randomUUID(), [record('Stale edit', first.revision)])).toEqual([deleted]);
    await asUser(accountB);
    expect((await pg.query<Row>('select * from public.liftlog_sync_pull($1, 0)', [accountB])).rows[0]?.payload?.title).toBe('Account B');
  });

  it('keeps gym members and payments private to their owner account', async () => {
    await asUser(accountA);
    const change = { kind: 'gymMembers', record_id: 'member-a', payload: { id: 'member-a', name: 'Private member' }, seen_revision: 0 };
    await push(accountA, crypto.randomUUID(), [change]);
    await asUser(accountB);
    const rows = (await pg.query<{ kind: string }>('select * from public.liftlog_sync_pull($1, 0)', [accountB])).rows;
    expect(rows.some((row) => row.kind === 'gymMembers')).toBe(false);
    await expect(push(accountA, crypto.randomUUID(), [change])).rejects.toMatchObject({ code: '42501' });
  });

  it('deletes only the signed-in account and its cloud rows', async () => {
    await asUser(accountB);
    await expect(pg.query('select public.liftlog_delete_account($1)', [accountA])).rejects.toMatchObject({ code: '42501' });
    await pg.query('select public.liftlog_delete_account($1)', [accountB]);
    await expect(pg.query('select * from public.liftlog_sync_pull($1, 0)', [accountB])).rejects.toMatchObject({ code: '42501' });
    await pg.exec('reset role');
    expect((await pg.query('select id from auth.users order by id')).rows).toEqual([{ id: accountA }]);
    expect((await pg.query('select distinct user_id from liftlog_private.records')).rows).toEqual([{ user_id: accountA }]);
  });
});
