'use client';

import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, ChevronLeft, ChevronRight, Coffee, Flame, Moon, Pencil, Plus, Settings2, Sparkles, Sun, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useDatabase } from '@/db/workspace';
import { activityLevels, estimateMaintenance, foodTotals, goalSchema, meals, servingsFor, sumNutrients, type Food, type FoodLog, type Meal, type NutritionGoals, type Nutrients } from '@/domain/nutrition';
import { localDate } from '@/domain/workout';
import { PageTitle } from '@/features/dashboard';
import { FoodEntry } from './food-entry';
import { MealBuilder } from './meal-builder';
import { gramLabel, kcalLabel } from './nutrition-controls';
import { useFoods } from './nutrition-data';

const mealIcons = { Breakfast: Coffee, Lunch: Sun, Dinner: Moon, Snacks: Utensils };
const macroLabels = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' } as const;
const macroKeys = Object.keys(macroLabels) as (keyof typeof macroLabels)[];

function moveDate(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return localDate(date);
}

type ModalState = { kind: 'goals' } | { kind: 'entry'; meal: Meal; entry?: FoodLog } |
  { kind: 'assistant' | 'recipe'; food?: Food; meal: Meal };

export function NutritionScreen({ currentDay, notify }: { currentDay: string; notify: (message: string) => void }) {
  const db = useDatabase();
  const [chosenDay, setChosenDay] = useState('');
  const [modal, setModal] = useState<ModalState>();
  const day = chosenDay || currentDay;
  const entries = useLiveQuery(() => db.foodLogs.where('date').equals(day).sortBy('createdAt'), [day], []);
  const goals = useLiveQuery(() => db.nutritionGoals.get('daily'));
  const catalog = useFoods();
  const logged = entries.flatMap((entry) => {
    const totals = foodTotals(entry.food, entry.amount, entry.unit);
    return totals ? [{ entry, totals }] : [];
  });
  const totals = sumNutrients(logged.map((row) => row.totals));
  const visibleDate = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  function onSaved(message: string) {
    setModal(undefined);
    notify(message);
  }

  return <div className="screen-stack nutrition-screen">
    <PageTitle title="Nutrition" action={<Button onClick={() => setModal({ kind: 'assistant', meal: 'Lunch' })}><Sparkles size={18} /> Meal assistant</Button>} />
    <div className="nutrition-toolbar">
      <div className="nutrition-date" aria-label="Diary date">
        <Button variant="secondary" size="icon" aria-label="Previous day" onClick={() => setChosenDay(moveDate(day, -1))}><ChevronLeft size={19} /></Button>
        <strong>{day === currentDay ? 'Today' : visibleDate}</strong>
        <Button variant="secondary" size="icon" aria-label="Next day" onClick={() => setChosenDay(moveDate(day, 1))}><ChevronRight size={19} /></Button>
        {day !== currentDay && <Button variant="ghost" size="compact" onClick={() => setChosenDay('')}>Back to today</Button>}
      </div>
      <Button variant="secondary" size="compact" onClick={() => setModal({ kind: 'recipe', meal: 'Lunch' })}><BookOpen size={17} /> Create recipe</Button>
    </div>
    <DailyNutrition totals={totals} goals={goals} onGoals={() => setModal({ kind: 'goals' })} />
    <div className="nutrition-meals">
      {meals.map((meal) => <MealCard key={meal} meal={meal} rows={logged.filter((row) => row.entry.meal === meal)}
        onEntry={(entry) => setModal({ kind: 'entry', meal, entry })} />)}
    </div>
    {modal?.kind === 'goals' && <GoalEditor goals={goals} onClose={() => setModal(undefined)} onSaved={onSaved} />}
    {modal?.kind === 'entry' && <FoodEntry date={day} meal={modal.meal} entry={modal.entry} foods={catalog.foods}
      loading={catalog.loading} catalogError={catalog.error} retryCatalog={catalog.retry} onClose={() => setModal(undefined)} onSaved={onSaved}
      onRecipe={(food, meal) => setModal({ kind: 'recipe', food, meal })} />}
    {(modal?.kind === 'recipe' || modal?.kind === 'assistant') && <MealBuilder kind={modal.kind} date={day} foods={catalog.foods} catalogLoading={catalog.loading}
      initialMeal={modal.meal} initialFood={modal.food} onClose={() => setModal(undefined)} onSaved={onSaved} />}
  </div>;
}

function DailyNutrition({ totals, goals, onGoals }: { totals: Nutrients; goals?: NutritionGoals; onGoals: () => void }) {
  const progress = goals ? Math.min(100, (totals.kcal / goals.kcal) * 100) : 0;
  const remaining = goals ? goals.kcal - totals.kcal : null;

  return <section className="panel daily-nutrition" aria-labelledby="daily-nutrition-title">
    <div className="card-heading"><div className="card-title"><span className="glyph-box"><Flame size={20} /></span><h2 id="daily-nutrition-title">Daily nutrition</h2></div>
      <Button variant="secondary" size="compact" onClick={onGoals}><Settings2 size={17} /> {goals ? 'Edit targets' : 'Set targets'}</Button></div>
    <div className="daily-nutrition-data">
      <div className="calorie-summary">
        <div className="calorie-ring" style={{ background: `conic-gradient(var(--accent) ${progress}%, var(--raised) 0)` }}>
          <div><strong data-testid="daily-calories">{kcalLabel(totals.kcal)}</strong><span>kcal logged</span></div>
        </div>
        {goals ? <p>{kcalLabel(goals.kcal)} kcal target{remaining !== null && <span> · {kcalLabel(Math.abs(remaining))} kcal {remaining < 0 ? 'over' : 'left'}</span>}</p>
          : <p>Set a daily calorie target to track your intake.</p>}
      </div>
      <dl className="macro-targets">{macroKeys.map((key) => {
        const target = goals?.[key];
        return <div key={key} className={target ? 'macro-with-target' : undefined}><dt>{macroLabels[key]}</dt><dd>
          <strong>{gramLabel(totals[key])} g</strong>{target && <span> / {gramLabel(target)} g</span>}
          {target && <progress aria-label={`${macroLabels[key]} intake`} value={Math.min(target, totals[key])} max={target} />}
        </dd></div>;
      })}</dl>
    </div>
  </section>;
}

function MealCard({ meal, rows, onEntry }: { meal: Meal; rows: { entry: FoodLog; totals: Nutrients }[]; onEntry: (entry?: FoodLog) => void }) {
  const Icon = mealIcons[meal];
  const energy = rows.reduce((sum, row) => sum + row.totals.kcal, 0);
  return <section className="panel nutrition-meal" aria-label={meal}>
    <div className="card-heading"><div className="card-title"><span className="glyph-box"><Icon size={18} /></span><h2>{meal}</h2></div>
      <span className="meal-calories"><strong>{kcalLabel(energy)}</strong> kcal</span></div>
    {rows.length > 0 && <ul aria-label={`${meal} foods`} className="meal-food-list">{rows.map(({ entry, totals }) => {
      const serving = servingsFor(entry.food).find((portion) => portion.unit === entry.unit);
      return <li key={entry.id}><button className="meal-food-row" onClick={() => onEntry(entry)}>
        <span><strong><span className="sr-only">Edit </span>{entry.food.name}</strong><small>{gramLabel(entry.amount)} {serving?.unit === 'g' ? 'g' : serving?.label} · P {gramLabel(totals.protein)} g · C {gramLabel(totals.carbs)} g · F {gramLabel(totals.fat)} g</small></span>
        <span className="meal-food-kcal"><strong>{kcalLabel(totals.kcal)}</strong><small>kcal</small></span><Pencil size={14} aria-hidden="true" />
      </button></li>;
    })}</ul>}
    <Button variant="secondary" size="compact" aria-label={`Add food to ${meal.toLowerCase()}`} onClick={() => onEntry()}><Plus size={17} /> Add food</Button>
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
