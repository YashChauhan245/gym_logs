import { addDays, daysBetween, type GymEvent, type GymMembership, type GymPayment, type GymPeriod } from './gym';

export type Correction = Extract<GymEvent, { kind: 'payment-corrected' }>;
export type Freeze = Extract<GymEvent, { kind: 'membership-frozen' }>;

export function latestCorrections(events: GymEvent[]) {
  const byPayment = new Map<string, Correction>();
  for (const entry of events) {
    if (entry.kind !== 'payment-corrected') continue;
    const previous = byPayment.get(entry.paymentId);
    if (!previous || entry.createdAt > previous.createdAt ||
      entry.createdAt === previous.createdAt && entry.id.localeCompare(previous.id) > 0) byPayment.set(entry.paymentId, entry);
  }
  return byPayment;
}

export function effectivePayments(payments: GymPayment[], corrections: ReadonlyMap<string, Correction>) {
  return payments.map((payment) => ({ ...payment, amountMinor: corrections.get(payment.id)?.amountMinor ?? payment.amountMinor }));
}

export function freezeWindows(events: GymEvent[]) {
  const resumeDates = new Map<string, string>();
  for (const entry of events) {
    if (entry.kind !== 'freeze-ended') continue;
    const previous = resumeDates.get(entry.freezeId);
    if (!previous || entry.resumesOn < previous) resumeDates.set(entry.freezeId, entry.resumesOn);
  }
  return events.flatMap((entry) => {
    if (entry.kind !== 'membership-frozen') return [];
    const resumesOn = resumeDates.get(entry.id);
    const endDate = resumesOn && resumesOn <= entry.endDate ? addDays(resumesOn, -1) : entry.endDate;
    return [{ ...entry, endDate }];
  });
}

export function effectivePeriods(memberships: GymMembership[], events: GymEvent[]): GymPeriod[] {
  const freezes = new Map<string, Freeze[]>();
  for (const entry of freezeWindows(events)) {
    const group = freezes.get(entry.membershipId);
    if (group) group.push(entry);
    else freezes.set(entry.membershipId, [entry]);
  }
  const lastEnds = new Map<string, string>();
  return memberships.slice().sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id)).map((period) => {
    const previous = lastEnds.get(period.memberId);
    const startDate = previous && previous >= period.startDate ? addDays(previous, 1) : period.startDate;
    let endDate = addDays(startDate, daysBetween(period.startDate, period.endDate));
    const holds: NonNullable<GymPeriod['holds']> = [];
    let lastHoldEnd: string | undefined;
    for (const hold of (freezes.get(period.id) ?? []).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))) {
      const uncovered = lastHoldEnd ? addDays(lastHoldEnd, 1) : startDate;
      const firstDay = hold.startDate >= uncovered ? hold.startDate : uncovered;
      if (firstDay > endDate || firstDay > hold.endDate) continue;
      endDate = addDays(endDate, daysBetween(firstDay, hold.endDate) + 1);
      lastHoldEnd = hold.endDate;
      holds.push({ id: hold.id, startDate: firstDay, endDate: hold.endDate });
    }
    lastEnds.set(period.memberId, endDate);
    return { ...period, startDate, endDate, holds };
  });
}
