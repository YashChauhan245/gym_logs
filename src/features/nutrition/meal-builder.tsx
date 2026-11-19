'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { db } from '@/db/liftlog';
import {
  assistantRequest, exactFood, foodSchema, foodTotals, mealDraftSchema, meals, normalizeFood,
  nutrientsForRecipe, parseMealText, portionGrams, servingsFor, sumNutrients,
  type AssistantMode, type Food, type FoodUnit, type Meal, type MealDraft,
} from '@/domain/nutrition';
import { FoodPortionFields, gramLabel, kcalLabel, MacroLine } from './nutrition-controls';
import { saveFoodLogs } from './nutrition-data';

type IngredientRow = { id: string; foodId: string; amount: string; unit: FoodUnit | ''; suggested?: string };
const blankRow = (): IngredientRow => ({ id: crypto.randomUUID(), foodId: '', amount: '', unit: '' });

function draftRows(draft: MealDraft, foods: Food[]): IngredientRow[] {
  return draft.items.map((item) => {
    const food = exactFood(item.name, foods);
    const unit = food && item.unit && servingsFor(food).some((portion) => portion.unit === item.unit) ? item.unit : '';
    return { id: crypto.randomUUID(), foodId: food?.id ?? '', amount: item.amount === null ? '' : String(item.amount), unit, suggested: item.name };
  });
}

export function MealBuilder({ kind, date, initialMeal, initialFood, foods, catalogLoading, onClose, onSaved }: {
  kind: 'assistant' | 'recipe'; date: string; initialMeal: Meal; initialFood?: Food; foods: Food[]; catalogLoading: boolean;
  onClose: () => void; onSaved: (message: string) => void;
}) {
  const [rows, setRows] = useState<IngredientRow[]>(() => initialFood?.recipe?.ingredients.map((ingredient) => ({
    id: crypto.randomUUID(), foodId: ingredient.foodId, unit: 'g', amount: String(ingredient.grams),
  })) ?? (kind === 'recipe' ? [blankRow()] : []));
  const [title, setTitle] = useState(initialFood ? `My ${initialFood.name}` : '');
  const [yieldWeight, setYieldWeight] = useState(initialFood?.recipe ? String(initialFood.recipe.yieldGrams) : '');
  const [servings, setServings] = useState(initialFood?.recipe ? String(Number(initialFood.recipe.servings.toFixed(2))) : '1');
  const [savingRecipe, setSavingRecipe] = useState(kind === 'recipe');
  const [meal, setMeal] = useState(initialMeal);
  const [mode, setMode] = useState<AssistantMode>('log');
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'checking' | 'enabled' | 'setup' | 'offline'>('checking');
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sortedFoods = [...foods].sort((a, b) => a.name.localeCompare(b.name));
  const foodMap = new Map(foods.map((food) => [food.id, food]));
  const ingredients = rows.flatMap((row) => {
    const food = foodMap.get(row.foodId);
    if (!food || !row.unit) return [];
    const amount = Number(row.amount);
    const grams = portionGrams(food, amount, row.unit);
    const totals = foodTotals(food, amount, row.unit);
    return grams === null || !totals ? [] : [{ food, amount, unit: row.unit, grams, totals }];
  });
  const validRows = rows.length > 0 && rows.length === ingredients.length;
  const totals = sumNutrients(ingredients.map((entry) => entry.totals));
  const gramsTotal = ingredients.reduce((current, ingredient) => current + ingredient.grams, 0);

  useEffect(() => {
    if (kind !== 'assistant') return;
    let alive = true;
    const check = () => fetch('/api/meal-assistant', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Assistant unavailable');
        const result: { enabled?: boolean } = await response.json();
        if (alive) setStatus(result.enabled ? 'enabled' : 'setup');
      }).catch(() => { if (alive) setStatus('offline'); });
    const disconnected = () => setStatus('offline');
    void check();
    window.addEventListener('online', check);
    window.addEventListener('offline', disconnected);
    return () => {
      alive = false;
      window.removeEventListener('online', check);
      window.removeEventListener('offline', disconnected);
    };
  }, [kind]);

  function updateRow(id: string, changes: Partial<IngredientRow>) {
    setRows((previous) => previous.map((row) => row.id === id ? { ...row, ...changes } : row));
    setError('');
  }

  function selectFood(row: IngredientRow, foodId: string) {
    const food = foodMap.get(foodId);
    if (!food) { updateRow(row.id, { foodId: '', unit: '', amount: '' }); return; }
    if (row.suggested) {
      const unit = row.unit && servingsFor(food).some((portion) => portion.unit === row.unit) ? row.unit : '';
      updateRow(row.id, { foodId, unit });
    } else {
      updateRow(row.id, { foodId, unit: food.portions[0]?.unit ?? 'g', amount: food.portions.length ? '1' : '100' });
    }
  }

  function loadDraft(draft: MealDraft) {
    setRows(draftRows(draft, foods));
    setTitle(draft.title);
    setYieldWeight('');
    setServings('1');
  }

  function draftOffline() {
    setError('');
    const draft = parseMealText(text);
    if (draft) loadDraft(draft);
    else setError('Start each food with its amount, for example “2 rotis, 1 katori dal”.');
  }

  async function draftWithGemini() {
    const request = assistantRequest.safeParse({ mode, text });
    if (!request.success) { setError('Enter a short meal description or request.'); return; }
    setDrafting(true);
    setError('');
    try {
      const response = await fetch('/api/meal-assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.data),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === 'object' && result && 'error' in result && typeof result.error === 'string' ? result.error : 'Gemini is unavailable.';
        throw new Error(message);
      }
      loadDraft(mealDraftSchema.parse(result));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not draft a meal with Gemini.'); }
    finally { setDrafting(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validRows) { setError('Choose a food and a portion for each row.'); return; }
    setError('');
    setSaving(true);
    try {
      if (savingRecipe) {
        const yieldGrams = yieldWeight.trim() ? Number(yieldWeight) : gramsTotal;
        const servingCount = Number(servings);
        const per100g = nutrientsForRecipe(ingredients.map((entry) => entry.totals), yieldGrams);
        const recipe = foodSchema.safeParse({
          id: crypto.randomUUID(), name: title.trim(), aliases: [], per100g: per100g.success ? per100g.data : undefined,
          portions: [{ unit: 'serving', label: 'serving', grams: yieldGrams / servingCount }],
          source: { kind: 'Your recipe', reference: 'Estimated from your ingredients and cooked yield' },
          recipe: { yieldGrams, servings: servingCount, ingredients: ingredients.map((entry) => ({ foodId: entry.food.id, grams: entry.grams })) },
        });
        if (!recipe.success || !title.trim() || !normalizeFood(title)) {
          setError('Enter a recipe name, a valid cooked weight, and a serving count.'); return;
        }
        await db.customFoods.add(recipe.data);
        onSaved('Recipe saved. Find it in Add food.');
      } else {
        await saveFoodLogs(ingredients.map(({ food, amount, unit }) => ({ date, meal, food, amount, unit })));
        onSaved(`Meal added to ${meal.toLowerCase()}.`);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this meal.'); }
    finally { setSaving(false); }
  }

  return <Modal open onOpenChange={(open) => { if (!open && !saving) onClose(); }}
    title={kind === 'assistant' ? 'Meal assistant' : initialFood ? 'Adjust recipe' : 'Create recipe'} className="nutrition-dialog">
    {kind === 'assistant' && <div className="stack-form assistant-prompt">
      <label>What would you like to do?<select value={mode} onChange={(event) => { setMode(event.target.value as AssistantMode); setError(''); }}>
        <option value="log">Log what I ate</option><option value="plan">Build a meal</option>
      </select></label>
      <label>Meal description<textarea rows={3} maxLength={650} value={text} onChange={(event) => setText(event.target.value)}
        placeholder={mode === 'log' ? '2 rotis, 1 katori dal, and 100 g paneer' : 'Make me a dinner with paneer and rice'} /></label>
      {status === 'enabled' && <p className="muted">Drafting with Gemini sends this description to Google.</p>}
      {status === 'setup' && <p className="muted">Gemini setup is pending. Add the server key to enable meal ideas.</p>}
      {status === 'offline' && <p className="muted">Gemini needs a connection.</p>}
      <div className="row-actions">
        {mode === 'log' && <Button variant="secondary" disabled={drafting || catalogLoading || !text.trim()} onClick={draftOffline}>Draft offline</Button>}
        <Button disabled={drafting || catalogLoading || status !== 'enabled' || !text.trim()} onClick={draftWithGemini}><Sparkles size={17} /> {drafting ? 'Drafting…' : 'Draft with Gemini'}</Button>
      </div>
    </div>}
    {(kind === 'recipe' || rows.length > 0) && <form className="stack-form" onSubmit={save}>
      {kind === 'assistant' && <div className="meal-review-heading"><h3>Review meal draft</h3><p>Check food matches and portions before saving.</p></div>}
      <div className="meal-ingredients">{rows.map((row, index) => <div className="meal-ingredient" key={row.id}>
        <div className="ingredient-header">
          <label>Food {index + 1}<select required value={row.foodId} onChange={(event) => selectFood(row, event.target.value)}>
            <option value="">Choose a food</option>{sortedFoods.map((food) => <option key={food.id} value={food.id}>{food.name}</option>)}
          </select></label>
          <Button size="icon" variant="ghost" aria-label={`Remove food ${index + 1}`} disabled={rows.length < 2} onClick={() => setRows((previous) => previous.filter((item) => item.id !== row.id))}><Trash2 size={17} /></Button>
        </div>
        {row.suggested && !row.foodId && <p className="muted">Choose a match for “{row.suggested}”.</p>}
        {row.suggested && row.foodId && !row.unit && <p className="muted">Review the amount and choose a portion for “{row.suggested}”.</p>}
        <FoodPortionFields suffix={` ${index + 1}`} food={foodMap.get(row.foodId)} amount={row.amount} unit={row.unit} onAmount={(amount) => updateRow(row.id, { amount })} onUnit={(unit) => updateRow(row.id, { unit })} />
      </div>)}</div>
      <Button className="add-ingredient" variant="secondary" disabled={rows.length >= 12} onClick={() => setRows((previous) => [...previous, blankRow()])}><Plus size={17} /> Add ingredient</Button>
      {kind === 'assistant' && <label className="check-label"><input type="checkbox" checked={savingRecipe} onChange={(event) => setSavingRecipe(event.target.checked)} /> Save as a reusable recipe</label>}
      {savingRecipe ? <>
        <label>Recipe name<input required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="two-fields">
          <label>Cooked yield (g)<input type="number" min="0.1" max="50000" step="any" inputMode="decimal" value={yieldWeight} placeholder={gramsTotal ? gramLabel(gramsTotal) : 'Ingredient total'} onChange={(event) => setYieldWeight(event.target.value)} /></label>
          <label>Servings<input required type="number" min="0.01" max="500" step="any" inputMode="decimal" value={servings} onChange={(event) => setServings(event.target.value)} /></label>
        </div>
      </> : <label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value as Meal)}>{meals.map((slot) => <option key={slot}>{slot}</option>)}</select></label>}
      {validRows && <div className="food-preview"><div className="meal-draft-total"><strong>{kcalLabel(totals.kcal)} kcal</strong><small>{savingRecipe ? 'whole recipe' : 'whole meal'}</small></div><MacroLine totals={totals} /></div>}
      <Button type="submit" className="dialog-action" disabled={saving || drafting || !validRows}>{savingRecipe ? 'Save recipe' : 'Log meal'}</Button>
    </form>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </Modal>;
}
