import { afterEach, describe, expect, it } from 'vitest';
import { LiftLogDB } from '@/db/liftlog';
import { importGuestData, syncAccount } from '@/cloud/sync';
import { parseCloudRows, type CloudBatch, type CloudRow, type SyncTransport } from '@/cloud/types';

const databases: LiftLogDB[] = [];
function local() {
  const database = new LiftLogDB(`sync-test-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
}

afterEach(async () => { await Promise.all(databases.splice(0).map((database) => database.delete())); });

function server() {
  const rows = new Map<string, CloudRow>();
  const accepted = new Set<string>();
  let revision = 0;
  const transport: SyncTransport = {
    async push(batch: CloudBatch) {
      const result = batch.changes.map((change) => {
        const key = `${change.kind}:${change.record_id}`;
        const old = rows.get(key);
        if (old && (accepted.has(batch.batchId) || old.payload === null && change.seen_revision < old.revision)) return old;
        const row = { kind: change.kind, record_id: change.record_id, payload: change.payload, revision: ++revision };
        rows.set(key, row);
        return row;
      });
      accepted.add(batch.batchId);
      return parseCloudRows(result);
    },
    async pull(cursor: number) {
      return parseCloudRows([...rows.values()].filter((row) => row.revision > cursor).sort((a, b) => a.revision - b.revision).slice(0, 100));
    },
  };
  return { transport, accepted };
}

describe('local-first account sync', () => {
  it('syncs gym member records and settings to a second device', async () => {
    const first = local(); const second = local(); const { transport } = server();
    const member = { id: 'gym-member', name: 'Asha', phone: '', email: '', trainer: '', notes: '', archived: false, createdAt: 1 };
    await first.gymMembers.put(member);
    await first.gymSettings.put({ id: 'gym', name: 'Iron House', phone: '' });
    await syncAccount(first, transport); await syncAccount(second, transport);
    expect(await second.gymMembers.get(member.id)).toEqual(member);
    expect((await second.gymSettings.get('gym'))?.name).toBe('Iron House');
  });
  it('copies guest history once without replacing account preferences or deleting guest data', async () => {
    const guest = local();
    const account = local();
    const workout = await guest.startWorkout();
    await guest.nutritionGoals.put({ id: 'daily', kcal: 2_000, protein: null, carbs: null, fat: null });
    await account.nutritionGoals.put({ id: 'daily', kcal: 2_200, protein: null, carbs: null, fat: null });

    expect(await importGuestData(guest, account)).toBe(1);
    expect(await importGuestData(guest, account)).toBe(0);
    expect(await account.workouts.get(workout.id)).toEqual(workout);
    expect(await guest.workouts.get(workout.id)).toEqual(workout);
    expect((await account.nutritionGoals.get('daily'))?.kcal).toBe(2_200);
  });

  it('imports only the guest records for the signed-in account type', async () => {
    const guest = local();
    const personal = local();
    const owner = local();
    const workout = await guest.startWorkout();
    const member = { id: 'gym-member', name: 'Asha', phone: '', email: '', trainer: '', notes: '', archived: false, createdAt: 1 };
    await guest.gymMembers.put(member);

    expect(await importGuestData(guest, personal, 'personal')).toBe(1);
    expect(await personal.workouts.get(workout.id)).toEqual(workout);
    expect(await personal.gymMembers.count()).toBe(0);
    expect(await importGuestData(guest, owner, 'gym_owner')).toBe(1);
    expect(await owner.gymMembers.get(member.id)).toEqual(member);
    expect(await owner.workouts.count()).toBe(0);
  });

  it('reuses an unacknowledged batch after reload and downloads the record on a second device', async () => {
    const first = local();
    const second = local();
    const { transport, accepted } = server();
    const workout = await first.startWorkout();
    const failedReply: SyncTransport = { ...transport, async push(batch) {
      await transport.push(batch);
      throw new Error('Connection interrupted');
    } };
    await expect(syncAccount(first, failedReply)).rejects.toThrow('Connection interrupted');
    const pending = await first.cloudState.get('outbox');
    expect(pending?.key).toBe('outbox');
    const reopened = new LiftLogDB(first.name);
    try {
      await syncAccount(reopened, transport);
      expect(await reopened.cloudState.get('outbox')).toBeUndefined();
      expect(accepted.size).toBe(1);
      await syncAccount(second, transport);
      expect(await second.workouts.get(workout.id)).toEqual(workout);
    } finally { reopened.close(); }
  });

  it('keeps a local edit made while an earlier batch is in flight', async () => {
    const first = local();
    const second = local();
    const { transport } = server();
    const workout = await first.startWorkout();
    let observed = false;
    await syncAccount(first, { ...transport, async push(batch) {
      const response = await transport.push(batch);
      if (!observed) {
        observed = true;
        await first.workouts.update(workout.id, { title: 'Edited while uploading' });
      }
      return response;
    } });
    await syncAccount(second, transport);
    expect((await second.workouts.get(workout.id))?.title).toBe('Edited while uploading');
  });

  it('merges independently logged foods and preserves the recorded nutrition source', async () => {
    const first = local();
    const second = local();
    const { transport } = server();
    const food = {
      id: 'food:rice', name: 'Cooked rice', aliases: ['rice'], portions: [],
      source: { kind: 'USDA' as const, reference: 'Cooked rice' }, per100g: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
    };
    const log = { food, amount: 100, unit: 'g' as const, date: '2026-11-21', meal: 'Lunch' as const, createdAt: Date.now() };
    await first.foodLogs.add({ ...log, id: 'first' });
    await second.foodLogs.add({ ...log, id: 'second', amount: 150 });
    await syncAccount(first, transport);
    await syncAccount(second, transport);
    await syncAccount(first, transport);
    expect(await first.foodLogs.orderBy('id').toArray()).toEqual([{ ...log, id: 'first' }, { ...log, id: 'second', amount: 150 }]);
  });

  it('honours a remote tombstone over a stale edit and merges separate workouts', async () => {
    const first = local();
    const second = local();
    const { transport } = server();
    const workout = await first.startWorkout();
    await syncAccount(first, transport);
    await syncAccount(second, transport);
    await first.workouts.delete(workout.id);
    const added = await first.startWorkout();
    await syncAccount(first, transport);
    await second.workouts.update(workout.id, { title: 'Stale edit' });
    await syncAccount(second, transport);
    expect(await second.workouts.get(workout.id)).toBeUndefined();
    expect(await second.workouts.get(added.id)).toEqual(added);
  });

  it('keeps an intentional re-add made while its own deletion is in flight', async () => {
    const first = local();
    const second = local();
    const { transport } = server();
    const favourite = { id: 'catalog:Bench_Press' };
    await first.favourites.add(favourite);
    await syncAccount(first, transport);
    await first.favourites.delete(favourite.id);
    let readded = false;
    await syncAccount(first, { ...transport, async push(batch) {
      const reply = await transport.push(batch);
      if (!readded) {
        readded = true;
        await first.favourites.add(favourite);
      }
      return reply;
    } });
    await syncAccount(second, transport);
    expect(await second.favourites.get(favourite.id)).toEqual(favourite);
  });
});
