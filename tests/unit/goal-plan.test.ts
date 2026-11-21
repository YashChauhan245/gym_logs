import { describe, expect, it } from 'vitest';
import { buildGoalPlan, goalPlanInput } from '@/domain/goal-plan';

const base = goalPlanInput.parse({
  age: 28, heightCm: 175, weightKg: 80, equation: 'Male', activity: 'Low active',
  goal: 'Maintain weight', experience: 'Beginner', trainingDays: 3,
});

describe('the adult goal planner', () => {
  it('calculates BMI, fibre, and a macro split near the calorie target', () => {
    const plan = buildGoalPlan(base);
    expect(plan?.bmi).toBeCloseTo(26.12, 2);
    expect(plan?.bmiCategory).toBe('Overweight range');
    expect(plan?.maintenance).toBe(2926);
    expect(plan?.targets).toMatchObject({ kcal: 2950, protein: 128, fiber: 41 });
    const { kcal, protein, carbs, fat } = plan!.targets!;
    expect(Math.abs(kcal - 4 * protein - 4 * carbs - 9 * fat)).toBeLessThanOrEqual(2);
    expect(plan?.training).toMatchObject({ name: 'Three-day full body', sets: 2 });
  });

  it('uses a modest energy adjustment and changes the split for four gym days', () => {
    const maintain = buildGoalPlan(base)!.targets!.kcal;
    const gain = buildGoalPlan({ ...base, goal: 'Build muscle', trainingDays: 4, experience: 'Intermediate' });
    const lose = buildGoalPlan({ ...base, goal: 'Lose fat' });
    expect(gain!.targets!.kcal).toBeGreaterThan(maintain);
    expect(lose!.targets!.kcal).toBeLessThan(maintain);
    expect(gain?.training).toMatchObject({ name: 'Four-day upper/lower split', sets: 3 });
    expect(gain?.training.sessions).toHaveLength(2);
  });

  it('uses maintenance at a reached goal weight and skips unsafe weight-loss targets', () => {
    const reached = buildGoalPlan({ ...base, goal: 'Lose fat', targetWeightKg: 80 });
    const underweight = buildGoalPlan({ ...base, goal: 'Lose fat', targetWeightKg: 50 });
    expect(reached?.targets?.kcal).toBe(buildGoalPlan(base)?.targets?.kcal);
    expect(underweight?.targets).toBeNull();
    expect(underweight?.note).toContain('underweight');
    expect(goalPlanInput.safeParse({ ...base, age: 19 }).success).toBe(false);
  });
});
