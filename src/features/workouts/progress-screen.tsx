'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, ChartNoAxesCombined } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDatabase } from '@/db/workspace';
import { localDateAtNoon } from '@/domain/date';
import { firstProgressWeek, progressRanges, summarizeTraining, type ProgressRange } from '@/domain/training-progress';
import { weightLabel, type Unit } from '@/domain/workout';
import { PageTitle, WeeklyActivity, WorkoutList } from '@/features/dashboard';
import './progress.css';

const numberLabel = new Intl.NumberFormat();
const dateLabel = (key: string) => localDateAtNoon(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function ProgressScreen({ today, goal, unit }: { today: string; goal: number; unit: Unit }) {
  const db = useDatabase();
  const [range, setRange] = useState<ProgressRange>(8);
  const historyStart = firstProgressWeek(today, 12);
  const history = useLiveQuery(() => db.transaction('r', [db.workouts, db.sets, db.workoutExercises], async () => {
    const workouts = await db.workouts.where('localDate').between(historyStart, today, true, true)
      .filter((workout) => workout.status === 'finished').reverse().sortBy('finishedAt');
    const ids = workouts.map(({ id }) => id);
    const [sets, exercises] = await Promise.all([
      db.sets.where('workoutId').anyOf(ids).toArray(),
      db.workoutExercises.where('workoutId').anyOf(ids).toArray(),
    ]);
    return { workouts, sets, exerciseNames: new Map(exercises.map(({ id, name }) => [id, name])) };
  }), [db, historyStart, today]);
  const data = useMemo(() => summarizeTraining(history?.workouts ?? [], history?.sets ?? [], today, range), [history, today, range]);
  const hours = Math.floor(data.minutes / 60);
  const minutes = data.minutes % 60;

  return <div className="screen-stack progress-screen">
    <PageTitle title="Progress" action={<div className="segmented-control" role="group" aria-label="Progress date range">
      {progressRanges.map((value) => <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>{value} weeks</button>)}
    </div>} />
    {history === undefined ? <p className="muted" role="status">Loading training history…</p> : <>
      <dl className="progress-metrics" aria-label="Training totals">
        <div><dt>Sessions</dt><dd>{numberLabel.format(data.workouts.length)}</dd></div>
        <div><dt>Sets logged</dt><dd>{numberLabel.format(data.setCount)}</dd></div>
        <div><dt>Training time</dt><dd className="progress-time">{hours > 0 && <span>{hours}<small> h</small></span>}<span>{minutes}<small> m</small></span></dd></div>
        <div><dt>Load moved</dt><dd>{weightLabel(data.volume, unit, 0)} <small>{unit}</small></dd></div>
      </dl>

      <div className="progress-overview">
        <TrainingChart weeks={data.weeks} unit={unit} />
        <WeeklyActivity workouts={data.workouts} days={goal} today={localDateAtNoon(today)} />
      </div>

      {data.workouts.length ? <div className="progress-details">
        <section className="recent-card journal-history"><div className="card-heading"><h2>Training history</h2><a className="utility-link" href="#workouts">All workouts <ArrowRight size={16} /></a></div>
          <WorkoutList workouts={data.workouts.slice(0, 5)} />
        </section>
        <section className="recent-card journal-history"><div className="card-heading"><h2>Heaviest sets by lift</h2></div>
          {data.bestSets.length ? <ul className="progress-lifts">{data.bestSets.slice(0, 5).map((set) => <li key={set.id}>
            <a href={`#history/${set.workoutId}`}><span>{history.exerciseNames.get(set.workoutExerciseId) ?? 'Exercise'}</span>
              <strong>{weightLabel(set.loadGrams ?? 0, unit)} {unit} × {set.reps}</strong></a>
          </li>)}</ul> : <p className="recent-empty">Weighted sets will appear here.</p>}
        </section>
      </div> : <section className="progress-start panel">
        <ChartNoAxesCombined size={24} aria-hidden="true" />
        <div><h2>{range}-week training history</h2><p>Finish a workout to see your sessions, sets, and load here.</p></div>
        <Button asChild variant="secondary"><a href="#active">Open workout <ArrowRight size={16} /></a></Button>
      </section>}
    </>}
  </div>;
}

function TrainingChart({ weeks, unit }: { weeks: ReturnType<typeof summarizeTraining>['weeks']; unit: Unit }) {
  const [metric, setMetric] = useState<'sessions' | 'volume'>('sessions');
  const [selected, setSelected] = useState('');
  const current = weeks.find(({ start }) => start === selected) ?? weeks[weeks.length - 1];
  const peak = Math.max(1, ...weeks.map((week) => week[metric]));
  const format = (week: typeof current) => metric === 'sessions'
    ? `${week.sessions} ${week.sessions === 1 ? 'session' : 'sessions'}`
    : `${weightLabel(week.volume, unit)} ${unit}`;

  return <section className="panel training-chart" aria-labelledby="weekly-trend-heading">
    <div className="card-heading">
      <h2 id="weekly-trend-heading">Weekly trend</h2>
      <div className="segmented-control" role="group" aria-label="Weekly trend metric">
        <button type="button" aria-pressed={metric === 'sessions'} onClick={() => setMetric('sessions')}>Sessions</button>
        <button type="button" aria-pressed={metric === 'volume'} onClick={() => setMetric('volume')}>Load</button>
      </div>
    </div>
    <div className={`training-bars${weeks.length > 4 ? ' training-bars-dense' : ''}`} role="group" aria-label="Select a week"
      style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
      {weeks.map((week) => <button key={week.start} type="button" aria-pressed={current.start === week.start} onClick={() => setSelected(week.start)}>
        <span className="training-bar-track" aria-hidden="true"><span style={{ height: `${100 * week[metric] / peak}%` }} /></span>
        <span className="training-bar-date">{dateLabel(week.start)}</span><span className="sr-only">, week starting, {format(week)}</span>
      </button>)}
    </div>
    <p className="training-chart-caption" aria-live="polite"><span>{dateLabel(current.start)} – {dateLabel(current.end)}</span><strong>{format(current)}</strong></p>
  </section>;
}
