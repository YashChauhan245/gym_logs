import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { LiftLogDB } from '@/db/liftlog';
import { checkInGymMember, checkOutGymMember, correctGymPayment, endGymFreeze, freezeGymMembership, importGymMembers, recordGymPayment, registerGymMember, renewGymMembership, restoreGymBackup, saveGymPlan } from '@/db/gym';
import { addDays, amountMinor, csvCell, dueAmount, gymSettingsSchema, membershipStatus, renewalStart, type GymMember, type GymPayment } from '@/domain/gym';
import { localDate } from '@/domain/date';
import { parseCloudRows } from '@/cloud/types';
import { gymReceipt } from '@/domain/gym-receipt';
import { effectivePayments, effectivePeriods, latestCorrections } from '@/domain/gym-activity';
import { gymImportTemplate, reviewGymCsv } from '@/domain/gym-import';

const databases: LiftLogDB[] = [];
const today=localDate();
function database() { const db=new LiftLogDB(`gym-test-${crypto.randomUUID()}`);databases.push(db);return db; }
afterEach(async () => { await Promise.all(databases.splice(0).map((db) => db.delete())); });
const member = (): GymMember => ({ id: crypto.randomUUID(), name:'Asha Patel',phone:'9876543210',email:'',trainer:'',notes:'',archived:false,createdAt:Date.now() });
async function setup() {
  const db=database();const m=member();
  await saveGymPlan(db,{id:'monthly',name:'Monthly',durationDays:30,feeMinor:100000,active:true});
  const membership=await registerGymMember(db,m,'monthly',today);
  return {db,member:{...m,id:membership.memberId},membership};
}
function payment(memberId:string,membershipId:string,amount=40000):GymPayment { return {id:crypto.randomUUID(),memberId,membershipId,amountMinor:amount,paidOn:today,method:'UPI',reference:'receipt-123',createdAt:Date.now()}; }

describe('membership recordkeeping', () => {
  it('keeps inclusive periods correct over leap days and year boundaries', () => {
    expect(addDays('2028-02-28',1)).toBe('2028-02-29');
    expect(addDays('2026-12-31',1)).toBe('2027-01-01');
    expect(membershipStatus({startDate:today,endDate:today} as never,today)).toBe('Active');
    expect(membershipStatus({startDate:addDays(today,1),endDate:addDays(today,2)} as never,today)).toBe('Upcoming');
  });
  it('parses exact decimal amounts and blocks precision loss and spreadsheet formulas', () => {
    expect(amountMinor('1000.05')).toBe(100005);
    expect(amountMinor('0.1')).toBe(10);
    for(const text of ['-1','1e4','1.001','NaN','Infinity']) expect(()=>amountMinor(text)).toThrow();
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });
  it('snapshots fees and preserves old memberships when prices change or membership renews',async()=>{
    const {db,member:m,membership:first}=await setup();
    await saveGymPlan(db,{id:'monthly',name:'New monthly',durationDays:30,feeMinor:120000,active:true});
    const start=renewalStart(m.id,await db.gymMemberships.toArray(),today);
    expect(start).toBe(addDays(today,30));
    const next=await renewGymMembership(db,m.id,'monthly',start);
    expect((await db.gymMemberships.get(first.id))?.feeMinor).toBe(100000);
    expect(next.feeMinor).toBe(120000);
    expect(await db.gymMemberships.count()).toBe(2);
    await expect(renewGymMembership(db,m.id,'monthly',today)).rejects.toThrow('overlap');
  });
  it('rolls back a new member when the plan is missing or retired',async()=>{
    const db=database();const m=member();
    await expect(registerGymMember(db,m,'missing',today)).rejects.toThrow('plan');
    expect(await db.gymMembers.count()).toBe(0);
    await saveGymPlan(db,{id:'retired',name:'Retired',durationDays:30,feeMinor:100,active:false});
    await expect(registerGymMember(db,m,'retired',today)).rejects.toThrow('plan');
    expect(await db.gymMemberships.count()).toBe(0);
  });
  it('supports partial payments and serializes concurrent attempts above the remaining balance',async()=>{
    const {db,member:m,membership}=await setup();
    await recordGymPayment(db,payment(m.id,membership.id,40000));
    expect(dueAmount(membership,await db.gymPayments.toArray())).toBe(60000);
    const attempts=await Promise.allSettled([recordGymPayment(db,payment(m.id,membership.id,50000)),recordGymPayment(db,payment(m.id,membership.id,50000))]);
    expect(attempts.filter((r)=>r.status==='fulfilled')).toHaveLength(1);
    expect(dueAmount(membership,await db.gymPayments.toArray())).toBe(10000);
    await expect(recordGymPayment(db,payment('wrong-member',membership.id,100))).rejects.toThrow('membership');
    await expect(recordGymPayment(db,{...payment(m.id,membership.id,100),paidOn:addDays(today,1)})).rejects.toThrow('future');
  });
  it('deduplicates check-ins, checks members out and blocks expired or archived members',async()=>{
    const {db,member:m}=await setup();
    const checks=await Promise.allSettled([checkInGymMember(db,m.id,today),checkInGymMember(db,m.id,today)]);
    expect(checks.filter((r)=>r.status==='fulfilled')).toHaveLength(1);
    expect(await db.gymAttendance.count()).toBe(1);
    await checkOutGymMember(db,m.id,today);
    expect((await db.gymAttendance.get(`${m.id}:${today}`))?.checkedOutAt).toBeTypeOf('number');
    await expect(checkOutGymMember(db,m.id,today)).rejects.toThrow('no open');
    await expect(checkInGymMember(db,m.id,addDays(today,31))).rejects.toThrow('active membership');
    await db.gymMembers.update(m.id,{archived:true});
    await expect(checkInGymMember(db,m.id,addDays(today,1))).rejects.toThrow('active membership');
  });
  it('adds gym stores while preserving a version-three workout',async()=>{
    const name=`gym-upgrade-${crypto.randomUUID()}`;
    const old=new Dexie(name);
    old.version(3).stores({profiles:'id',workouts:'id, [status+startedAt], localDate, finishedAt',workoutExercises:'id, workoutId, [workoutId+position]',sets:'id, workoutId, [workoutExerciseId+position], [exerciseId+completedAt]',customExercises:'id, name',favourites:'id',deviceState:'id',foodLogs:'id, date, [date+meal]',nutritionGoals:'id',customFoods:'id',cloudBaseline:'key',cloudState:'key'});
    await old.table('workouts').put({id:'preserved',title:'Leg day',status:'finished',startedAt:1,updatedAt:1,localDate:today,notes:''});old.close();
    const db=new LiftLogDB(name);databases.push(db);
    expect((await db.workouts.get('preserved'))?.title).toBe('Leg day');
    expect(await db.gymMembers.count()).toBe(0);
  });
  it('validates gym sync payloads and rejects negative or malformed payment rows',()=>{
    const m=member();
    expect(parseCloudRows([{kind:'gymMembers',record_id:m.id,revision:1,payload:m}])[0].payload?.name).toBe(m.name);
    expect(()=>parseCloudRows([{kind:'gymPayments',record_id:'bad',revision:2,payload:{id:'bad',amountMinor:-100}}])).toThrow();
  });
  it('reviews quoted CSV, skips duplicates and invalid rows, and carries opening balances without creating payments', async () => {
    const db = database();
    const csv = '\uFEFF' + gymImportTemplate +
      `"Patel, Asha",+919000000001,asha@example.invalid,,"First line\r\nSecond line",Monthly,${today},,1500,500,30\r\n` +
      `Duplicate,919000000001,,,same number,Monthly,${today},,,,\r\n` +
      'Incorrect,,,,,Monthly,not-a-date,,,,\r\n';
    const review = reviewGymCsv(csv, [], []);
    expect(review.records.map((row) => row.member.name)).toEqual(['Patel, Asha']);
    expect(review.records[0].member.notes).toContain('\nSecond line');
    expect(review.issues.map((row) => row.status)).toEqual(['Duplicate', 'Invalid']);
    expect(review.newPlanCount).toBe(1);
    expect(await importGymMembers(db, csv, review.records, 'owner@example.invalid')).toBe(1);
    const [period] = await db.gymMemberships.toArray();
    expect(period.endDate).toBe(addDays(today, 29));
    expect(dueAmount(period, [])).toBe(50_000);
    expect(await db.gymPayments.count()).toBe(0);
    expect(await db.gymEvents.toArray()).toMatchObject([{ kind: 'members-imported', actor: 'owner@example.invalid', count: 1 }]);
    await expect(importGymMembers(db, csv, review.records)).rejects.toThrow('Review the import again');
    expect(await db.gymMembers.count()).toBe(1);
  });

  it('retains the original receipt while successive corrections update the balance and activity', async () => {
    const { db, member: m, membership } = await setup();
    await recordGymPayment(db, payment(m.id, membership.id, 40_000));
    const [original] = await db.gymPayments.toArray();
    await expect(correctGymPayment(db, original.id, 101_000, 40_000, 'Too large')).rejects.toThrow('exceed');
    await correctGymPayment(db, original.id, 25_000, 40_000, 'Entry typo', 'owner@example.invalid');
    await expect(correctGymPayment(db, original.id, 35_000, 40_000, 'Old tab')).rejects.toThrow('corrected elsewhere');
    await correctGymPayment(db, original.id, 0, 25_000, 'Duplicate receipt');
    const events = await db.gymEvents.toArray();
    const latest = latestCorrections(events);
    expect(dueAmount(membership, effectivePayments([original], latest))).toBe(100_000);
    expect(await db.gymPayments.get(original.id)).toEqual(original);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'payment-corrected', amountMinor: 25_000, actor: 'owner@example.invalid' }));
    expect(gymReceipt(original, m.name, undefined, membership, latest.get(original.id))).toContain('Voided payment receipt');
  });

  it('blocks frozen check-ins, shifts scheduled renewals and removes unused freeze days on early return', async () => {
    const { db, member: m, membership } = await setup();
    const renewal = await renewGymMembership(db, m.id, 'monthly', addDays(today, 30));
    const start = addDays(today, 1);
    await freezeGymMembership(db, membership.id, start, addDays(start, 2), 'Travelling');
    await expect(checkInGymMember(db, m.id, start)).rejects.toThrow('active membership');
    await expect(freezeGymMembership(db, membership.id, start, start, 'Duplicate pause')).rejects.toThrow('active');
    const freeze = (await db.gymEvents.toArray()).find((entry) => entry.kind === 'membership-frozen')!;
    const periods = await db.gymMemberships.toArray();
    const scheduled = effectivePeriods(periods, await db.gymEvents.toArray());
    expect(scheduled.find((row) => row.id === renewal.id)?.startDate).toBe(addDays(today, 33));
    await endGymFreeze(db, freeze.id, 'Returned early', 'This device', addDays(start, 1));
    await expect(checkInGymMember(db, m.id, addDays(start, 1))).resolves.toBeUndefined();
    const resumed = effectivePeriods(periods, await db.gymEvents.toArray());
    expect(resumed.find((row) => row.id === membership.id)?.endDate).toBe(addDays(today, 30));
    expect(resumed.find((row) => row.id === renewal.id)?.startDate).toBe(addDays(today, 31));
  });
  it('keeps optional gym branding compatible with older settings and escapes receipt content', () => {
    const previous = { id: 'gym', name: 'Central & Barbell', phone: '0000' };
    expect(gymSettingsSchema.parse(previous)).toEqual(previous);
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    const settings = gymSettingsSchema.parse({ ...previous, logo });
    expect(parseCloudRows([{ kind: 'gymSettings', record_id: 'gym', revision: 1, payload: settings }])[0].payload?.logo).toBe(logo);
    expect(gymSettingsSchema.safeParse({ ...previous, logo: 'data:image/svg+xml;base64,AAAA' }).success).toBe(false);
    expect(gymSettingsSchema.safeParse({ ...previous, logo: `data:image/png;base64,${'A'.repeat(44_000)}` }).success).toBe(false);
    const result = gymReceipt({ ...payment('member', 'membership'), reference: '<b>untrusted</b>' }, 'Asha <script>', settings);
    expect(result).toContain(`src="${logo}"`);
    expect(result).toContain('Central &amp; Barbell');
    expect(result).toContain('Asha &lt;script&gt;');
    expect(result).toContain('&lt;b&gt;untrusted&lt;/b&gt;');
  });
  it('restores a gym backup atomically and preserves existing records', async () => {
    const { db, member: ownerMember, membership } = await setup();
    const data = {
      format: 'liftlog-gym', version: 1, exportedAt: new Date().toISOString(),
      members: await db.gymMembers.toArray(), plans: await db.gymPlans.toArray(),
      memberships: [membership], payments: [payment(ownerMember.id, membership.id)], attendance: [],
    };
    const restored = database();
    await expect(restoreGymBackup(restored, { ...data, memberships: [] })).rejects.toThrow('missing related');
    await expect(restoreGymBackup(restored, { ...data, payments: [...data.payments, ...data.payments] })).rejects.toThrow();
    expect(await restored.gymMembers.count()).toBe(0);
    await restoreGymBackup(restored, data);
    expect(await restored.gymMembers.get(ownerMember.id)).toMatchObject({ name: ownerMember.name });
    expect(dueAmount(membership, await restored.gymPayments.toArray())).toBe(60000);
    await expect(restoreGymBackup(restored, data)).rejects.toThrow('empty workspace');
  });
});
