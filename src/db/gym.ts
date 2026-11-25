import type { LiftLogDB } from './liftlog';
import { localDate } from '@/domain/date';
import { addDays, currentMembership, daysBetween, dueAmount, gymAttendanceSchema, gymBackupSchema, gymEventSchema, gymMemberSchema, gymMembershipSchema, gymPaymentSchema, gymPlanSchema, membershipStatus, type GymEvent, type GymMember, type GymPayment } from '@/domain/gym';
import { effectivePayments, effectivePeriods, freezeWindows, latestCorrections } from '@/domain/gym-activity';
import { reviewGymCsv, type ImportMember } from '@/domain/gym-import';

type EventInput = { [K in GymEvent['kind']]: Omit<Extract<GymEvent, { kind: K }>, 'id' | 'createdAt' | 'actor'> }[GymEvent['kind']];
const localActor = 'This device';
const makeEvent = (actor: string, input: EventInput, after = 0) => gymEventSchema.parse({ ...input, id: crypto.randomUUID(), createdAt: Math.max(Date.now(), after + 1), actor });

async function memberPeriods(db: LiftLogDB, memberId: string) {
  const [periods, events] = await Promise.all([db.gymMemberships.where('memberId').equals(memberId).toArray(), db.gymEvents.where('memberId').equals(memberId).toArray()]);
  return effectivePeriods(periods, events);
}

async function createMembership(db: LiftLogDB, memberId: string, planId: string, startDate: string) {
  const [member, plan, previous] = await Promise.all([db.gymMembers.get(memberId), db.gymPlans.get(planId), memberPeriods(db, memberId)]);
  if (!member || member.archived) throw new Error('Choose a current member.');
  if (!plan || !plan.active) throw new Error('Choose an available membership plan.');
  const value = gymMembershipSchema.parse({ id: crypto.randomUUID(), memberId, planId, planName: plan.name, startDate, endDate: addDays(startDate, plan.durationDays - 1), feeMinor: plan.feeMinor, createdAt: Date.now() });
  if (previous.some((p) => value.startDate <= p.endDate && value.endDate >= p.startDate)) throw new Error('These dates overlap an existing membership. Start the renewal after it ends.');
  await db.gymMemberships.add(value);
  return value;
}

export async function registerGymMember(db: LiftLogDB, member: Omit<GymMember, 'id' | 'createdAt'>, planId: string, startDate: string, actor = localActor) {
  const value = gymMemberSchema.parse({ ...member, id: crypto.randomUUID(), createdAt: Date.now() });
  return db.transaction('rw', [db.gymMembers, db.gymPlans, db.gymMemberships, db.gymEvents], async () => {
    await db.gymMembers.add(value);
    const period = await createMembership(db, value.id, planId, startDate);
    await db.gymEvents.add(makeEvent(actor, { kind: 'member-registered', memberId: value.id, membershipId: period.id }));
    return period;
  });
}
export async function renewGymMembership(db: LiftLogDB, memberId: string, planId: string, startDate: string, actor = localActor) {
  return db.transaction('rw', [db.gymMembers, db.gymPlans, db.gymMemberships, db.gymEvents], async () => {
    const period = await createMembership(db, memberId, planId, startDate);
    await db.gymEvents.add(makeEvent(actor, { kind: 'membership-renewed', memberId, membershipId: period.id }));
    return period;
  });
}

export async function importGymMembers(db: LiftLogDB, csv: string, reviewed: ImportMember[], actor = localActor) {
  return db.transaction('rw', [db.gymMembers, db.gymPlans, db.gymMemberships, db.gymEvents], async () => {
    const [members, plans] = await Promise.all([db.gymMembers.toArray(), db.gymPlans.toArray()]);
    const { records } = reviewGymCsv(csv, members, plans);
    if (!records.length || JSON.stringify(records) !== JSON.stringify(reviewed)) throw new Error('The member list or plans changed. Review the import again.');
    const planIds = new Map<string, string>();
    const importedMembers = [];
    const importedPeriods = [];
    const createdAt = Date.now();
    for (const row of records) {
      const member = gymMemberSchema.parse({ ...row.member, createdAt, id: crypto.randomUUID() });
      importedMembers.push(member);
      if (!row.membership) continue;
      const { plan, ...period } = row.membership;
      let planId = plan.id ?? planIds.get(plan.name);
      if (!planId) {
        planId = crypto.randomUUID();
        await db.gymPlans.add(gymPlanSchema.parse({ ...plan, id: planId, active: true }));
        planIds.set(plan.name, planId);
      }
      importedPeriods.push(gymMembershipSchema.parse({ ...period, id: crypto.randomUUID(), memberId: member.id, planId, planName: plan.name, createdAt }));
    }
    await db.gymMembers.bulkAdd(importedMembers);
    await db.gymMemberships.bulkAdd(importedPeriods);
    await db.gymEvents.add(makeEvent(actor, { kind: 'members-imported', count: records.length }));
    return records.length;
  });
}
export async function saveGymPlan(db: LiftLogDB, value: unknown) { await db.gymPlans.put(gymPlanSchema.parse(value)); }
export async function saveGymMember(db: LiftLogDB, value: unknown) {
  const member = gymMemberSchema.parse(value);
  if (!await db.gymMembers.update(member.id, member)) throw new Error('This member could not be found.');
}
export async function recordGymPayment(db: LiftLogDB, input: Omit<GymPayment, 'id' | 'createdAt'>, actor = localActor) {
  const value = gymPaymentSchema.parse({ ...input, id: crypto.randomUUID(), createdAt: Date.now() });
  if (value.paidOn > localDate()) throw new Error('A received payment cannot have a future date.');
  return db.transaction('rw', [db.gymMemberships, db.gymPayments, db.gymEvents], async () => {
    const membership = await db.gymMemberships.get(value.membershipId);
    if (!membership || membership.memberId !== value.memberId) throw new Error('Choose this member’s membership.');
    const history = await db.gymEvents.where('memberId').equals(value.memberId).toArray();
    const previous = effectivePayments(await db.gymPayments.where('membershipId').equals(membership.id).toArray(), latestCorrections(history));
    if (value.amountMinor > dueAmount(membership, previous)) throw new Error('The amount exceeds this membership’s outstanding balance.');
    await db.gymPayments.add(value);
    await db.gymEvents.add(makeEvent(actor, { kind: 'payment-recorded', memberId: value.memberId, paymentId: value.id, amountMinor: value.amountMinor }));
  });
}

export async function correctGymPayment(db: LiftLogDB, paymentId: string, amountMinor: number, beforeMinor: number, reason: string, actor = localActor) {
  return db.transaction('rw', [db.gymMemberships, db.gymPayments, db.gymEvents], async () => {
    const payment = await db.gymPayments.get(paymentId);
    if (!payment) throw new Error('This payment could not be found.');
    const membership = await db.gymMemberships.get(payment.membershipId);
    if (!membership) throw new Error('This payment’s membership could not be found.');
    const corrections = latestCorrections(await db.gymEvents.where('memberId').equals(payment.memberId).toArray());
    const current = corrections.get(payment.id);
    if ((current?.amountMinor ?? payment.amountMinor) !== beforeMinor) throw new Error('This payment was corrected elsewhere. Reopen it to review the latest amount.');
    if (amountMinor === beforeMinor) throw new Error('Enter a different amount to correct this payment.');
    const event = makeEvent(actor, { kind: 'payment-corrected', memberId: payment.memberId, paymentId, amountMinor, beforeMinor, reason }, current?.createdAt);
    const previous = effectivePayments(await db.gymPayments.where('membershipId').equals(membership.id).toArray(), corrections);
    const remaining = dueAmount(membership, previous.filter((row) => row.id !== paymentId));
    if (amountMinor > remaining && amountMinor > beforeMinor) throw new Error('The corrected amount would exceed the membership fee.');
    await db.gymEvents.add(event);
  });
}

export async function freezeGymMembership(db: LiftLogDB, membershipId: string, startDate: string, endDate: string, reason: string, actor = localActor, today = localDate()) {
  return db.transaction('rw', [db.gymMembers, db.gymMemberships, db.gymEvents], async () => {
    const original = await db.gymMemberships.get(membershipId);
    if (!original || (await db.gymMembers.get(original.memberId))?.archived !== false) throw new Error('Choose a current member’s membership.');
    const event = makeEvent(actor, { kind: 'membership-frozen', memberId: original.memberId, membershipId, startDate, endDate, reason });
    if (startDate < today || daysBetween(startDate, endDate) >= 365) throw new Error('Choose a freeze starting today or later, with a maximum duration of 365 days.');
    const projected = (await memberPeriods(db, original.memberId)).find((period) => period.id === membershipId);
    if (membershipStatus(projected, startDate) !== 'Active') throw new Error('The membership must be active on the first day of the freeze.');
    if (projected?.holds?.some((hold) => startDate <= hold.endDate && endDate >= hold.startDate)) throw new Error('These dates overlap a scheduled freeze.');
    await db.gymEvents.add(event);
  });
}

export async function endGymFreeze(db: LiftLogDB, freezeId: string, reason: string, actor = localActor, today = localDate()) {
  return db.transaction('rw', db.gymEvents, async () => {
    const entry = await db.gymEvents.get(freezeId);
    if (entry?.kind !== 'membership-frozen') throw new Error('This freeze could not be found.');
    const window = freezeWindows(await db.gymEvents.where('memberId').equals(entry.memberId).toArray()).find((hold) => hold.id === freezeId);
    if (!window || window.endDate < today || window.endDate < window.startDate) throw new Error('This freeze has already ended.');
    await db.gymEvents.add(makeEvent(actor, { kind: 'freeze-ended', memberId: entry.memberId, freezeId, resumesOn: today, reason }));
  });
}
export async function checkInGymMember(db: LiftLogDB, memberId: string, day = localDate()) {
  return db.transaction('rw', [db.gymMembers, db.gymMemberships, db.gymAttendance, db.gymEvents], async () => {
    const member = await db.gymMembers.get(memberId);
    const memberships = await memberPeriods(db, memberId);
    if (!member || member.archived || membershipStatus(currentMembership(memberId, memberships, day), day) !== 'Active') throw new Error('Check-in needs an active membership for this date.');
    const id = `${memberId}:${day}`;
    if (await db.gymAttendance.get(id)) throw new Error('Attendance is already recorded for this member today.');
    await db.gymAttendance.add(gymAttendanceSchema.parse({ id, memberId, day, checkedInAt: Date.now() }));
  });
}
export async function checkOutGymMember(db: LiftLogDB, memberId: string, day = localDate()) {
  const id = `${memberId}:${day}`;
  return db.transaction('rw', db.gymAttendance, async () => {
    const row = await db.gymAttendance.get(id);
    if (!row || row.checkedOutAt !== undefined) throw new Error('There is no open check-in for this member.');
    await db.gymAttendance.update(id, { checkedOutAt: Math.max(Date.now(), row.checkedInAt) });
  });
}

export async function restoreGymBackup(db: LiftLogDB, input: unknown) {
  const result = gymBackupSchema.safeParse(input);
  if (!result.success) throw new Error('Select a valid LiftLog Gym backup JSON file.');
  const { members, plans, memberships, payments, attendance, settings, events } = result.data;
  const memberIds = new Set(members.map((member) => member.id));
  const planIds = new Set(plans.map((plan) => plan.id));
  const periods = new Map(memberships.map((period) => [period.id, period]));
  const receipts = new Map(payments.map((payment) => [payment.id, payment]));
  const freezes = new Map(events.flatMap((event) => event.kind === 'membership-frozen' ? [[event.id, event.memberId]] : []));
  if (memberships.some((period) => !memberIds.has(period.memberId) || !planIds.has(period.planId)) ||
    payments.some((payment) => periods.get(payment.membershipId)?.memberId !== payment.memberId) ||
    attendance.some((visit) => !memberIds.has(visit.memberId)) || events.some((entry) => {
      if ('membershipId' in entry) return periods.get(entry.membershipId)?.memberId !== entry.memberId;
      if ('paymentId' in entry) return receipts.get(entry.paymentId)?.memberId !== entry.memberId;
      return entry.kind === 'freeze-ended' && freezes.get(entry.freezeId) !== entry.memberId;
    })) {
    throw new Error('This backup is missing related gym records.');
  }
  const tables = [db.gymMembers, db.gymPlans, db.gymMemberships, db.gymPayments, db.gymAttendance, db.gymSettings, db.gymEvents];
  await db.transaction('rw', tables, async () => {
    if ((await Promise.all(tables.map((table) => table.count()))).some(Boolean)) {
      throw new Error('Restore a gym backup into an empty workspace.');
    }
    await db.gymMembers.bulkAdd(members);
    await db.gymPlans.bulkAdd(plans);
    await db.gymMemberships.bulkAdd(memberships);
    await db.gymPayments.bulkAdd(payments);
    await db.gymAttendance.bulkAdd(attendance);
    await db.gymEvents.bulkAdd(events);
    if (settings) await db.gymSettings.add(settings);
  });
}
