import { z } from 'zod';

const id = z.string().min(1).max(160);
const text = z.string().trim();
const minor = z.number().int().min(0).max(100_000_000);
const timestamp = z.number().int().nonnegative();
export const gymPlanSchema = z.object({ id, name: text.min(1).max(80), durationDays: z.number().int().min(1).max(3650), feeMinor: minor.min(1), active: z.boolean() });
export const gymMemberSchema = z.object({ id, name: text.min(1).max(100), phone: text.max(30), email: z.union([z.literal(''), z.email().max(200)]), trainer: text.max(100), notes: text.max(3000), archived: z.boolean(), createdAt: timestamp });
export const gymMembershipSchema = z.object({ id, memberId: id, planId: id, planName: text.min(1).max(80), startDate: z.iso.date(), endDate: z.iso.date(), feeMinor: minor.min(1), openingPaidMinor: minor.optional(), createdAt: timestamp })
  .refine((v) => v.endDate >= v.startDate, 'Membership ends before it starts.')
  .refine((v) => (v.openingPaidMinor ?? 0) <= v.feeMinor, 'Opening credit exceeds the membership fee.');
export const gymPaymentSchema = z.object({ id, memberId: id, membershipId: id, amountMinor: minor.min(1), paidOn: z.iso.date(), method: z.enum(['Cash', 'UPI', 'Card', 'Bank transfer']), reference: text.max(120), createdAt: timestamp });
export const gymAttendanceSchema = z.object({ id, memberId: id, day: z.iso.date(), checkedInAt: timestamp, checkedOutAt: timestamp.optional() })
  .refine((visit) => visit.id === `${visit.memberId}:${visit.day}` && (visit.checkedOutAt === undefined || visit.checkedOutAt >= visit.checkedInAt), 'Invalid attendance record.');
export const gymLogoSchema = z.string().max(44_000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/, 'Choose a PNG, JPEG or WebP logo.');
export const gymSettingsSchema = z.object({ id: z.literal('gym'), name: text.min(1).max(100), phone: text.max(30), logo: gymLogoSchema.optional() });
const event = z.object({ id, createdAt: timestamp, actor: text.min(1).max(320) });
const reason = text.min(1).max(250);
export const gymEventSchema = z.discriminatedUnion('kind', [
  event.extend({ kind: z.literal('members-imported'), count: z.number().int().positive().max(1000) }),
  event.extend({ kind: z.literal('member-registered'), memberId: id, membershipId: id }),
  event.extend({ kind: z.literal('membership-renewed'), memberId: id, membershipId: id }),
  event.extend({ kind: z.literal('payment-recorded'), memberId: id, paymentId: id, amountMinor: minor.min(1) }),
  event.extend({ kind: z.literal('payment-corrected'), memberId: id, paymentId: id, beforeMinor: minor, amountMinor: minor, reason }),
  event.extend({ kind: z.literal('membership-frozen'), memberId: id, membershipId: id, startDate: z.iso.date(), endDate: z.iso.date(), reason })
    .refine((value) => value.endDate >= value.startDate, 'Freeze ends before it begins.'),
  event.extend({ kind: z.literal('freeze-ended'), memberId: id, freezeId: id, resumesOn: z.iso.date(), reason }),
]);
export type GymPlan = z.infer<typeof gymPlanSchema>;
export type GymMember = z.infer<typeof gymMemberSchema>;
export type GymMembership = z.infer<typeof gymMembershipSchema>;
export type GymPayment = z.infer<typeof gymPaymentSchema>;
export type GymAttendance = z.infer<typeof gymAttendanceSchema>;
export type GymSettings = z.infer<typeof gymSettingsSchema>;
export type GymEvent = z.infer<typeof gymEventSchema>;
export type GymPeriod = GymMembership & { holds?: { id: string; startDate: string; endDate: string }[] };

export const gymBackupSchema = z.object({
  format: z.literal('liftlog-gym'), version: z.literal(1), exportedAt: z.iso.datetime(),
  members: z.array(gymMemberSchema), plans: z.array(gymPlanSchema), memberships: z.array(gymMembershipSchema),
  payments: z.array(gymPaymentSchema), attendance: z.array(gymAttendanceSchema), settings: gymSettingsSchema.optional(),
  events: z.array(gymEventSchema).default([]),
});

export function addDays(day: string, count: number) {
  z.iso.date().parse(day);
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

export function amountMinor(input: string) {
  const value = input.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter an amount with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return minor.parse(Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
}

export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value / 100);
export const dayLabel = (day: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day}T12:00:00`));
export const paymentTotal = (membershipId: string, payments: GymPayment[]) => payments.filter((p) => p.membershipId === membershipId).reduce((sum, p) => sum + p.amountMinor, 0);
export const dueAmount = (membership: GymMembership, payments: GymPayment[]) => Math.max(0, membership.feeMinor - (membership.openingPaidMinor ?? 0) - paymentTotal(membership.id, payments));
export function membershipStatus(membership: GymPeriod | undefined, today: string) {
  if (!membership) return 'No membership';
  if (membership.startDate > today) return 'Upcoming';
  if (membership.endDate < today) return 'Expired';
  return membership.holds?.some((hold) => hold.startDate <= today && hold.endDate >= today) ? 'Frozen' : 'Active';
}
export function currentMembership<T extends GymMembership>(memberId: string, memberships: T[], today: string) {
  const rows = memberships.filter((m) => m.memberId === memberId).sort((a, b) => b.startDate.localeCompare(a.startDate));
  return rows.find((m) => m.startDate <= today && m.endDate >= today) ?? rows.find((m) => m.startDate > today) ?? rows[0];
}
export function renewalStart(memberId: string, memberships: GymMembership[], today: string) {
  const end = memberships.filter((m) => m.memberId === memberId).map((m) => m.endDate).sort().at(-1);
  return end && end >= today ? addDays(end, 1) : today;
}
export function csvCell(value: string | number) {
  const text = typeof value === 'number' ? String(value) : (/^\s*[=+\-@]/.test(value) ? `'${value}` : value);
  return `"${text.replaceAll('"', '""')}"`;
}
