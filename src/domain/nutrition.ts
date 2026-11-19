import { z } from 'zod';

export const meals = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const;
export const mealSchema = z.enum(meals);
export type Meal = (typeof meals)[number];

export const foodUnits = ['g', 'piece', 'katori', 'glass', 'cup', 'tbsp', 'tsp', 'serving'] as const;
const foodUnit = z.enum(foodUnits);
export type FoodUnit = (typeof foodUnits)[number];
export const foodAmount = z.number().positive().max(50_000);
export const nutrients = z.object({
  kcal: z.number().nonnegative().max(1000),
  protein: z.number().nonnegative().max(100),
  carbs: z.number().nonnegative().max(100),
  fat: z.number().nonnegative().max(100),
});
export type Nutrients = z.infer<typeof nutrients>;

export const foodSchema = z.object({
  id: z.string(), name: z.string(), aliases: z.array(z.string()),
  per100g: nutrients,
  portions: z.array(z.object({ unit: foodUnit.exclude(['g']), label: z.string(), grams: foodAmount })),
  source: z.object({
    kind: z.enum(['USDA', 'Recipe estimate', 'Label estimate', 'Your recipe', 'Your food']),
    reference: z.string().optional(),
    url: z.url().optional(),
  }),
  recipe: z.object({
    yieldGrams: foodAmount,
    servings: z.number().positive(),
    ingredients: z.array(z.object({ foodId: z.string(), grams: foodAmount })),
  }).optional(),
});
export type Food = z.infer<typeof foodSchema>;

export const nutritionLogSchema = z.object({
  date: z.iso.date(), meal: mealSchema, food: foodSchema, amount: foodAmount, unit: foodUnit,
});
export type LogInput = z.infer<typeof nutritionLogSchema>;
export type FoodLog = LogInput & { id: string; createdAt: number };

export const goalSchema = z.object({
  kcal: z.number().int().positive().max(20_000),
  protein: z.number().positive().max(2000).nullable(),
  carbs: z.number().positive().max(2000).nullable(),
  fat: z.number().positive().max(2000).nullable(),
});
export type NutritionGoals = z.infer<typeof goalSchema> & { id: 'daily' };

export const activityLevels = ['Inactive', 'Low active', 'Active', 'Very active'] as const;
const maintenanceInput = z.object({
  equation: z.enum(['Female', 'Male']), activity: z.enum(activityLevels),
  age: z.number().int().min(19).max(120), heightCm: z.number().min(50).max(300), weightKg: z.number().min(15).max(500),
});

// 2023 DRI adult energy equations, with height in cm and weight in kg.
const maintenanceCoefficients = {
  Female: [[584.90, -7.01, 5.72, 11.71], [575.77, -7.01, 6.60, 12.14], [710.25, -7.01, 6.54, 12.34], [511.83, -7.01, 9.07, 12.56]],
  Male: [[753.07, -10.83, 6.50, 14.10], [581.47, -10.83, 8.30, 14.94], [1004.82, -10.83, 6.52, 15.91], [-517.88, -10.83, 15.61, 19.11]],
};

export function estimateMaintenance(input: unknown) {
  const parsed = maintenanceInput.safeParse(input);
  if (!parsed.success) return null;
  const { equation, activity, age, heightCm, weightKg } = parsed.data;
  const [base, ageFactor, heightFactor, weightFactor] = maintenanceCoefficients[equation][activityLevels.indexOf(activity)];
  const kcal = Math.round(base + ageFactor * age + heightFactor * heightCm + weightFactor * weightKg);
  return kcal > 0 ? kcal : null;
}

export type Serving = { unit: FoodUnit; label: string; grams: number };
export function servingsFor(food: Food): Serving[] {
  return [...food.portions, { unit: 'g', label: 'grams (g)', grams: 1 }];
}

export function portionGrams(food: Food, amount: number, unit: FoodUnit) {
  const factor = unit === 'g' ? 1 : food.portions.find((portion) => portion.unit === unit)?.grams;
  if (!factor || !foodAmount.safeParse(amount).success) return null;
  const grams = amount * factor;
  return foodAmount.safeParse(grams).success ? grams : null;
}

export function scaledNutrients(value: Nutrients, factor: number): Nutrients {
  return { kcal: value.kcal * factor, protein: value.protein * factor, carbs: value.carbs * factor, fat: value.fat * factor };
}

export function foodTotals(food: Food, amount: number, unit: FoodUnit) {
  const grams = portionGrams(food, amount, unit);
  return grams === null ? null : scaledNutrients(food.per100g, grams / 100);
}

export function sumNutrients(entries: Nutrients[]): Nutrients {
  return entries.reduce((sum, part) => ({
    kcal: sum.kcal + part.kcal, protein: sum.protein + part.protein,
    carbs: sum.carbs + part.carbs, fat: sum.fat + part.fat,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

export function nutrientsForRecipe(ingredients: Nutrients[], yieldGrams: number) {
  return nutrients.safeParse(scaledNutrients(sumNutrients(ingredients), 100 / yieldGrams));
}

export function normalizeFood(text: string) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function exactFood(name: string, catalog: Food[]) {
  const query = normalizeFood(name);
  if (!query) return undefined;
  const exact = catalog.filter((food) => [food.name, ...food.aliases].some((term) => normalizeFood(term) === query));
  return exact.length === 1 ? exact[0] : undefined;
}

export const assistantModes = ['log', 'plan'] as const;
export const assistantRequest = z.object({ mode: z.enum(assistantModes), text: z.string().trim().min(3).max(650) });
export type AssistantMode = (typeof assistantModes)[number];
const draftIngredient = z.object({
  name: z.string().trim().min(1).max(100),
  amount: foodAmount.nullable(),
  unit: foodUnit.nullable(),
});
export const mealDraftSchema = z.object({
  title: z.string().trim().min(1).max(80),
  items: z.array(draftIngredient).min(1).max(12),
});
export type MealDraft = z.infer<typeof mealDraftSchema>;

const typedUnits: Record<string, FoodUnit> = {
  g: 'g', gram: 'g', grams: 'g', kg: 'g', piece: 'piece', pieces: 'piece',
  katori: 'katori', katoris: 'katori', glass: 'glass', glasses: 'glass', cup: 'cup', cups: 'cup',
  tbsp: 'tbsp', tsp: 'tsp', serving: 'serving', servings: 'serving',
};

export function parseMealText(text: string): MealDraft | null {
  const clean = text.trim().replace(/^(?:i\s+)?(?:ate|had)\s+/i, '');
  const lines = clean.split(/[,;\n]+|\s+and\s+(?=\d)/i).map((line) => line.trim().replace(/^and\s+/i, '').trim()).filter(Boolean);
  const items = lines.map((line) => {
    const match = /^(\d+(?:\.\d+)?|\.\d+)\s*(.*)$/.exec(line);
    if (!match) return { name: line, amount: null, unit: null };
    const [, value, rest] = match;
    const cleaned = rest.trim().replace(/^of\s+/i, '').trim();
    const [first, ...words] = cleaned.split(/\s+/);
    const unit = typedUnits[first.toLowerCase()];
    const name = unit ? words.join(' ').replace(/^of\s+/i, '').trim() : cleaned;
    return { name, amount: Number(value) * (first.toLowerCase() === 'kg' ? 1000 : 1), unit: unit ?? 'piece' };
  });
  if (!items.some((item) => item.amount !== null)) return null;
  const validated = mealDraftSchema.safeParse({ title: 'Meal draft', items });
  return validated.success ? validated.data : null;
}
