import type { Table } from 'dexie';
import { LiftLogDB } from '@/db/liftlog';
import { syncedStores, type Change, type CloudBatch, type CloudRow, type RecordData, type SyncedStore, type SyncTransport } from './types';

const pushLimit = 50;
const pullLimit = 100;
const pagesPerRun = 12;
const keyFor = (kind: SyncedStore, id: string) => `${kind}:${id}`;

function table(db: LiftLogDB, kind: SyncedStore) {
  return db.table<RecordData, string>(kind) as Table<RecordData, string>;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

const equal = (left: unknown, right: unknown) => JSON.stringify(stableValue(left ?? null)) === JSON.stringify(stableValue(right ?? null));

async function localRows(db: LiftLogDB) {
  return (await Promise.all(syncedStores.map(async (kind) => (await table(db, kind).toArray()).map((payload) => ({ kind, payload, record_id: payload.id }))))).flat();
}

function syncTables(db: LiftLogDB) {
  return [...syncedStores.map((kind) => table(db, kind)), db.cloudBaseline, db.cloudState];
}

async function stageBatch(db: LiftLogDB) {
  return db.transaction('rw', syncTables(db), async () => {
    const pending = await db.cloudState.get('outbox');
    if (pending?.key === 'outbox') return pending;
    const local = await localRows(db);
    const baseline = new Map((await db.cloudBaseline.toArray()).map((row) => [row.key, row]));
    const changes: Change[] = [];
    for (const row of local) {
      const key = keyFor(row.kind, row.record_id);
      const before = baseline.get(key);
      baseline.delete(key);
      if (!equal(row.payload, before?.payload)) changes.push({ ...row, seen_revision: before?.revision ?? 0 });
      if (changes.length === pushLimit) break;
    }
    if (changes.length < pushLimit) {
      for (const row of baseline.values()) {
        if (row.payload !== null) changes.push({ kind: row.kind, record_id: row.record_id, payload: null, seen_revision: row.revision });
        if (changes.length === pushLimit) break;
      }
    }
    if (!changes.length) return null;
    const batch: CloudBatch = { key: 'outbox', batchId: crypto.randomUUID(), changes };
    await db.cloudState.put(batch);
    return batch;
  });
}

async function applyRow(db: LiftLogDB, incoming: CloudRow, sent?: Change) {
  const key = keyFor(incoming.kind, incoming.record_id);
  const before = await db.cloudBaseline.get(key);
  if (before && before.revision >= incoming.revision) return;
  const store = table(db, incoming.kind);
  const local = await store.get(incoming.record_id);
  const base = sent ? sent.payload : before?.payload;
  // Acknowledging an upload must not erase edits made after it was queued.
  // A remote tombstone wins against an older queued change.
  const remoteDeletion = incoming.payload === null && (!sent || sent.payload !== null);
  if (equal(local, base) || remoteDeletion) {
    if (incoming.payload === null) await store.delete(incoming.record_id);
    else if (!equal(local, incoming.payload)) await store.put(incoming.payload as RecordData);
  }
  await db.cloudBaseline.put({ ...incoming, key });
}

async function acceptBatch(db: LiftLogDB, batch: CloudBatch, acknowledged: CloudRow[]) {
  const byKey = new Map(acknowledged.map((row) => [keyFor(row.kind, row.record_id), row]));
  if (byKey.size !== batch.changes.length || batch.changes.some((item) => !byKey.has(keyFor(item.kind, item.record_id)))) {
    throw new Error('The cloud did not acknowledge every record. Changes remain saved locally.');
  }
  await db.transaction('rw', syncTables(db), async () => {
    const current = await db.cloudState.get('outbox');
    if (current?.key !== 'outbox' || current.batchId !== batch.batchId) return;
    for (const change of batch.changes) await applyRow(db, byKey.get(keyFor(change.kind, change.record_id))!, change);
    await db.cloudState.delete('outbox');
  });
}

async function pullPage(db: LiftLogDB, transport: SyncTransport) {
  const cursor = await db.cloudState.get('cursor');
  const revision = cursor?.key === 'cursor' ? cursor.revision : 0;
  const rows = await transport.pull(revision);
  if (!rows.length) return false;
  await db.transaction('rw', syncTables(db), async () => {
    const current = await db.cloudState.get('cursor');
    for (const row of rows) await applyRow(db, row);
    await db.cloudState.put({ key: 'cursor', revision: Math.max(current?.key === 'cursor' ? current.revision : 0, ...rows.map((row) => row.revision)) });
  });
  return rows.length === pullLimit;
}

export async function syncAccount(db: LiftLogDB, transport: SyncTransport) {
  for (let page = 0; page < pagesPerRun; page++) {
    const batch = await stageBatch(db);
    if (!batch) break;
    await acceptBatch(db, batch, await transport.push(batch));
    if (page === pagesPerRun - 1) return true;
  }
  for (let page = 0; page < pagesPerRun; page++) if (!(await pullPage(db, transport))) return false;
  return true;
}

export async function importGuestData(guest: LiftLogDB, account: LiftLogDB) {
  if (guest.name === account.name) throw new Error('Sign in before importing guest data.');
  const rows = await guest.transaction('r', syncedStores.map((kind) => table(guest, kind)), () => localRows(guest));
  return account.transaction('rw', syncTables(account), async () => {
    let copied = 0;
    for (const row of rows) {
      const target = table(account, row.kind);
      if (await target.get(row.record_id) || await account.cloudBaseline.get(keyFor(row.kind, row.record_id))) continue;
      await target.add(row.payload);
      copied++;
    }
    return copied;
  });
}
