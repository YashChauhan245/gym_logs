'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { dayLabel, money, type GymEvent, type GymMember, type GymPayment, type GymPlan } from '@/domain/gym';
import { type Correction } from '@/domain/gym-activity';
import { reviewGymCsv, type ImportMember } from '@/domain/gym-import';

export function GymCsvImport({ members, plans, busy, onTemplate, onImport }: {
  members: GymMember[]; plans: GymPlan[]; busy: boolean;
  onTemplate: () => void; onImport: (csv: string, reviewed: ImportMember[]) => void;
}) {
  const [csv, setCsv] = useState('');
  const [fileError, setFileError] = useState('');
  const [reading, setReading] = useState(false);
  const result = useMemo(() => {
    if (!csv) return null;
    try { return { review: reviewGymCsv(csv, members, plans) }; }
    catch (error) { return { error: error instanceof Error ? error.message : 'The CSV could not be read.' }; }
  }, [csv, members, plans]);

  async function selectFile(file?: File) {
    setCsv('');
    setFileError('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') || file.size > 1_000_000) {
      setFileError('Choose a CSV file up to 1 MB.');
      return;
    }
    setReading(true);
    try { setCsv(await file.text()); }
    catch { setFileError('The file could not be opened.'); }
    finally { setReading(false); }
  }

  return <div className="stack-form">
    <p>Use the template or an existing LiftLog member export. Use YYYY-MM-DD for dates. A new plan needs a fee and duration.</p>
    <Button size="compact" variant="secondary" onClick={onTemplate}>Download CSV template</Button>
    <label>Members CSV<input type="file" accept=".csv,text/csv" disabled={reading || busy} onChange={(event) => void selectFile(event.target.files?.[0])} /></label>
    <p className="muted">Blank Outstanding INR starts at zero. Imported balances are separate from payments received.</p>
    {(fileError || result?.error) && <p role="alert" className="error-text">{fileError || result?.error}</p>}
    {reading && <p role="status">Reading CSV…</p>}
    {result?.review && <>
      <p role="status">{result.review.records.length} ready · {result.review.issues.length} skipped · {result.review.newPlanCount} new {result.review.newPlanCount === 1 ? 'plan' : 'plans'}</p>
      <div className="gym-import-preview" tabIndex={0} role="region" aria-label="CSV import preview">
        <ul className="gym-records">
          {result.review.issues.map((row) => <li key={row.row}><div><strong>Row {row.row} · {row.name || 'Unnamed'}</strong><small>{row.reason}</small></div><span>{row.status}</span></li>)}
          {result.review.records.map((row) => <li key={row.row}><div><strong>Row {row.row} · {row.member.name}</strong><small>{row.membership ? `${row.membership.plan.name} · through ${dayLabel(row.membership.endDate)}` : 'Member profile only'}</small></div><span>Ready</span></li>)}
        </ul>
      </div>
      <Button disabled={busy || !result.review.records.length} onClick={() => onImport(csv, result.review.records)}>
        Import {result.review.records.length} {result.review.records.length === 1 ? 'member' : 'members'}
      </Button>
    </>}
  </div>;
}

export function GymPaymentRow({ payment, memberName, correction, onReceipt, onCorrect }: {
  payment: GymPayment; memberName?: string; correction?: Correction; onReceipt: () => void; onCorrect: () => void;
}) {
  return <li className="gym-payment-row"><div>
    {memberName && <strong>{memberName}</strong>}
    <strong className="gym-payment-amount">{money(correction?.amountMinor ?? payment.amountMinor)} · {payment.method}</strong>
    <small>{dayLabel(payment.paidOn)}{payment.reference && ` · ${payment.reference}`}</small>
    {correction && <small>{correction.amountMinor === 0 ? 'Voided' : 'Corrected'} · Original {money(payment.amountMinor)}</small>}
  </div><div className="gym-payment-actions">
    <Button size="compact" variant="ghost" onClick={onReceipt}>Receipt</Button>
    <Button size="compact" variant="secondary" onClick={onCorrect}>Correct amount</Button>
  </div></li>;
}

function describeEvent(entry: GymEvent) {
  switch (entry.kind) {
    case 'members-imported': return [`Imported ${entry.count} ${entry.count === 1 ? 'member' : 'members'} from CSV`, ''];
    case 'member-registered': return ['Member registered', ''];
    case 'membership-renewed': return ['Membership renewed', ''];
    case 'payment-recorded': return ['Payment recorded', money(entry.amountMinor)];
    case 'payment-corrected': return [entry.amountMinor ? 'Payment corrected' : 'Payment voided', `${money(entry.beforeMinor)} → ${money(entry.amountMinor)} · ${entry.reason}`];
    case 'membership-frozen': return ['Membership freeze scheduled', `${dayLabel(entry.startDate)} – ${dayLabel(entry.endDate)} · ${entry.reason}`];
    case 'freeze-ended': return ['Membership freeze ended early', `Resumes ${dayLabel(entry.resumesOn)} · ${entry.reason}`];
  }
}

const eventTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export function GymActivity({ events, members, onOpenMember, compact = false }: {
  events: GymEvent[]; members: ReadonlyMap<string, GymMember>; onOpenMember: (id: string) => void; compact?: boolean;
}) {
  const [limit, setLimit] = useState(compact ? 6 : 30);
  const sorted = events.slice().sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  if (!sorted.length) return <p className="muted">No activity has been recorded yet.</p>;
  return <>
    <ul className="gym-records" aria-label="Gym activity">{sorted.slice(0, limit).map((entry) => {
      const [action, details] = describeEvent(entry);
      const member = 'memberId' in entry ? members.get(entry.memberId) : undefined;
      return <li key={entry.id}>
        <div><strong>{action}{member && !compact ? ` · ${member.name}` : ''}</strong>
          <small>{eventTime.format(entry.createdAt)} · {entry.actor}</small>{details && <small>{details}</small>}
        </div>
        {member && !compact && <Button size="compact" variant="ghost" onClick={() => onOpenMember(member.id)}>View member</Button>}
      </li>;
    })}</ul>
    {sorted.length > limit && <Button size="compact" variant="ghost" onClick={() => setLimit(limit + 30)}>Show more activity</Button>}
  </>;
}
