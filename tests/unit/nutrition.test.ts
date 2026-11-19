import { readFileSync } from 'node:fs';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { LiftLogDB } from '@/db/liftlog';
import { estimateMaintenance, exactFood, foodSchema, foodTotals, nutrientsForRecipe, parseMealText, portionGrams, sumNutrients } from '@/domain/nutrition';

const catalog = foodSchema.array().parse(JSON.parse(readFileSync('public/data/foods.json', 'utf8')));
const food = (id: string) => catalog.find((item) => item.id === `food:${id}`)!;

describe('offline serving and recipe calculations', () => {
  it('stores 100+ unique, source-labelled foods with valid portions and recipe references', () => {
    const ids = new Set(catalog.map((entry) => entry.id));
    expect(catalog.length).toBeGreaterThanOrEqual(100);
    expect(ids.size).toBe(catalog.length);
    expect(catalog.every((entry) => entry.source.reference && (!entry.recipe || entry.recipe.ingredients.every((ingredient) => ids.has(ingredient.foodId))))).toBe(true);
  });

  it('keeps fractional nutrients until meal and daily totals are computed', () => {
    const totals = sumNutrients([
      foodTotals(food('roti'), 2, 'piece')!, foodTotals(food('dal'), 1, 'katori')!, foodTotals(food('paneer'), 100, 'g')!,
    ]);
    expect(totals.kcal).toBeCloseTo(779.7);
    expect(totals.protein).toBeCloseTo(39.18);
    expect(totals.carbs).toBeCloseTo(70.18);
    expect(totals.fat).toBeCloseTo(38.825);
  });

  it('uses a food-specific serving weight and rejects unsupported portions', () => {
    expect(portionGrams(food('roti'), 1.5, 'piece')).toBe(60);
    expect(portionGrams(food('dal'), 1, 'katori')).toBe(150);
    expect(portionGrams(food('paneer'), 2, 'glass')).toBeNull();
    expect(portionGrams(food('paneer'), -50, 'g')).toBeNull();
    expect(foodTotals(food('water'), 1, 'glass')?.kcal).toBe(0);
  });

  it('uses cooked yield for the recipe’s nutrition per 100 g', () => {
    const recipe = food('chai').recipe!;
    const ingredients = recipe.ingredients.map(({ foodId, grams }) => foodTotals(catalog.find((entry) => entry.id === foodId)!, grams, 'g')!);
    const result = nutrientsForRecipe(ingredients, recipe.yieldGrams);
    expect(result.success && result.data.kcal).toBeCloseTo(food('chai').per100g.kcal);
    expect(nutrientsForRecipe(ingredients, 0).success).toBe(false);
  });
});

describe('offline meal drafting', () => {
  it('extracts quantities and matches common Indian food aliases', () => {
    const draft = parseMealText('I ate 2 rotis, 1 katori dal, and 100 g paneer');
    expect(draft?.items).toEqual([
      { name: 'rotis', amount: 2, unit: 'piece' }, { name: 'dal', amount: 1, unit: 'katori' }, { name: 'paneer', amount: 100, unit: 'g' },
    ]);
    expect(draft?.items.map((item) => exactFood(item.name, catalog)?.id)).toEqual(['food:roti', 'food:dal', 'food:paneer']);
  });

  it('preserves foods with missing amounts for review and supports compact grams', () => {
    expect(parseMealText('100g rice; paneer')?.items).toEqual([
      { name: 'rice', amount: 100, unit: 'g' }, { name: 'paneer', amount: null, unit: null },
    ]);
    expect(parseMealText('plan a dinner with rice')).toBeNull();
    expect(exactFood('unknown paneer dish', catalog)).toBeUndefined();
  });
});

it('estimates maintenance with the matching adult activity equation', () => {
  const input = { equation: 'Male', activity: 'Inactive', age: 30, heightCm: 178, weightKg: 80 };
  expect(estimateMaintenance(input)).toBe(2713);
  expect(estimateMaintenance({ ...input, equation: 'Female', activity: 'Active' })).toBe(2651);
  expect(estimateMaintenance({ ...input, age: 18 })).toBeNull();
});

it('adds nutrition stores without deleting a version-one workout', async () => {
  const name = `liftlog-nutrition-upgrade-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(1).stores({
    profiles: 'id', workouts: 'id, [status+startedAt], localDate, finishedAt',
    workoutExercises: 'id, workoutId, [workoutId+position]', sets: 'id, workoutId, [workoutExerciseId+position], [exerciseId+completedAt]',
    customExercises: 'id, name', favourites: 'id', deviceState: 'id',
  });
  await old.table('workouts').add({ id: 'old-workout', title: 'First workout' });
  old.close();
  const upgraded = new LiftLogDB(name);
  try {
    expect(await upgraded.workouts.get('old-workout')).toMatchObject({ title: 'First workout' });
    await upgraded.nutritionGoals.add({ id: 'daily', kcal: 2200, protein: null, carbs: null, fat: null });
    expect(await upgraded.nutritionGoals.get('daily')).toMatchObject({ kcal: 2200 });
  } finally { await upgraded.delete(); }
});
