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
