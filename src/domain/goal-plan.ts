import { z } from 'zod';
import { estimateMaintenance, maintenanceInput } from './nutrition';

export const physiqueGoals = ['Build muscle', 'Lose fat', 'Maintain weight'] as const;
export const trainingDays = [2, 3, 4] as const;
export const trainingExperience = ['Beginner', 'Intermediate', 'Advanced'] as const;

export const goalPlanInput = maintenanceInput.extend({
  age: maintenanceInput.shape.age.min(20),
  goal: z.enum(physiqueGoals),
  targetWeightKg: maintenanceInput.shape.weightKg.optional(),
  trainingDays: z.literal(trainingDays),
  experience: z.enum(trainingExperience),
});

type PlanInput = z.infer<typeof goalPlanInput>;
type Movement = readonly [exercise: string, range: string];
type StrengthPlan = {
  name: string;
  sets: number;
  schedule?: string;
  sessions: { name: string; days?: string; movements: Movement[] }[];
};

const fullBodyA: Movement[] = [
  ['Goblet Squat', '8–12 reps'], ['Machine Chest Press', '8–12 reps'], ['Seated Cable Rows', '8–12 reps'],
  ['Romanian Deadlift', '8–12 reps'], ['Plank', '20–40 sec'],
];
const fullBodyB: Movement[] = [
  ['Dumbbell Step-up', '8–12 reps per side'], ['Incline Dumbbell Press', '8–12 reps'], ['Lat Pulldown', '8–12 reps'],
  ['Barbell Hip Thrust', '8–12 reps'], ['Pallof Press', '8–12 reps per side'],
];
const upper: Movement[] = [
  ['Incline Dumbbell Press', '8–12 reps'], ['Lat Pulldown', '8–12 reps'], ['Seated Cable Rows', '8–12 reps'],
  ['Dumbbell Lateral Raise', '12–15 reps'], ['Rope Triceps Pushdown', '10–15 reps'], ['Dumbbell Bicep Curl', '10–15 reps'],
];
const lower: Movement[] = [
  ['Leg Press', '8–12 reps'], ['Romanian Deadlift', '8–12 reps'], ['Seated Leg Curl', '10–15 reps'],
  ['Seated Calf Raise', '10–15 reps'], ['Plank', '20–40 sec'],
];

function strengthPlan({ trainingDays: days, experience }: PlanInput): StrengthPlan {
  const sets = experience === 'Beginner' ? 2 : 3;
  if (days === 4) return {
    name: 'Four-day upper/lower split', sets,
    sessions: [{ name: 'Upper body', days: 'Monday and Thursday', movements: upper },
      { name: 'Lower body', days: 'Tuesday and Friday', movements: lower }],
  };
  return {
    name: days === 2 ? 'Two-day full body' : 'Three-day full body', sets,
    schedule: days === 2 ? 'Do both sessions each week with a day off between them.' : 'Alternate A and B on three nonconsecutive days. Start with A one week and B the next.',
    sessions: [{ name: 'Full body A', movements: fullBodyA }, { name: 'Full body B', movements: fullBodyB }],
  };
}

function bodyMassIndex(weightKg: number, heightCm: number) {
  return weightKg / (heightCm / 100) ** 2;
}

function bmiCategory(bmi: number) {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Healthy weight range';
  if (bmi < 30) return 'Overweight range';
  return 'Obesity range';
}

export function buildGoalPlan(input: PlanInput) {
  const maintenance = estimateMaintenance(input);
  if (maintenance === null) return null;

  const bmi = bodyMassIndex(input.weightKg, input.heightCm);
  const targetBmi = input.targetWeightKg === undefined ? null : bodyMassIndex(input.targetWeightKg, input.heightCm);
  const overview = { maintenance, bmi, bmiCategory: bmiCategory(bmi), training: strengthPlan(input) };
  const reachedGoal = input.targetWeightKg !== undefined && (
    (input.goal === 'Build muscle' && input.weightKg >= input.targetWeightKg) ||
    (input.goal === 'Lose fat' && input.weightKg <= input.targetWeightKg)
  );
  const goal = reachedGoal ? 'Maintain weight' : input.goal;
  const adjustment = goal === 'Build muscle' ? Math.min(250, maintenance * .05)
    : goal === 'Lose fat' ? -Math.min(300, maintenance * .1) : 0;
  const calories = Math.round((maintenance + adjustment) / 50) * 50;

  if (input.goal === 'Lose fat' && (bmi < 18.5 || (targetBmi !== null && targetBmi < 18.5))) {
    return { ...overview, targets: null, note: 'A weight-loss target is unavailable when your current or target weight is in the underweight range. A registered dietitian can help you choose a goal.' };
  }
  if (calories < 1500) {
    return { ...overview, targets: null, note: 'This estimate is below the range used by the planner. A registered dietitian can help you set a daily target.' };
  }

  const protein = Math.round(Math.max(calories * .1 / 4, Math.min(input.weightKg * 1.6, calories * .28 / 4)));
  const fat = Math.round(calories * .27 / 9);
  const carbs = Math.round((calories - 4 * protein - 9 * fat) / 4);
  const fiber = Math.round(calories * 14 / 1000);
  const note = reachedGoal ? 'Your current weight has reached the target you entered. These estimates use maintenance calories.' : undefined;
  return { ...overview, targets: { kcal: calories, protein, carbs, fat, fiber }, note };
}

export type GoalPlan = NonNullable<ReturnType<typeof buildGoalPlan>>;
