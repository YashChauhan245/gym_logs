'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CalendarCheck, Download, Plus, Search, Settings2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useDatabase } from '@/db/workspace';
import { useCloud } from '@/cloud/workspace';
import { checkInGymMember, checkOutGymMember, correctGymPayment, endGymFreeze, freezeGymMembership, importGymMembers, recordGymPayment, registerGymMember, renewGymMembership, restoreGymBackup, saveGymMember, saveGymPlan } from '@/db/gym';
import { addDays, amountMinor, csvCell, currentMembership, dayLabel, dueAmount, gymSettingsSchema, membershipStatus, money, renewalStart, type GymMember, type GymPayment, type GymPlan } from '@/domain/gym';
import { effectivePayments, effectivePeriods, freezeWindows, latestCorrections } from '@/domain/gym-activity';
import { gymImportTemplate } from '@/domain/gym-import';
import { gymReceipt } from '@/domain/gym-receipt';
import { GymMark, readGymLogo } from './gym-brand';
import { GymCheckIn, GymHeader, GymOverview, type CheckInRow } from './gym-front-desk';
import { GymActivity, GymCsvImport, GymPaymentRow } from './gym-operations';
import './gym.css';

const sections = ['Overview', 'Members', 'Payments', 'Attendance', 'Plans', 'Activity'] as const;
type Section = (typeof sections)[number];
type Dialog = { kind: 'member' | 'renew' | 'payment' | 'details'; memberId: string }
  | { kind: 'check-in' | 'new-member' | 'settings' | 'restore' | 'import' }
  | { kind: 'plan'; plan?: GymPlan }
  | { kind: 'correct'; payment: GymPayment; beforeMinor: number }
  | { kind: 'freeze'; membershipId: string }
  | { kind: 'end-freeze'; freezeId: string };
const dialogTitles: Record<Exclude<Dialog['kind'], 'details' | 'plan'>, string> = {
  'check-in': 'Check in member', 'new-member': 'Add member', member: 'Edit member', renew: 'Renew membership',
  payment: 'Record received payment', settings: 'Gym settings', restore: 'Restore gym backup', import: 'Import members from CSV',
  correct: 'Correct payment amount', freeze: 'Freeze membership', 'end-freeze': 'End membership freeze',
};
function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const asCSV = (rows: (string | number)[][]) => rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
const visitTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

function groupById<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}

export function GymScreen({ today, notify }: { today: string; notify: (message: string) => void }) {
  const db = useDatabase();
  const cloud = useCloud();
  const data = useLiveQuery(() => db.transaction('r', [db.gymMembers, db.gymPlans, db.gymMemberships, db.gymPayments, db.gymAttendance, db.gymSettings, db.gymEvents], async () => ({
    members: await db.gymMembers.toArray(), plans: await db.gymPlans.toArray(), memberships: await db.gymMemberships.toArray(),
    payments: await db.gymPayments.toArray(), attendance: await db.gymAttendance.toArray(), settings: await db.gymSettings.get('gym'), events: await db.gymEvents.toArray(),
  })), [db]);
  const [section, setSection] = useState<Section>('Overview');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [attendanceDay, setAttendanceDay] = useState(today);
  const [dialog, setDialog] = useState<Dialog>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paymentMembership, setPaymentMembership] = useState('');
  if (!data) return <p role="status">Opening gym workspace…</p>;
  const { members, plans, payments, attendance, settings, events } = data;
  const actor = cloud?.email ?? 'This device';
  const memberships = effectivePeriods(data.memberships, events);
  const corrections = latestCorrections(events);
  const adjustedPayments = effectivePayments(payments, corrections);
  const gymName = settings?.name ?? 'Your gym';
  const memberIndex = new Map(members.map((m) => [m.id, m]));
  const currentMembers = members.filter((m) => !m.archived).sort((a, b) => a.name.localeCompare(b.name));
  const memberPeriods = groupById(memberships, (period) => period.memberId);
  const periodPayments = groupById(adjustedPayments, (payment) => payment.membershipId);
  const balance = (period: (typeof memberships)[number]) => dueAmount(period, periodPayments.get(period.id) ?? []);
  const membership = (memberId: string) => currentMembership(memberId, memberPeriods.get(memberId) ?? [], today);
  const memberDue = (memberId: string) => (memberPeriods.get(memberId) ?? []).reduce((sum, period) => sum + balance(period), 0);
  const activeCount = currentMembers.filter((m) => membershipStatus(membership(m.id), today) === 'Active').length;
  const todayVisits = attendance.filter((a) => a.day === today).sort((a, b) => b.checkedInAt - a.checkedInAt);
  const visitIndex = new Map(todayVisits.map((visit) => [visit.memberId, visit]));
  const monthRevenue = adjustedPayments.filter((p) => p.paidOn.startsWith(today.slice(0, 7))).reduce((sum, p) => sum + p.amountMinor, 0);
  const outstanding = memberships.reduce((sum, period) => sum + balance(period), 0);
  const member = dialog && 'memberId' in dialog ? memberIndex.get(dialog.memberId) : undefined;
  const memberMemberships = member ? (memberPeriods.get(member.id) ?? []).slice().sort((a, b) => b.startDate.localeCompare(a.startDate)) : [];
  const pendingMemberships = memberMemberships.filter((period) => balance(period) > 0);
  const selectedPaymentMembership = pendingMemberships.find((m) => m.id === paymentMembership) ?? pendingMemberships[0];
  const freezePeriod = dialog?.kind === 'freeze' ? memberships.find((period) => period.id === dialog.membershipId) : undefined;
  const memberEvents = member ? events.filter((entry) => 'memberId' in entry && entry.memberId === member.id) : [];
  const memberFreezes = freezeWindows(memberEvents).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const availablePlans = plans.filter((p) => p.active);
  const matchesQuery = (m?: GymMember) => Boolean(m && `${m.name} ${m.phone} ${m.email} ${m.trainer}`.toLowerCase().includes(query.toLowerCase().trim()));
  const renewalDeadline = addDays(today, 7);
  const renewals = currentMembers.flatMap((m) => {
    const period = membership(m.id);
    if (!period || membershipStatus(period, today) !== 'Active' || period.endDate > renewalDeadline) return [];
    if (memberPeriods.get(m.id)?.some((next) => next.startDate === addDays(period.endDate, 1))) return [];
    return [{ member: m, period }];
  }).sort((a, b) => a.period.endDate.localeCompare(b.period.endDate));
  const renewalIds = new Set(renewals.map(({ member: m }) => m.id));
  const overdue = currentMembers.flatMap((m) => {
    const period = membership(m.id);
    return period && membershipStatus(period, today) === 'Expired' ? [{ member: m, period }] : [];
  }).sort((a, b) => a.period.endDate.localeCompare(b.period.endDate));
  const filteredMembers = members.filter((m) => {
    if (!matchesQuery(m) || m.archived !== (filter === 'archived')) return false;
    if (filter === 'renewals') return renewalIds.has(m.id);
    if (filter === 'due') return memberDue(m.id) > 0;
    if (filter === 'active' || filter === 'expired' || filter === 'frozen') return membershipStatus(membership(m.id), today).toLowerCase() === filter;
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
  const debtors = currentMembers.filter((m) => memberDue(m.id) > 0).sort((a, b) => memberDue(b.id) - memberDue(a.id));
  const checkInRows: CheckInRow[] = dialog?.kind === 'check-in' ? currentMembers.map((m) => {
    const visit = visitIndex.get(m.id);
    return { id: m.id, name: m.name, phone: m.phone, email: m.email, membership: membershipStatus(membership(m.id), today), visit: visit ? (visit.checkedOutAt === undefined ? 'in' : 'out') : null };
  }) : [];

  function open(next: Dialog) { setError(''); setPaymentMembership(''); setDialog(next); }
  async function perform(action: () => Promise<unknown>, message: string, close = true) {
    if (busy) return;
    setBusy(true);setError('');
    try { await action(); if (close) setDialog(undefined); notify(message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save. Please try again.'); }
    finally { setBusy(false); }
  }
  function submit(action: (values: FormData) => Promise<unknown>, message: string) {
    return (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = new FormData(event.currentTarget); void perform(() => action(values), message); };
  }
  function submitMember(values: FormData) {
    const fields = {
      name: String(values.get('name')), phone: String(values.get('phone')), email: String(values.get('email')).trim(),
      trainer: String(values.get('trainer')), notes: String(values.get('notes')),
    };
    if (member) return saveGymMember(db, { ...member, ...fields });
    return registerGymMember(db, { ...fields, archived: false }, String(values.get('planId')), String(values.get('startDate')), actor);
  }
  function receipt(payment: GymPayment) {
    const name = memberIndex.get(payment.memberId)?.name ?? 'Member';
    const period = memberships.find((m) => m.id === payment.membershipId);
    download(`receipt-${payment.id.slice(0, 8)}.html`, gymReceipt(payment, name, settings, period, corrections.get(payment.id)), 'text/html;charset=utf-8');
  }
  function paymentRow(payment: GymPayment, showMember = false) {
    const correction = corrections.get(payment.id);
    return <GymPaymentRow key={payment.id} payment={payment} memberName={showMember ? memberIndex.get(payment.memberId)?.name ?? 'Member' : undefined}
      correction={correction} onReceipt={() => receipt(payment)} onCorrect={() => open({ kind: 'correct', payment, beforeMinor: correction?.amountMinor ?? payment.amountMinor })} />;
  }

  async function saveBrand(values: FormData) {
    const file = values.get('logo');
    let logo = values.get('removeLogo') === 'on' ? undefined : settings?.logo;
    if (file instanceof File && file.name) logo = await readGymLogo(file);
    await db.gymSettings.put(gymSettingsSchema.parse({ id: 'gym', name: String(values.get('name')), phone: String(values.get('phone')), logo }));
  }
  function exportMembers() {
    download(`gym-members-${today}.csv`, asCSV([['Name', 'Phone', 'Email', 'Trainer', 'Status', 'Plan', 'Start', 'End', 'Outstanding INR'], ...members.map((m) => {
      const period = membership(m.id);
      return [m.name, m.phone, m.email, m.trainer, m.archived ? 'Archived' : membershipStatus(period, today), period?.planName ?? '', period?.startDate ?? '', period?.endDate ?? '', memberDue(m.id) / 100];
    })]), 'text/csv;charset=utf-8');
  }
  function exportPayments() {
    download(`gym-payments-${today}.csv`, asCSV([['Receipt ID', 'Member', 'Paid on', 'Current amount INR', 'Original amount INR', 'Method', 'Reference', 'Membership ID'], ...payments.map((p) => [p.id, memberIndex.get(p.memberId)?.name ?? '', p.paidOn, (corrections.get(p.id)?.amountMinor ?? p.amountMinor) / 100, p.amountMinor / 100, p.method, p.reference, p.membershipId])]), 'text/csv;charset=utf-8');
  }
  function visitAction(m: GymMember) {
    const visit = visitIndex.get(m.id);
    if (visit?.checkedOutAt) return <span className="gym-visited">Visited today</span>;
    if (visit) return <Button size="compact" variant="secondary" disabled={busy} onClick={() => changeVisit(m.id, 'out')}>Check out</Button>;
    return <Button size="compact" variant="secondary" disabled={busy || m.archived || membershipStatus(membership(m.id), today) !== 'Active'} onClick={() => changeVisit(m.id, 'in')}>Check in</Button>;
  }
  function changeVisit(id: string, action: 'in' | 'out') {
    const operation = action === 'in' ? checkInGymMember : checkOutGymMember;
    const verb = action === 'in' ? 'checked in' : 'checked out';
    void perform(() => operation(db, id, today), `${memberIndex.get(id)?.name ?? 'Member'} ${verb}.`, false);
  }
  const openMember = (id: string) => open({ kind: 'details', memberId: id });
  function viewQueue(queue: 'attendance' | 'renewals' | 'overdue' | 'balances') {
    setError('');
    if (queue === 'attendance') {
      setAttendanceDay(today);
      setSection('Attendance');
    } else {
      setQuery('');
      setFilter(queue === 'renewals' ? 'renewals' : queue === 'overdue' ? 'expired' : 'due');
      setSection('Members');
    }
  }
  const editingPlan = dialog?.kind === 'plan' ? dialog.plan : undefined;
  const planFields = (value?: GymPlan) => <>
    <label>Plan name<input name="name" required maxLength={80} defaultValue={value?.name ?? 'Monthly'} /></label>
    <div className="two-fields"><label>Duration (days)<input name="duration" type="number" min={1} max={3650} required defaultValue={value?.durationDays ?? 30} /></label><label>Fee (INR)<input name="fee" type="number" min="0.01" max="1000000" step="0.01" required defaultValue={value ? value.feeMinor / 100 : 1000} /></label></div>
    <label className="check-label"><input name="active" type="checkbox" defaultChecked={value?.active ?? true} /> Available for new memberships</label>
    <p className="muted">Plan edits apply to new memberships. Existing dates, fees and payment history are kept.</p>
  </>;
  const enrollmentFields = (start = today) => <div className="two-fields"><label>Membership plan<select name="planId" required>{availablePlans.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.durationDays} days · {money(p.feeMinor)}</option>)}</select></label><label>Start date<input name="startDate" type="date" required defaultValue={start} /></label></div>;
  const details = member && <>
    <div className="gym-detail-summary"><span className="gym-status">{member.archived ? 'Archived' : membershipStatus(membership(member.id), today)}</span><strong>{money(memberDue(member.id))} outstanding</strong></div>
    <p className="muted">{[member.phone, member.email].filter(Boolean).join(' · ') || 'No contact details saved'}</p>
    {member.trainer && <p>Trainer: {member.trainer}</p>}
    {member.notes && <p className="gym-notes">{member.notes}</p>}
    <div className="row-actions"><Button size="compact" onClick={() => open({ kind: 'payment', memberId: member.id })} disabled={!pendingMemberships.length}>Record payment</Button><Button size="compact" variant="secondary" onClick={() => open({ kind: 'renew', memberId: member.id })} disabled={member.archived}>Renew membership</Button><Button size="compact" variant="ghost" onClick={() => open({ kind: 'member', memberId: member.id })}>Edit member</Button>{visitAction(member)}</div>
    <h3>Membership history</h3><ul className="gym-records">{memberMemberships.map((m) => <li key={m.id}><div><strong>{m.planName}</strong><small>{dayLabel(m.startDate)} – {dayLabel(m.endDate)}</small>{!!m.openingPaidMinor && <small>{money(m.openingPaidMinor)} opening credit</small>}</div><div><strong>{money(m.feeMinor)}</strong><small>{money(balance(m))} due</small></div>
      {!member.archived && m.endDate >= today && <Button size="compact" variant="secondary" onClick={() => open({ kind: 'freeze', membershipId: m.id })}>Freeze plan</Button>}
    </li>)}</ul>
    {!!memberFreezes.length && <><h3>Membership freezes</h3><ul className="gym-records">{memberFreezes.map((freeze) => {
      const cancelled = freeze.endDate < freeze.startDate;
      const status = cancelled ? 'Cancelled' : freeze.endDate < today ? 'Ended' : freeze.startDate > today ? 'Scheduled' : 'Frozen';
      return <li key={freeze.id}><div><strong>{status}</strong><small>{cancelled ? `Originally scheduled for ${dayLabel(freeze.startDate)}` : `${dayLabel(freeze.startDate)} – ${dayLabel(freeze.endDate)}`}</small><small>{freeze.reason}</small></div>
        {!cancelled && freeze.endDate >= today && <Button size="compact" variant="secondary" onClick={() => open({ kind: 'end-freeze', freezeId: freeze.id })}>{freeze.startDate >= today ? 'Cancel freeze' : 'Resume early'}</Button>}
      </li>;
    })}</ul></>}
    <h3>Payments received</h3><ul className="gym-records">{payments.filter((p) => p.memberId === member.id).sort((a,b) => b.paidOn.localeCompare(a.paidOn)).map((p) => paymentRow(p))}</ul>
    {!!memberEvents.length && <><h3>Member activity</h3><GymActivity events={memberEvents} members={memberIndex} onOpenMember={openMember} compact /></>}
    <h3>Recent attendance</h3><ul className="gym-records">{attendance.filter((a) => a.memberId === member.id).sort((a,b) => b.day.localeCompare(a.day)).slice(0, 10).map((a) => <li key={a.id}><strong>{dayLabel(a.day)}</strong><span>{a.checkedOutAt ? 'Checked out' : 'Checked in'}</span></li>)}</ul>
    <div className="row-actions">{member.phone && <Button size="compact" variant="secondary" onClick={() => {
      const period = membership(member.id);
      const expiry = period ? ` Your membership ${period.endDate < today ? 'expired' : 'ends'} on ${dayLabel(period.endDate)}.` : '';
      const message = `Hi ${member.name}, this is a reminder from ${gymName}.${expiry}${memberDue(member.id) ? ` Outstanding fees: ${money(memberDue(member.id))}.` : ''} ${settings?.phone ? `Call ${settings.phone} to renew.` : 'Please contact us for renewal.'} Thank you.`;
      void perform(() => navigator.clipboard.writeText(message), 'Reminder copied. You can review and send it yourself.', false);
    }}>Copy renewal reminder</Button>}<Button size="compact" variant="danger" onClick={() => void perform(() => saveGymMember(db, { ...member, archived: !member.archived }), member.archived ? 'Member restored.' : 'Member archived. History is preserved.')}>{member.archived ? 'Restore member' : 'Archive member'}</Button></div>
  </>;

  return <div className="gym-screen">
    <GymHeader name={settings?.name} logo={settings?.logo} today={today} note={cloud?.signedIn ? cloud.status : 'Saved on this device'} actions={<>
      <Button variant="secondary" onClick={() => open({ kind: 'new-member' })}><Plus size={18} /> Add member</Button>
      <Button onClick={() => open({ kind: 'check-in' })}><CalendarCheck size={18} /> Check in member</Button>
    </>} />
    <div className="gym-toolbar"><div className="gym-tabs" role="group" aria-label="Gym section">{sections.map((s) => <Button key={s} size="compact" variant="ghost" aria-pressed={s === section} onClick={() => { setSection(s); setError(''); }}>{s}</Button>)}</div><Button size="icon" variant="ghost" aria-label="Gym settings" onClick={() => open({ kind: 'settings' })}><Settings2 size={19} /></Button></div>
    {error && !dialog && <p role="alert" className="error-text">{error}</p>}
    {section === 'Overview' && <GymOverview active={activeCount} collected={monthRevenue} outstanding={outstanding} onOpenMember={openMember} onViewAll={viewQueue}
      visits={todayVisits.map((visit) => ({ memberId: visit.memberId, name: memberIndex.get(visit.memberId)?.name ?? 'Member', detail: `In at ${visitTime.format(visit.checkedInAt)}`, status: visit.checkedOutAt ? 'Checked out' : 'In gym' }))}
      renewals={renewals.map(({ member: m, period }) => ({ memberId: m.id, name: m.name, detail: period.planName, status: `Ends ${dayLabel(period.endDate)}` }))}
      overdue={overdue.map(({ member: m, period }) => ({ memberId: m.id, name: m.name, detail: period.planName, status: `Expired ${dayLabel(period.endDate)}` }))}
      balances={debtors.map((m) => ({ memberId: m.id, name: m.name, detail: membership(m.id)?.planName ?? 'Fees due', status: money(memberDue(m.id)) }))}>
      {!members.length && <section className="gym-onboarding"><div><h2>{availablePlans.length ? 'Add your first member' : 'Set up your first membership plan'}</h2><p>{availablePlans.length ? 'Choose a plan and membership start date.' : 'Set a price and duration so you can register members.'}</p></div><div className="row-actions">
        {availablePlans.length ? <Button variant="secondary" onClick={() => open({ kind: 'new-member' })}>Add a member</Button> : <Button variant="secondary" onClick={() => open({ kind: 'plan' })}>Create membership plan</Button>}
        <Button asChild variant="ghost"><Link href="/gym-demo" prefetch={false}>Try the demo</Link></Button>
      </div></section>}
    </GymOverview>}
    {section === 'Members' && <>
      <div className="gym-search-row"><label className="search-field"><Search size={18} /><input aria-label="Search members" placeholder="Name, phone, email or trainer" type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label><label>Status<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All current members</option><option value="active">Active</option><option value="expired">Overdue renewals</option><option value="renewals">Upcoming renewals</option><option value="frozen">Frozen</option><option value="due">Fees due</option><option value="archived">Archived</option></select></label></div>
      <p className="muted" role="status">{filteredMembers.length} {filteredMembers.length === 1 ? 'member' : 'members'}</p><ul className="gym-members" aria-label="Gym members">{filteredMembers.map((m) => {
        const period = membership(m.id);
        return <li key={m.id}><button className="gym-member-name" aria-label={`View ${m.name}`} onClick={() => open({ kind: 'details', memberId: m.id })}><strong>{m.name}</strong><small>{m.phone || m.email || 'No contact saved'}</small><span className="gym-status">{m.archived ? 'Archived' : membershipStatus(period, today)}</span></button><div className="gym-member-plan"><strong>{period?.planName ?? 'No plan'}</strong><small>{period ? `Until ${dayLabel(period.endDate)}` : 'Add a membership'}</small></div><div className="gym-member-balance"><strong>{money(memberDue(m.id))}</strong><small>outstanding</small></div>{visitAction(m)}</li>;
      })}</ul>{!filteredMembers.length && <p className="gym-empty">No members match. Try another search or add your first member.</p>}
      <div className="row-actions"><Button size="compact" onClick={() => open({ kind: 'import' })}>Import members CSV</Button><Button variant="secondary" size="compact" onClick={exportMembers}><Download size={16} /> Export members CSV</Button></div>
    </>}
    {section === 'Payments' && <><div className="gym-section-heading"><div><h2>Payment ledger</h2><p className="muted">Record cash, UPI, card or bank payments received. Amounts are recorded in INR.</p></div><Button size="compact" variant="secondary" onClick={exportPayments}><Download size={16} /> Export ledger</Button></div><ul className="gym-records">{payments.slice().sort((a,b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt-a.createdAt).map((p) => paymentRow(p, true))}</ul>{!payments.length && <p className="gym-empty">No payments recorded. Open a member to record a received payment.</p>}</>}
    {section === 'Activity' && <><div className="gym-section-heading"><div><h2>Gym activity</h2><p className="muted">Review imports, membership changes and corrections in order.</p></div></div><GymActivity events={events} members={memberIndex} onOpenMember={openMember} /></>}
    {section === 'Attendance' && <><div className="gym-section-heading"><div><h2>Attendance register</h2><p className="muted">Check members in from Members. One attendance record per member per day.</p></div><label>Attendance date<input type="date" value={attendanceDay} max={today} onChange={(e) => setAttendanceDay(e.target.value)} /></label></div><ul className="gym-records">{attendance.filter((a) => a.day === attendanceDay).sort((a,b) => b.checkedInAt-a.checkedInAt).map((a) => <li key={a.id}><div><strong>{members.find((m) => m.id === a.memberId)?.name ?? 'Member'}</strong><small>In {new Date(a.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{a.checkedOutAt ? ` · Out ${new Date(a.checkedOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</small></div><span>{a.checkedOutAt ? 'Checked out' : 'Checked in'}</span></li>)}</ul>{!attendance.some((a) => a.day === attendanceDay) && <p className="gym-empty">No visits recorded for this date.</p>}</>}
    {section === 'Plans' && <><div className="gym-section-heading"><div><h2>Membership plans</h2><p className="muted">Set your prices and durations. Old memberships retain their original fees.</p></div><Button size="compact" onClick={() => open({ kind: 'plan' })}><Plus size={16} /> Add plan</Button></div><div className="gym-plans">{plans.map((p) => <article key={p.id}><span className="gym-status">{p.active ? 'Available' : 'Retired'}</span><h3>{p.name}</h3><strong>{money(p.feeMinor)}</strong><p className="muted">{p.durationDays} days</p><Button size="compact" variant="secondary" onClick={() => open({ kind: 'plan', plan: p })}>Edit {p.name}</Button></article>)}</div>{!plans.length && <p className="gym-empty">Create your first plan to start registering members.</p>}</>}
    <div className="gym-backup"><p>Keep a copy of your gym records.</p><div className="row-actions"><Button size="compact" variant="ghost" onClick={() => download(`gym-backup-${today}.json`, JSON.stringify({ format: 'liftlog-gym', version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2))}><Download size={16} /> Download backup JSON</Button><Button size="compact" variant="ghost" onClick={() => open({ kind: 'restore' })}>Restore backup</Button></div></div>
    {dialog && <Modal open onOpenChange={(value) => { if (!value && !busy) { setDialog(undefined);setError(''); } }} className="gym-dialog" title={dialog.kind === 'details' ? member?.name ?? 'Member' : dialog.kind === 'plan' ? (editingPlan ? 'Edit membership plan' : 'New membership plan') : dialogTitles[dialog.kind]}>
      {error && <p role="alert" className="error-text">{error}</p>}
      {dialog.kind === 'check-in' && <GymCheckIn rows={checkInRows} busy={busy} onOpenMember={openMember} onCheckIn={(id) => changeVisit(id, 'in')} onCheckOut={(id) => changeVisit(id, 'out')} />}
      {dialog.kind === 'import' && <GymCsvImport members={members} plans={plans} busy={busy} onTemplate={() => download('liftlog-members-template.csv', gymImportTemplate, 'text/csv;charset=utf-8')}
        onImport={(csv, reviewed) => void perform(() => importGymMembers(db, csv, reviewed, actor), `Imported ${reviewed.length} ${reviewed.length === 1 ? 'member' : 'members'}.`)} />}
      {dialog.kind === 'details' && details}
      {dialog.kind === 'correct' && <form className="stack-form" onSubmit={submit((v) => correctGymPayment(db, dialog.payment.id, amountMinor(String(v.get('amount'))), dialog.beforeMinor, String(v.get('reason')), actor), 'Payment correction saved.')}>
        <p>Current amount {money(dialog.beforeMinor)}. Enter zero to void the entry. The original receipt amount and correction stay in the ledger.</p>
        <label>Corrected amount (INR)<input name="amount" required type="number" min="0" max="1000000" step="0.01" defaultValue={dialog.beforeMinor / 100} /></label>
        <label>Reason for correction<textarea name="reason" required maxLength={250} rows={3} /></label>
        <Button type="submit" disabled={busy}>Save correction</Button>
      </form>}
      {dialog.kind === 'freeze' && freezePeriod && <form className="stack-form" onSubmit={submit((v) => freezeGymMembership(db, freezePeriod.id, String(v.get('start')), String(v.get('end')), String(v.get('reason')), actor, today), 'Membership freeze saved.')}>
        <p>Check-ins pause for the selected dates. Those days extend the membership, and any overlapping renewal moves forward.</p>
        <div className="two-fields">
          <label>First freeze day<input name="start" type="date" required min={freezePeriod.startDate > today ? freezePeriod.startDate : today} max={freezePeriod.endDate} defaultValue={freezePeriod.startDate > today ? freezePeriod.startDate : today} /></label>
          <label>Last freeze day<input name="end" type="date" required min={today} defaultValue={freezePeriod.startDate > today ? freezePeriod.startDate : today} /></label>
        </div>
        <label>Reason for freeze<textarea name="reason" required maxLength={250} rows={3} /></label>
        <Button type="submit" disabled={busy}>Save freeze</Button>
      </form>}
      {dialog.kind === 'end-freeze' && <form className="stack-form" onSubmit={submit((v) => endGymFreeze(db, dialog.freezeId, String(v.get('reason')), actor, today), 'Membership freeze ended.')}>
        <p>Unused freeze days are removed from the expiry extension. Check-in resumes today if the membership is active.</p>
        <label>Reason for change<textarea name="reason" required maxLength={250} rows={3} /></label>
        <Button type="submit" disabled={busy}>End freeze</Button>
      </form>}
      {dialog.kind === 'plan' && <form className="stack-form" onSubmit={submit((v) => saveGymPlan(db, { id: editingPlan?.id ?? crypto.randomUUID(), name: String(v.get('name')), durationDays: Number(v.get('duration')), feeMinor: amountMinor(String(v.get('fee'))), active: v.get('active') === 'on' }), 'Membership plan saved.')}>
        {planFields(dialog.plan)}<Button type="submit" disabled={busy}>Save plan</Button>
      </form>}
      {(dialog.kind === 'new-member' || dialog.kind === 'member') && <>{dialog.kind === 'new-member' && !availablePlans.length ? <div className="stack-form"><p>Create an available membership plan before registering a member.</p><Button onClick={() => open({ kind: 'plan' })}>Create membership plan</Button></div> : <form className="stack-form" onSubmit={submit(submitMember, 'Member saved.')}>
        <label>Member name<input name="name" required maxLength={100} defaultValue={member?.name} /></label>
        <div className="two-fields"><label>Phone<input name="phone" type="tel" maxLength={30} defaultValue={member?.phone} /></label><label>Email<input name="email" type="email" maxLength={200} defaultValue={member?.email} /></label></div>
        <label>Assigned trainer<input name="trainer" maxLength={100} defaultValue={member?.trainer} placeholder="Optional" /></label>
        {dialog.kind === 'new-member' && enrollmentFields()}
        <label>Training / member notes<textarea name="notes" maxLength={3000} rows={3} defaultValue={member?.notes} /></label><Button disabled={busy} type="submit">Save member</Button>
      </form>}</>}
      {dialog.kind === 'renew' && member && <form className="stack-form" onSubmit={submit((v) => renewGymMembership(db, member.id, String(v.get('planId')), String(v.get('startDate')), actor), 'Membership renewed.')}><p>{member.name}</p>{availablePlans.length ? <>{enrollmentFields(renewalStart(member.id, memberships, today))}<p className="muted">A new period is added to the history. Previous memberships and unpaid balances are kept.</p><Button type="submit" disabled={busy}>Save renewal</Button></> : <p>Create an available plan under Plans first.</p>}</form>}
      {dialog.kind === 'payment' && member && <form className="stack-form" onSubmit={submit((v) => recordGymPayment(db, { memberId: member.id, membershipId: String(v.get('membershipId')), amountMinor: amountMinor(String(v.get('amount'))), paidOn: String(v.get('paidOn')), method: String(v.get('method')) as GymPayment['method'], reference: String(v.get('reference')) }, actor), 'Payment recorded.')}>
        <p>{member.name}</p>{selectedPaymentMembership ? <>
          <label>Membership<select name="membershipId" value={selectedPaymentMembership.id} onChange={(e) => setPaymentMembership(e.target.value)}>{pendingMemberships.map((m) => <option key={m.id} value={m.id}>{m.planName} · {dayLabel(m.startDate)} · {money(balance(m))} due</option>)}</select></label>
          <div className="two-fields"><label>Amount received (INR)<input key={selectedPaymentMembership.id} name="amount" type="number" required min="0.01" step="0.01" max={balance(selectedPaymentMembership) / 100} defaultValue={balance(selectedPaymentMembership) / 100} /></label><label>Payment date<input name="paidOn" type="date" required defaultValue={today} max={today} /></label></div>
          <label>Payment method<select name="method">{['Cash', 'UPI', 'Card', 'Bank transfer'].map((m) => <option key={m}>{m}</option>)}</select></label><label>Transaction / receipt reference<input name="reference" maxLength={120} placeholder="Optional" /></label><Button type="submit" disabled={busy}>Save payment</Button>
        </> : <p>No outstanding memberships for this member.</p>}
      </form>}
      {dialog.kind === 'settings' && <form className="stack-form" onSubmit={submit(saveBrand, 'Gym settings saved.')}>
        <div className="gym-brand-upload"><GymMark logo={settings?.logo} /><div><label>Gym logo<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /></label><p className="muted">PNG, JPEG or WebP, up to 5 MB.</p></div></div>
        {settings?.logo && <label className="check-label"><input name="removeLogo" type="checkbox" /> Remove current logo</label>}
        <label>Gym name<input name="name" required maxLength={100} defaultValue={settings?.name} /></label>
        <label>Gym contact phone<input name="phone" type="tel" maxLength={30} defaultValue={settings?.phone} /></label>
        <p className="muted">The logo appears here and on receipts. Your gym name and phone also appear in renewal reminders.</p>
        <Button type="submit" disabled={busy}>Save gym settings</Button>
      </form>}
      {dialog.kind === 'restore' && <form className="stack-form" onSubmit={submit(async (values) => {
        if (cloud?.accountId && (!cloud.signedIn || cloud.status !== 'Up to date')) throw new Error('Sync this account before restoring its gym backup.');
        const file = values.get('backup');
        if (!(file instanceof File) || !file.size || file.size > 25_000_000) throw new Error('Choose a gym backup file under 25 MB.');
        let content: unknown;
        try { content = JSON.parse(await file.text()); }
        catch { throw new Error('The selected file is not valid JSON.'); }
        await restoreGymBackup(db, content);
      }, 'Gym backup restored.')}><p>Choose a backup downloaded from Gym. Restore is available only when this gym workspace is empty.</p><label>Gym backup JSON<input name="backup" type="file" accept=".json,application/json" required /></label><Button type="submit" disabled={busy}>Restore gym backup</Button></form>}
    </Modal>}
  </div>;
}
