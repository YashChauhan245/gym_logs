'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { Profile } from '@/db/liftlog';
import { useDatabase } from '@/db/workspace';
import { buildGoalPlan, goalPlanInput, physiqueGoals, trainingDays, trainingExperience, type GoalPlan } from '@/domain/goal-plan';
import { activityLevels } from '@/domain/nutrition';
import { gramLabel, kcalLabel } from './nutrition-controls';

export function GoalPlanner({ profile, onClose, onSaved }: {
  profile: Profile; onClose: () => void; onSaved: (message: string) => void;
}) {
  const db = useDatabase();
  const [plan, setPlan] = useState<GoalPlan>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const results = useRef<HTMLHeadingElement>(null);
  const defaultGoal = profile.goal === 'Lose fat' || profile.goal === 'Build muscle' ? profile.goal : 'Maintain weight';

  useEffect(() => { if (plan) results.current?.focus(); }, [plan]);

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const desired = String(fields.get('targetWeightKg') ?? '').trim();
    const parsed = goalPlanInput.safeParse({
      goal: fields.get('goal'), age: Number(fields.get('age')), heightCm: Number(fields.get('heightCm')),
      weightKg: Number(fields.get('weightKg')), targetWeightKg: desired ? Number(desired) : undefined,
      equation: fields.get('equation'), activity: fields.get('activity'),
      trainingDays: Number(fields.get('trainingDays')), experience: fields.get('experience'),
    });
    const estimate = parsed.success ? buildGoalPlan(parsed.data) : null;
    if (!estimate) {
      setError('Check the measurements and choose an activity level.');
      return;
    }
    setError('');
    setPlan(estimate);
  }

  async function useTargets() {
    if (!plan?.targets || saving) return;
    const { kcal, protein, carbs, fat } = plan.targets;
    setSaving(true);
    setError('');
    try {
      await db.nutritionGoals.put({ id: 'daily', kcal, protein, carbs, fat });
      onSaved('Daily targets saved from your plan.');
    } catch {
      setError('Could not save your nutrition targets.');
    } finally {
      setSaving(false);
    }
  }

  return <Modal open onOpenChange={(open) => { if (!open && !saving) onClose(); }} title="Goal planner"
    description="Get starting estimates and a gym schedule for healthy adults aged 20 and over. Pregnancy and breastfeeding use different energy estimates."
    className="goal-planner-dialog">
    <form className="stack-form" onSubmit={calculate} onChange={() => { setPlan(undefined); setError(''); }}>
      <div className="two-fields">
        <label>Physique goal<select name="goal" defaultValue={defaultGoal}>{physiqueGoals.map((goal) => <option key={goal}>{goal}</option>)}</select></label>
        <label>Goal weight (kg, optional)<input name="targetWeightKg" type="number" min="15" max="500" step="any" inputMode="decimal" /></label>
      </div>
      <div className="nutrition-goal-fields">
        <label>Age<input name="age" type="number" min="20" max="120" inputMode="numeric" required /></label>
        <label>Height (cm)<input name="heightCm" type="number" min="50" max="300" step="any" inputMode="decimal" required /></label>
        <label>Weight (kg)<input name="weightKg" type="number" min="15" max="500" step="any" inputMode="decimal" required /></label>
      </div>
      <div className="two-fields">
        <label>Sex for equation<select name="equation" defaultValue="" required><option value="">Select</option><option>Female</option><option>Male</option></select></label>
        <label>Typical activity<select name="activity" defaultValue="" required><option value="">Select</option>{activityLevels.map((level) => <option key={level}>{level}</option>)}</select></label>
        <label>Gym days per week<select name="trainingDays" defaultValue={Math.min(4, Math.max(2, profile.days))}>{trainingDays.map((days) => <option key={days}>{days}</option>)}</select></label>
        <label>Training experience<select name="experience" defaultValue={profile.experience}>{trainingExperience.map((level) => <option key={level}>{level}</option>)}</select></label>
      </div>
      <Button className="dialog-action" type="submit" disabled={saving}>Calculate plan</Button>
    </form>

    {plan && <section className="goal-plan" aria-labelledby="goal-plan-results">
      <h3 id="goal-plan-results" ref={results} tabIndex={-1}>Your starting plan</h3>
      <dl className="goal-plan-overview">
        <div><dt>Adult BMI</dt><dd><strong>{gramLabel(plan.bmi)}</strong><small>{plan.bmiCategory}</small></dd></div>
        <div><dt>Estimated maintenance</dt><dd><strong>{kcalLabel(plan.maintenance)}</strong><small>kcal/day</small></dd></div>
      </dl>
      <p className="muted">BMI is a screening measure based on height and weight. Use the nutrition estimates as a starting point.</p>
      {plan.targets && <dl className="goal-plan-nutrients" aria-label="Suggested daily nutrition targets">
        <div><dt>Calories</dt><dd>{kcalLabel(plan.targets.kcal)} kcal</dd></div>
        <div><dt>Protein</dt><dd>{gramLabel(plan.targets.protein)} g</dd></div>
        <div><dt>Carbs</dt><dd>{gramLabel(plan.targets.carbs)} g</dd></div>
        <div><dt>Fat</dt><dd>{gramLabel(plan.targets.fat)} g</dd></div>
        <div><dt>Fiber</dt><dd>{gramLabel(plan.targets.fiber)} g</dd></div>
      </dl>}
      {plan.note && <p className="plan-preview">{plan.note}</p>}
      {plan.targets && <div className="goal-plan-save">
        <p className="muted">Apply calories, protein, carbs, and fat to your nutrition diary.</p>
        <Button variant="secondary" onClick={useTargets} disabled={saving}>{saving ? 'Saving…' : 'Use these targets'}</Button>
      </div>}
      <section className="goal-plan-training" aria-label="Suggested workout plan">
        <h3>{plan.training.name}</h3>
        <p className="muted">{plan.training.schedule ?? 'Spread the two upper and two lower sessions across the week as shown below.'}</p>
        <div className="goal-plan-sessions">{plan.training.sessions.map((session) => <section key={session.name}>
          <h4>{session.name}</h4>{session.days && <p className="muted">{session.days}</p>}
          <ul>{session.movements.map(([name, range]) => <li key={name}><span>{name}</span><small>{plan.training.sets} × {range}</small></li>)}</ul>
        </section>)}</div>
        <p className="muted">Warm up with light sets. Start with a load you can control and build up gradually. Brisk walking on other days can add aerobic activity.</p>
      </section>
      <p className="food-source muted">References <a href="https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html" target="_blank" rel="noreferrer">CDC BMI</a> · <a href="https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html" target="_blank" rel="noreferrer">Energy</a> · <a href="https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients.html" target="_blank" rel="noreferrer">Fiber and macros</a> · <a href="https://pubmed.ncbi.nlm.nih.gov/28698222/" target="_blank" rel="noreferrer">Protein</a> · <a href="https://pubmed.ncbi.nlm.nih.gov/41843416/" target="_blank" rel="noreferrer">Strength training</a></p>
    </section>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </Modal>;
}
