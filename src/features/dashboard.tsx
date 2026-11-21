'use client';

import { ArrowRight, BookOpen, Check, ChevronRight, Dumbbell, NotebookPen, Play, Plus, TrendingUp, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Profile, Workout } from '@/db/liftlog';
import { localDate, weekDays } from '@/domain/workout';

export function PageTitle({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="section-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

export function WeeklyActivity({ workouts, days, today }: { workouts: Workout[]; days: number; today?: Date }) {
  const week = today ? weekDays(today) : [];
  const first = week.length ? localDate(week[0]) : '';
  const last = week.length ? localDate(week[6]) : '';
  const trained = new Set(workouts.filter((workout) => workout.localDate >= first && workout.localDate <= last).map((workout) => workout.localDate));
  const todayKey = today ? localDate(today) : '';
  const goalProgress = Math.min(trained.size, days);

  return <section className="panel weekly-card" aria-label="This week">
    <h2>This week</h2>
    <ul className="week-days">{week.map((date) => {
      const dateKey = localDate(date);
      const done = trained.has(dateKey);
      const current = dateKey === todayKey;
      return <li key={dateKey} className={`week-day${done ? ' day-done' : ''}`} aria-current={current ? 'date' : undefined}>
        <span className="sr-only">{date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}{done && ', workout logged'}</span>
        <small aria-hidden="true">{date.toLocaleDateString('en', { weekday: 'short' })}</small>
        <span className="week-date" aria-hidden="true">{done ? <Check size={17} /> : date.getDate()}</span>
      </li>;
    })}</ul>
    <div className="week-goal">
      <p className="week-count"><strong>{trained.size}</strong> / {days} training days</p>
      <progress className="week-progress" aria-label="Weekly training goal" value={goalProgress} max={days} />
    </div>
  </section>;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="glyph-box"><Icon size={24} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function WorkoutList({ workouts }: { workouts: Workout[] }) {
  return <ul className="workout-list">{workouts.map((workout) => <li key={workout.id}><a href={`#history/${workout.id}`}>
    <time className="history-date" dateTime={workout.localDate}>{new Date(`${workout.localDate}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</time>
    <strong className="history-row-title">{workout.title}</strong>
    <span className="history-duration">{Math.max(1, Math.round(((workout.finishedAt ?? workout.startedAt) - workout.startedAt) / 60_000))} min</span><ChevronRight size={18} aria-hidden="true" />
  </a></li>)}</ul>;
}

export function Today({ active, workouts, profile, today, onStart, onQuick, onSetup }: {
  active: Workout | null; workouts: Workout[]; profile: Profile; today?: Date;
  onStart: () => Promise<void>; onQuick: () => void; onSetup: () => void;
}) {
  return <div className="dashboard">
    <header className="section-heading today-heading"><div>
      {today && <time dateTime={localDate(today)}>{today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</time>}
      <h1>Today</h1>
    </div></header>
    <div className="dashboard-grid today-grid">
      <section className="panel session-launch" aria-labelledby="session-launch-title">
        <div className="session-launch-main">
          <div>
            {active && <div className="training-status"><span />In progress</div>}
            <h2 id="session-launch-title">{active?.title ?? 'Workout'}</h2>
            {!active && <p>Add exercises and log your sets.</p>}
          </div>
          <Button onClick={onStart}>{active ? <Play size={17} /> : <Plus size={20} />} {active ? 'Resume workout' : 'Start workout'}</Button>
        </div>
        <button type="button" className="quick-entry" onClick={onQuick}>
          <NotebookPen size={19} aria-hidden="true" />
          <span><strong>Open Quick Log</strong><small>Paste a workout from your notes</small></span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </section>
      <WeeklyActivity workouts={workouts} days={profile.days} today={today} />
    </div>
    <section className="recent-card journal-history"><div className="card-heading"><h2>Recent workouts</h2><a className="utility-link" href="#workouts">View history <ArrowRight size={16} /></a></div>
      {workouts.length ? <WorkoutList workouts={workouts.slice(0, 3)} /> : <p className="recent-empty">No finished workouts yet.</p>}
    </section>
    {!profile.onboarded && <section className="setup-card journal-setup"><div><h2>Training preferences</h2><p>Set your weekly goal and choose kg or lb.</p></div><Button variant="secondary" onClick={onSetup}>Set up training</Button></section>}
  </div>;
}

export function Workouts({ active, workouts, onStart, onLibrary }: { active: Workout | null; workouts: Workout[]; onStart: () => Promise<void>; onLibrary: () => void }) {
  return <div className="screen-stack">
    <PageTitle title="Workouts" description="Your training sessions and exercise library." action={<Button onClick={onStart}><Plus size={19} /> {active ? 'Resume workout' : 'Start workout'}</Button>} />
    <section className="panel setup-card"><div className="card-title"><span className="glyph-box"><BookOpen size={21} /></span><span><h2>Exercise library</h2><p>Browse by muscle group and see movement photos and form cues.</p></span></div><Button variant="secondary" onClick={onLibrary}>Browse exercises</Button></section>
    <section className="recent-card journal-history"><div className="card-heading"><h2>Workout history</h2></div>
      {workouts.length ? <WorkoutList workouts={workouts} /> : <EmptyState icon={Dumbbell} title="No finished workouts" description="Finish a session to build your training history." />}
    </section>
  </div>;
}

export function Progress({ workouts, days, today }: { workouts: Workout[]; days: number; today?: Date }) {
  return <div className="screen-stack"><PageTitle title="Progress" description="See how consistently you’re training." />
    <div className="dashboard-grid"><WeeklyActivity workouts={workouts} days={days} today={today} />
      <section className="panel progress-stat"><div className="card-title"><span className="glyph-box"><TrendingUp size={20} /></span><h2>Total workouts</h2></div><strong>{workouts.length}</strong><p className="muted">Finished sessions on this device</p></section></div>
    <section className="recent-card journal-history"><div className="card-heading"><h2>Training history</h2></div>{workouts.length ? <WorkoutList workouts={workouts.slice(0, 6)} /> : <EmptyState icon={TrendingUp} title="Log your first workout" description="Your training history starts when you finish a session." />}</section>
  </div>;
}
