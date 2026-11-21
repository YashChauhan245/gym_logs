'use client';

import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Calculator, ChevronLeft, ChevronRight, Coffee, Moon, Pencil, Plus, Settings2, Sparkles, Sun, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { Profile } from '@/db/liftlog';
import { getRecentFoods } from '@/db/nutrition';
import { useDatabase } from '@/db/workspace';
import { localDate, localDateAtNoon, shiftLocalDate, weekDays } from '@/domain/date';
import { activityLevels, estimateMaintenance, foodTotals, goalSchema, meals, sumNutrients, type Food, type FoodLog, type Meal, type NutritionGoals, type Nutrients } from '@/domain/nutrition';
import { PageTitle } from '@/features/dashboard';
import { FoodEntry } from './food-entry';
import { GoalPlanner } from './goal-planner';
import { MealBuilder } from './meal-builder';
import { gramLabel, kcalLabel, portionLabel } from './nutrition-controls';
import { useFoods } from './use-foods';

const mealIcons = { Breakfast: Coffee, Lunch: Sun, Dinner: Moon, Snacks: Utensils };
const macroLabels = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' } as const;
const macroKeys = Object.keys(macroLabels) as (keyof typeof macroLabels)[];

type ModalState = { kind: 'goals' | 'planner' } | { kind: 'entry'; meal?: Meal; entry?: FoodLog } |
  { kind: 'assistant' | 'recipe'; food?: Food; meal: Meal };

export function NutritionScreen({ currentDay, profile, notify }: { currentDay: string; profile: Profile; notify: (message: string) => void }) {
  const db = useDatabase();
  const [chosenDay, setChosenDay] = useState('');
  const [modal, setModal] = useState<ModalState>();
  const day = chosenDay || currentDay;
  const week = weekDays(localDateAtNoon(day));
  const firstDay = localDate(week[0]);
  const lastDay = localDate(week[6]);
  const weekEntries = useLiveQuery(() => db.foodLogs.where('date').between(firstDay, lastDay, true, true).sortBy('createdAt'), [db, firstDay, lastDay], []);
  const showRecents = modal?.kind === 'entry';
  const recentFoods = useLiveQuery(() => showRecents ? getRecentFoods(db, currentDay) : [], [db, currentDay, showRecents], []);
  const goals = useLiveQuery(() => db.nutritionGoals.get('daily'));
  const catalog = useFoods();
  const logged = weekEntries.filter((entry) => entry.date === day).flatMap((entry) => {
    const totals = foodTotals(entry.food, entry.amount, entry.unit);
    return totals ? [{ entry, totals }] : [];
  });
  const totals = sumNutrients(logged.map((row) => row.totals));

  function onSaved(message: string) {
    setModal(undefined);
    notify(message);
  }

  return <div className="screen-stack nutrition-screen">
    <PageTitle title="Nutrition" action={<div className="nutrition-actions">
      <Button onClick={() => setModal({ kind: 'entry' })}><Plus size={19} /> Log food</Button>
      <Button variant="secondary" onClick={() => setModal({ kind: 'assistant', meal: 'Lunch' })}><Sparkles size={17} /> Meal assistant</Button>
      <Button variant="secondary" onClick={() => setModal({ kind: 'recipe', meal: 'Lunch' })}><BookOpen size={17} /> Create recipe</Button>
    </div>} />
    <DiaryCalendar day={day} today={currentDay} week={week} loggedDates={new Set(weekEntries.map((entry) => entry.date))}
      onChoose={(date) => setChosenDay(date === currentDay ? '' : date)} />
    <DailyNutrition totals={totals} goals={goals} onGoals={() => setModal({ kind: 'goals' })} onPlan={() => setModal({ kind: 'planner' })} />
    <section className="meal-diary" aria-labelledby="meal-diary-title">
      <h2 id="meal-diary-title">Meal diary</h2>
      <div className="nutrition-meals">
        {meals.map((meal) => <MealCard key={meal} meal={meal} rows={logged.filter((row) => row.entry.meal === meal)}
          onEntry={(entry) => setModal({ kind: 'entry', meal, entry })} />)}
      </div>
    </section>
    {modal?.kind === 'goals' && <GoalEditor goals={goals} onClose={() => setModal(undefined)} onSaved={onSaved} />}
    {modal?.kind === 'planner' && <GoalPlanner profile={profile} onClose={() => setModal(undefined)} onSaved={onSaved} />}
    {modal?.kind === 'entry' && <FoodEntry date={day} meal={modal.meal} entry={modal.entry} foods={catalog.foods} recents={recentFoods}
      loading={catalog.loading} catalogError={catalog.error} retryCatalog={catalog.retry} onClose={() => setModal(undefined)} onSaved={onSaved}
      onRecipe={(food, meal) => setModal({ kind: 'recipe', food, meal })} />}
    {(modal?.kind === 'recipe' || modal?.kind === 'assistant') && <MealBuilder kind={modal.kind} date={day} foods={catalog.foods} catalogLoading={catalog.loading}
      initialMeal={modal.meal} initialFood={modal.food} onClose={() => setModal(undefined)} onSaved={onSaved} />}
  </div>;
}

function DiaryCalendar({ day, today, week, loggedDates, onChoose }: {
  day: string; today: string; week: Date[]; loggedDates: Set<string>; onChoose: (date: string) => void;
}) {
  const selected = localDateAtNoon(day);
  return <section className="diary-calendar" aria-label="Diary date">
    <div className="diary-calendar-heading">
      <div className="diary-day-title" aria-live="polite">
        <strong>{day === today ? 'Today' : selected.toLocaleDateString(undefined, { weekday: 'long' })}</strong>
        <time dateTime={day}>{selected.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</time>
      </div>
      <div className="diary-navigation">
        {day !== today && <Button variant="ghost" size="compact" onClick={() => onChoose('')}>Back to today</Button>}
        <Button variant="secondary" size="icon" aria-label="Previous day" onClick={() => onChoose(shiftLocalDate(day, -1))}><ChevronLeft size={18} /></Button>
        <Button variant="secondary" size="icon" aria-label="Next day" onClick={() => onChoose(shiftLocalDate(day, 1))}><ChevronRight size={18} /></Button>
      </div>
    </div>
    <div className="diary-week" role="group" aria-label="Days of the week">{week.map((date) => {
      const key = localDate(date);
      const hasFood = loggedDates.has(key);
      return <button key={key} type="button" className="diary-day" aria-pressed={day === key} onClick={() => onChoose(key)}>
        <span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
        <strong>{date.getDate()}</strong>
        <span className="sr-only">{date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}{key === today ? ', today' : ''}{hasFood ? ', food logged' : ''}</span>
        <span className={hasFood ? 'diary-day-mark has-food' : 'diary-day-mark'} aria-hidden="true" />
      </button>;
    })}</div>
  </section>;
}

function DailyNutrition({ totals, goals, onGoals, onPlan }: { totals: Nutrients; goals?: NutritionGoals; onGoals: () => void; onPlan: () => void }) {
  const remaining = goals ? goals.kcal - totals.kcal : null;

  return <section className="panel daily-nutrition" aria-labelledby="daily-nutrition-title">
    <div className="card-heading">
      <h2 id="daily-nutrition-title">Daily totals</h2>
      <div className="nutrition-target-actions">
        <Button variant="secondary" size="compact" onClick={onPlan}><Calculator size={17} /> Goal planner</Button>
        <Button variant="ghost" size="compact" onClick={onGoals}><Settings2 size={17} /> {goals ? 'Edit targets' : 'Set targets'}</Button>
      </div>
    </div>
    <div className="daily-nutrition-data">
      <div className="calorie-summary">
        <p className="calorie-total"><strong data-testid="daily-calories">{kcalLabel(totals.kcal)}</strong> kcal logged</p>
        {goals && remaining !== null && <>
          <progress className="calorie-progress" aria-label="Daily calorie target" value={Math.min(totals.kcal, goals.kcal)} max={goals.kcal} />
          <p className="calorie-target"><span>{kcalLabel(goals.kcal)} kcal target</span><strong>{kcalLabel(Math.abs(remaining))} kcal {remaining < 0 ? 'over' : 'left'}</strong></p>
        </>}
      </div>
      <dl className="macro-targets">{macroKeys.map((key) => {
        const target = goals?.[key];
        return <div key={key}>
          <dt>{macroLabels[key]}</dt>
          <dd><strong>{gramLabel(totals[key])}<span> g</span></strong>
            {target && <><small>{gramLabel(target)} g target</small><progress className="calorie-progress" aria-label={`${macroLabels[key]} intake`} value={Math.min(target, totals[key])} max={target} /></>}
          </dd>
        </div>;
      })}</dl>
    </div>
  </section>;
}

function MealCard({ meal, rows, onEntry }: { meal: Meal; rows: { entry: FoodLog; totals: Nutrients }[]; onEntry: (entry?: FoodLog) => void }) {
  const Icon = mealIcons[meal];
  const energy = rows.reduce((sum, row) => sum + row.totals.kcal, 0);
  return <section className="panel nutrition-meal" aria-label={meal}>
    <div className="meal-heading">
      <div className="meal-title"><Icon size={18} aria-hidden="true" /><div><h3>{meal}</h3><span className="meal-calories"><strong>{kcalLabel(energy)}</strong> kcal</span></div></div>
      <Button variant="secondary" size="compact" aria-label={`Add food to ${meal.toLowerCase()}`} onClick={() => onEntry()}><Plus size={16} /> Add food</Button>
    </div>
    {rows.length > 0 && <ul aria-label={`${meal} foods`} className="meal-food-list">{rows.map(({ entry, totals }) => (
      <li key={entry.id}><button type="button" className="meal-food-row" onClick={() => onEntry(entry)}>
        <span><strong><span className="sr-only">Edit </span>{entry.food.name}</strong><small>{portionLabel(entry)} · P {gramLabel(totals.protein)} g · C {gramLabel(totals.carbs)} g · F {gramLabel(totals.fat)} g</small></span>
        <span className="meal-food-kcal"><strong>{kcalLabel(totals.kcal)}</strong><small>kcal</small></span><Pencil size={14} aria-hidden="true" />
      </button></li>
    ))}</ul>}
  </section>;
}

function GoalEditor({ goals, onClose, onSaved }: { goals?: NutritionGoals; onClose: () => void; onSaved: (message: string) => void }) {
  const db = useDatabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [calories, setCalories] = useState(goals ? String(goals.kcal) : '');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const optional = (key: string) => fields.get(key) ? Number(fields.get(key)) : null;
    const parsed = goalSchema.safeParse({ kcal: Number(fields.get('kcal')), protein: optional('protein'), carbs: optional('carbs'), fat: optional('fat') });
    if (!parsed.success) { setError('Enter a calorie target and valid macro amounts.'); return; }
    setBusy(true);
    setError('');
    try { await db.nutritionGoals.put({ id: 'daily', ...parsed.data }); onSaved('Daily targets saved.'); }
    catch { setError('Could not save daily targets.'); }
    finally { setBusy(false); }
  }

  return <Modal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} title="Daily targets" description="Enter your calorie target. Macro targets are optional." className="nutrition-dialog">
    <form className="stack-form" onSubmit={save}>
      <label>Calories (kcal)<input name="kcal" type="number" min="1" max="20000" inputMode="numeric" required value={calories} onChange={(event) => setCalories(event.target.value)} /></label>
      <div className="nutrition-goal-fields">{macroKeys.map((key) => <label key={key}>{macroLabels[key]} (g)<input name={key} type="number" min="0.1" max="2000" step="any" inputMode="decimal" defaultValue={goals?.[key] ?? ''} /></label>)}</div>
      {error && <p role="alert" className="error-text">{error}</p>}
      <Button className="dialog-action" type="submit" disabled={busy}>Save targets</Button>
    </form>
    <MaintenanceEstimator onApply={(kcal) => setCalories(String(kcal))} />
  </Modal>;
}

function MaintenanceEstimator({ onApply }: { onApply: (kcal: number) => void }) {
  const [estimate, setEstimate] = useState<number | null>();

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setEstimate(estimateMaintenance({
      age: Number(fields.get('age')), heightCm: Number(fields.get('height')), weightKg: Number(fields.get('weight')),
      activity: fields.get('activity'), equation: fields.get('equation'),
    }));
  }

  return <details className="maintenance-estimator"><summary>Estimate maintenance calories</summary>
    <form className="stack-form" onSubmit={calculate} onChange={() => setEstimate(undefined)}>
      <p className="muted food-source">An estimate for weight maintenance for adults 19 and older. Pregnancy and breastfeeding use separate equations. <a href="https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html" target="_blank" rel="noreferrer">DRI equations</a></p>
      <div className="nutrition-goal-fields">
        <label>Age<input name="age" required type="number" min="19" max="120" inputMode="numeric" /></label>
        <label>Height (cm)<input name="height" required type="number" min="50" max="300" step="any" inputMode="decimal" /></label>
        <label>Weight (kg)<input name="weight" required type="number" min="15" max="500" step="any" inputMode="decimal" /></label>
      </div>
      <div className="two-fields">
        <label>Sex for equation<select name="equation" defaultValue="" required><option value="">Select</option><option>Female</option><option>Male</option></select></label>
        <label>Typical activity<select name="activity" defaultValue="" required><option value="">Select</option>{activityLevels.map((label) => <option key={label}>{label}</option>)}</select></label>
      </div>
      {estimate === null && <p role="alert" className="error-text">Check the values for the adult equation.</p>}
      {typeof estimate === 'number' && <div className="food-preview" role="status"><strong>≈ {kcalLabel(estimate)} kcal/day</strong></div>}
      <div className="row-actions"><Button type="submit" variant="secondary">Calculate estimate</Button>{typeof estimate === 'number' && <Button onClick={() => onApply(estimate)}>Use estimate</Button>}</div>
    </form>
  </details>;
}
