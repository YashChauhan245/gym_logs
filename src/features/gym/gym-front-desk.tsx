'use client';

import { useState, type ReactNode } from 'react';
import { ArrowRight, CalendarClock, ClipboardCheck, Search, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dayLabel, money } from '@/domain/gym';
import { GymMark } from './gym-brand';

export function GymHeader({ name, today, logo, note, actions }: {
  name?: string; today: string; logo?: string; note: string; actions: ReactNode;
}) {
  return <header className="gym-header">
    <div className="gym-identity">
      <GymMark logo={logo} />
      <div>
        {name && <p className="gym-caption">Gym management</p>}
        <h1>{name ?? 'Gym management'}</h1>
        <p className="gym-header-subtitle"><time dateTime={today}>{dayLabel(today)}</time><span>{note}</span></p>
      </div>
    </div>
    <div className="gym-header-actions">{actions}</div>
  </header>;
}

export type DeskRow = { memberId: string; name: string; detail: string; status?: string };

function DeskQueue({ title, icon: Icon, rows, empty, onOpenMember, onViewAll }: {
  title: string; icon: typeof ClipboardCheck; rows: DeskRow[]; empty: string; onOpenMember: (id: string) => void; onViewAll?: () => void;
}) {
  return <section className="gym-queue" aria-label={title}>
    <div className="gym-queue-heading"><Icon size={18} aria-hidden="true" /><h2>{title}</h2><span>{rows.length}</span></div>
    {rows.length ? <ul>{rows.slice(0, 5).map((row) => <li key={row.memberId}>
      <button className="gym-queue-row" onClick={() => onOpenMember(row.memberId)}>
        <span className="gym-queue-member"><strong>{row.name}</strong><small>{row.detail}</small></span>
        {row.status && <span className="gym-queue-status">{row.status}</span>}
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </li>)}</ul> : <p className="gym-queue-empty">{empty}</p>}
    {rows.length > 5 && onViewAll && <div className="gym-queue-footer"><Button variant="ghost" size="compact" onClick={onViewAll}>View all {rows.length}</Button></div>}
  </section>;
}

export function GymOverview({ active, collected, outstanding, visits, renewals, overdue, balances, onOpenMember, onViewAll, children }: {
  active: number; collected: number; outstanding: number; visits: DeskRow[];
  renewals: DeskRow[]; overdue?: DeskRow[]; balances: DeskRow[]; onOpenMember: (id: string) => void;
  onViewAll?: (queue: 'attendance' | 'renewals' | 'overdue' | 'balances') => void; children?: ReactNode;
}) {
  const metrics = [
    ['Active members', active], ['Check-ins today', visits.length],
    ['Collected this month', money(collected)], ['Outstanding fees', money(outstanding)],
  ] as const;
  return <>
    <dl className="gym-metrics">{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {children}
    <div className="gym-desk-columns">
      <DeskQueue title="Today’s attendance" icon={ClipboardCheck} rows={visits} empty="Today’s check-ins will appear here." onOpenMember={onOpenMember} onViewAll={onViewAll && (() => onViewAll('attendance'))} />
      <div className="gym-follow-ups">
        <DeskQueue title="Renewals in the next 7 days" icon={CalendarClock} rows={renewals} empty="No renewals to follow up this week." onOpenMember={onOpenMember} onViewAll={onViewAll && (() => onViewAll('renewals'))} />
        {!!overdue?.length && <DeskQueue title="Overdue renewals" icon={CalendarClock} rows={overdue} empty="No overdue renewals." onOpenMember={onOpenMember} onViewAll={onViewAll && (() => onViewAll('overdue'))} />}
        <DeskQueue title="Fees to follow up" icon={Wallet} rows={balances} empty="No outstanding member balances." onOpenMember={onOpenMember} onViewAll={onViewAll && (() => onViewAll('balances'))} />
      </div>
    </div>
  </>;
}

export type CheckInRow = { id: string; name: string; phone: string; email: string; membership: string; visit: 'in' | 'out' | null };

export function GymCheckIn({ rows, busy, onCheckIn, onCheckOut, onOpenMember }: {
  rows: CheckInRow[]; busy?: boolean; onCheckIn: (id: string) => void; onCheckOut: (id: string) => void;
  onOpenMember: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const search = query.trim().toLocaleLowerCase();
  const matches = rows.filter((row) => [row.name, row.phone, row.email].some((value) => value.toLocaleLowerCase().includes(search)));
  return <>
    <label className="search-field"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Find a member" data-dialog-autofocus placeholder="Name, phone or email" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    {matches.length ? <ul className="gym-check-in-list" aria-label="Check-in results">{matches.slice(0, 20).map((row) => <li key={row.id}>
      <button className="gym-check-in-member" aria-label={`View ${row.name}`} onClick={() => onOpenMember(row.id)} disabled={busy}>
        <strong>{row.name}</strong><small>{row.membership}{(row.phone || row.email) && ` · ${row.phone || row.email}`}</small>
      </button>
      {row.visit === 'out' ? <span className="gym-visited">Visited today</span> : row.visit === 'in' ? (
        <Button size="compact" variant="secondary" aria-label={`Check out ${row.name}`} onClick={() => onCheckOut(row.id)} disabled={busy}>Check out</Button>
      ) : row.membership === 'Active' ? (
        <Button size="compact" aria-label={`Check in ${row.name}`} onClick={() => onCheckIn(row.id)} disabled={busy}>Check in</Button>
      ) : <span className="gym-visited">Check-in unavailable</span>}
    </li>)}</ul> : <p role="status" className="muted">{rows.length ? 'No members match that search.' : 'Add a member to start recording check-ins.'}</p>}
    {matches.length > 20 && <p role="status" className="muted">Showing 20 matches. Search to find a specific member.</p>}
  </>;
}
