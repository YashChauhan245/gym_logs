'use client';

import { BookOpen, CalendarDays, Check, ChevronRight, Dumbbell, ListChecks, NotebookPen, Plus, Target, TrendingUp, Utensils, type LucideIcon } from 'lucide-react';
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
  const completed = workouts.filter((workout) => workout.localDate >= first && workout.localDate <= last);
  const trained = new Set(completed.map((workout) => workout.localDate));
  const progress = Math.min(100, (trained.size / days) * 100);

  return <section className="panel weekly-card">
    <div className="card-heading"><div className="card-title"><span className="glyph-box"><CalendarDays size={19} /></span><h2>This week</h2></div><span className="week-count"><strong>{trained.size}</strong><span> / {days} days</span></span></div>
    <div className="week-days">{week.map((date) => {
      const day = localDate(date);
      const done = trained.has(day);
      const current = today && day === localDate(today);
      return <div key={day} className={`week-day${done ? ' day-done' : ''}${current ? ' day-current' : ''}`} aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long' })}${current ? ', today' : ''}${done ? ', workout logged' : ''}`}>
        <small>{date.toLocaleDateString('en', { weekday: 'short' })}</small><span>{done ? <Check size={16} /> : date.getDate()}</span>
      </div>;
    })}</div>
    <div className="week-progress" role="progressbar" aria-label="Weekly training goal" aria-valuenow={Math.min(trained.size, days)} aria-valuemin={0} aria-valuemax={days}><span style={{ width: `${progress}%` }} /></div>
    <p>{trained.size >= days ? 'Weekly training goal reached' : `${days - trained.size} ${days - trained.size === 1 ? 'training day' : 'training days'} to your weekly goal`}</p>
  </section>;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="glyph-box"><Icon size={24} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function WorkoutList({ workouts }: { workouts: Workout[] }) {
  return <ul className="workout-list">{workouts.map((workout) => <li key={workout.id}><a href={`#history/${workout.id}`}>
    <span className="glyph-box"><Dumbbell size={19} /></span><span className="history-row-title"><strong>{workout.title}</strong><small>{new Date(workout.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</small></span>
    <span className="history-duration">{Math.max(1, Math.round(((workout.finishedAt ?? workout.startedAt) - workout.startedAt) / 60_000))} min</span><ChevronRight size={18} aria-hidden="true" />
  </a></li>)}</ul>;
}

export function Today({ active, workouts, profile, today, onStart, onQuick, onSetup }: {
  active: Workout | null; workouts: Workout[]; profile: Profile; today?: Date;
  onStart: () => Promise<void>; onQuick: () => void; onSetup: () => void;
}) {
  return <div className="dashboard">
    <PageTitle title="Today" description={today?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} />
    <section className="training-hero" aria-labelledby="hero-title">
      <div className="hero-content"><div className="hero-category"><Dumbbell size={16} /> Strength training</div>
        <h2 id="hero-title">{active ? 'Pick up where you left off' : 'Your next workout'}</h2>
        <p>{active ? `${active.title} is saved and ready to resume.` : 'Log your sets, track your rest, and see your training add up.'}</p>
        <div className="hero-actions"><Button onClick={onStart}><Plus size={20} /> {active ? 'Resume workout' : 'Start workout'}</Button>
          <Button className="hero-quick" variant="secondary" aria-label="Open Quick Log" onClick={onQuick}><NotebookPen size={18} /> Quick Log</Button>
        </div>
      </div>
    </section>
    <div className="dashboard-grid">
      <WeeklyActivity workouts={workouts} days={profile.days} today={today} />
      <section className="panel quick-card">
        <div className="card-heading"><div className="card-title"><span className="glyph-box"><NotebookPen size={19} /></span><h2>Quick Log</h2></div></div>
        <p>Type or paste your workout. Review the sets before they go into your log.</p>
        <div className="syntax-example"><span aria-hidden="true">›</span> Bench press 60kg × 8, 8, 6</div>
        <Button variant="secondary" onClick={onQuick}><Plus size={18} /> Open Quick Log</Button>
      </section>
    </div>
    <section className="panel recent-card"><div className="card-heading"><div className="card-title"><span className="glyph-box"><ListChecks size={20} /></span><h2>Recent workouts</h2></div><a className="utility-link" href="#workouts">View all <ChevronRight size={16} /></a></div>
      {workouts.length ? <WorkoutList workouts={workouts.slice(0, 3)} /> : <div className="recent-empty"><Dumbbell size={23} /><span><strong>No workouts yet</strong><small>Finished workouts will appear here.</small></span></div>}
    </section>
    {!profile.onboarded && <section className="panel setup-card"><div className="card-title"><span className="glyph-box"><Target size={19} /></span><span><h2>Set your training goal</h2><p>Choose how often you want to lift and which units to use.</p></span></div><Button variant="secondary" onClick={onSetup}>Set up training</Button></section>}
  </div>;
}

export function Workouts({ active, workouts, onStart, onLibrary }: { active: Workout | null; workouts: Workout[]; onStart: () => Promise<void>; onLibrary: () => void }) {
  return <div className="screen-stack">
    <PageTitle title="Workouts" description="Your training sessions and exercise library." action={<Button onClick={onStart}><Plus size={19} /> {active ? 'Resume workout' : 'Start workout'}</Button>} />
    <section className="panel setup-card"><div className="card-title"><span className="glyph-box"><BookOpen size={21} /></span><span><h2>Exercise library</h2><p>Find movements by muscle group or equipment.</p></span></div><Button variant="secondary" onClick={onLibrary}>Browse exercises</Button></section>
    <section className="panel recent-card"><div className="card-heading"><div className="card-title"><span className="glyph-box"><ListChecks size={19} /></span><h2>Workout history</h2></div></div>
      {workouts.length ? <WorkoutList workouts={workouts} /> : <EmptyState icon={Dumbbell} title="No finished workouts" description="Finish a session to build your training history." />}
    </section>
  </div>;
}

export function Progress({ workouts, days, today }: { workouts: Workout[]; days: number; today?: Date }) {
  return <div className="screen-stack"><PageTitle title="Progress" description="See how consistently you’re training." />
    <div className="dashboard-grid"><WeeklyActivity workouts={workouts} days={days} today={today} />
      <section className="panel progress-stat"><div className="card-title"><span className="glyph-box"><TrendingUp size={20} /></span><h2>Total workouts</h2></div><strong>{workouts.length}</strong><p className="muted">Finished sessions on this device</p></section></div>
    <section className="panel recent-card"><div className="card-heading"><h2>Training history</h2></div>{workouts.length ? <WorkoutList workouts={workouts.slice(0, 6)} /> : <EmptyState icon={TrendingUp} title="Log your first workout" description="Your training history starts when you finish a session." />}</section>
  </div>;
}

export function Nutrition() {
  return <div className="screen-stack"><PageTitle title="Nutrition" /><section className="panel"><EmptyState icon={Utensils} title="Meal logging is coming" description="The nutrition milestone will add meal logging, water tracking, and an offline Indian food catalog." /></section></div>;
}
