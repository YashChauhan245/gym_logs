import { servingsFor, type Food, type FoodLog, type FoodUnit, type Nutrients } from '@/domain/nutrition';

const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
export const kcalLabel = (kcal: number) => whole.format(kcal);
export const gramLabel = (grams: number) => decimal.format(grams);

export function portionLabel({ food, amount, unit }: Pick<FoodLog, 'food' | 'amount' | 'unit'>) {
  return `${gramLabel(amount)} ${unit === 'g' ? 'g' : food.portions.find((portion) => portion.unit === unit)?.label ?? unit}`;
}

export function MacroLine({ totals }: { totals: Nutrients }) {
  return <div className="food-macros">
    <span>Protein <strong>{gramLabel(totals.protein)} g</strong></span>
    <span>Carbs <strong>{gramLabel(totals.carbs)} g</strong></span>
    <span>Fat <strong>{gramLabel(totals.fat)} g</strong></span>
  </div>;
}

export function FoodPortionFields({ food, amount, unit, onAmount, onUnit, suffix = '' }: {
  food?: Food; amount: string; unit: FoodUnit | ''; onAmount: (amount: string) => void;
  onUnit: (unit: FoodUnit | '') => void; suffix?: string;
}) {
  const options = food ? servingsFor(food) : [];
  return <div className="two-fields food-portion-fields">
    <label>Amount{suffix}<input type="number" inputMode="decimal" min="0.01" step="any" max="50000" value={amount} onChange={(event) => onAmount(event.target.value)} required /></label>
    <label>Portion{suffix}<select value={unit} onChange={(event) => onUnit(event.target.value as FoodUnit | '')} required>
      {(!unit || !food) && <option value="">Choose a portion</option>}
      {options.map((portion) => <option key={portion.unit} value={portion.unit}>{portion.label}{portion.unit === 'g' ? '' : ` (${gramLabel(portion.grams)} g)`}</option>)}
    </select></label>
  </div>;
}
