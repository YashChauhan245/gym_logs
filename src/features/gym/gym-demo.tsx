'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { addDays, dayLabel, money } from '@/domain/gym';
import { GymCheckIn, GymHeader, GymOverview, type CheckInRow } from './gym-front-desk';

const today = '2026-11-25';
const monthlyFee = 180_000;
type DemoMember = { id: string; name: string; ends: string; paid: number; visit: 'in' | 'out' | null; visitTime?: string; renewed?: boolean };
const sample: DemoMember[] = [
  { id: 'asha', name: 'Asha Mehta', ends: '2026-11-28', paid: 180_000, visit: null },
  { id: 'neel', name: 'Neel Shah', ends: '2026-12-10', paid: 180_000, visit: 'in', visitTime: '08:42' },
  { id: 'riya', name: 'Riya Sen', ends: '2026-12-01', paid: 120_000, visit: 'out', visitTime: '07:35' },
  { id: 'dev', name: 'Dev Rao', ends: '2026-12-15', paid: 180_000, visit: null },
  { id: 'maya', name: 'Maya Iyer', ends: '2026-11-24', paid: 180_000, visit: null },
];
const due = (member: DemoMember) => monthlyFee - member.paid + (member.renewed ? monthlyFee : 0);

export function GymDemo() {
  const [members, setMembers] = useState(sample);
  const [dialog, setDialog] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const selected = members.find(({ id }) => id === dialog);
  const visits = members.filter((member) => member.visit).map((member) => ({
    memberId: member.id, name: member.name, detail: `In at ${member.visitTime}`, status: member.visit === 'in' ? 'In gym' : 'Checked out',
  })).sort((first, second) => second.detail.localeCompare(first.detail));
  const renewals = members.filter((member) => member.ends >= today && member.ends <= addDays(today, 7)).map((member) => ({
    memberId: member.id, name: member.name, detail: 'Monthly membership', status: `Ends ${dayLabel(member.ends)}`,
  }));
  const balances = members.filter((member) => due(member) > 0).map((member) => ({
    memberId: member.id, name: member.name, detail: 'Monthly membership', status: money(due(member)),
  }));
  const rows: CheckInRow[] = members.map((member) => ({
    id: member.id, name: member.name, visit: member.visit, phone: '', email: '', membership: member.ends < today ? 'Expired' : 'Active',
  }));

  function recordVisit(id: string, visit: 'in' | 'out') {
    const member = members.find((row) => row.id === id);
    if (!member) return;
    setMembers((current) => current.map((row) => row.id === id ? { ...row, visit, visitTime: row.visitTime ?? '09:15' } : row));
    setNotice(`${member.name} checked ${visit}.`);
  }

  function renew(member: DemoMember) {
    if (member.renewed) return;
    const nextEnd = addDays(member.ends >= today ? member.ends : addDays(today, -1), 30);
    setMembers((current) => current.map((row) => row.id === member.id ? { ...row, ends: nextEnd, renewed: true } : row));
    setNotice(`${member.name} renewed through ${dayLabel(nextEnd)}.`);
    setDialog(null);
  }

  return <div className="gym-screen gym-demo-screen">
    <GymHeader name="Northline Strength" today={today} note="Sample gym" actions={<>
      <Button variant="secondary" onClick={() => { setMembers(sample); setDialog(null); setNotice('Sample records reset.'); }}><RotateCcw size={17} /> Reset demo</Button>
      <Button onClick={() => { setDialog('check-in'); setNotice(''); }}><CalendarCheck size={18} /> Check in member</Button>
    </>} />
    <div className="gym-demo-bar"><p>Try a check-in or open a member to renew their plan. This demo uses sample records and resets when you leave.</p><Button asChild variant="secondary" size="compact"><Link href="/#gym" prefetch={false}>Open gym management</Link></Button></div>
    <GymOverview active={members.filter((member) => member.ends >= today).length} collected={members.reduce((sum, member) => sum + member.paid, 0)}
      outstanding={members.reduce((sum, member) => sum + due(member), 0)} visits={visits} renewals={renewals} balances={balances} onOpenMember={(id) => { setDialog(id); setNotice(''); }} />
    {dialog && <Modal open onOpenChange={(open) => { if (!open) setDialog(null); }} className="gym-dialog" title={dialog === 'check-in' ? 'Check in member' : selected?.name ?? 'Member'}>
      {notice && <p className="muted" role="status">{notice}</p>}
      {dialog === 'check-in' && <GymCheckIn rows={rows} onOpenMember={setDialog} onCheckIn={(id) => recordVisit(id, 'in')} onCheckOut={(id) => recordVisit(id, 'out')} />}
      {selected && <div className="stack-form">
        <p>Monthly membership · {selected.ends >= today ? 'Ends' : 'Expired'} {dayLabel(selected.ends)}</p>
        <p>{money(due(selected))} outstanding.</p>
        <Button onClick={() => renew(selected)} disabled={selected.renewed}>{selected.renewed ? 'Renewal recorded' : 'Renew membership'}</Button>
      </div>}
    </Modal>}
    {!dialog && <p role="status" className="gym-demo-notice">{notice}</p>}
  </div>;
}
