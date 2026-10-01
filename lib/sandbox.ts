/**
 * Meal sandbox math. Pure, so the card re-solves instantly on your phone
 * when you switch 130/110 or nudge an amount.
 *
 * "flex" foods scale together (keeping their ratio) so the day lands on the
 * protein target, rounded to whole eggs, half ounces, etc. "fixed" foods keep
 * the amount you gave or set with the stepper.
 */
import { qty, round } from './format';

export type PlanFood = {
  name: string;
  role: 'fixed' | 'flex';
  grams: number; // fixed: the amount. flex: a starting portion (sets the ratio between flex foods)
  per100: { protein: number; calories: number; carbs: number | null; fat: number | null };
  unit_label: string; // singular: "egg", "shrimp", "oz", "cup", "g"
  unit_plural: string; // "eggs", "shrimp", "oz", "cups", "g"
  grams_per_unit: number;
  step: number; // stepper size in units: 1 egg, 0.5 oz, 25 g
  source: 'usda' | 'estimate';
  fdc_id: number | null;
  fdc_description: string | null;
};

export type SolvedFood = PlanFood & { g: number; units: number; protein: number; kcal: number };
export type Solved = { foods: SolvedFood[]; protein: number; kcal: number; alreadyThere: boolean; capped: boolean };

export const MAX_GRAMS = 600;

const snap = (f: PlanFood, grams: number) => {
  const units = Math.max(f.step, Math.round(grams / f.grams_per_unit / f.step) * f.step);
  return round(units, 2);
};

/** Scale the flex foods so this meal adds `need` grams of protein. */
export function solve(foods: PlanFood[], need: number): Solved {
  const p = (f: PlanFood, g: number) => (f.per100.protein * g) / 100;
  const fixedP = foods.filter((f) => f.role === 'fixed').reduce((a, f) => a + p(f, f.grams), 0);
  const flexP = foods.filter((f) => f.role === 'flex').reduce((a, f) => a + p(f, f.grams), 0);
  const alreadyThere = need <= 0;
  let scale = 1;
  if (!alreadyThere && flexP > 0) scale = Math.min(10, Math.max(0.2, (need - fixedP) / flexP));
  let capped = false;
  const units = foods.map((f) => {
    if (f.role !== 'flex') return round(f.grams / f.grams_per_unit, 2);
    let u = snap(f, f.grams * scale);
    if (u * f.grams_per_unit > MAX_GRAMS) {
      u = snap(f, MAX_GRAMS);
      capped = true;
    }
    return u;
  });
  // rounding to whole eggs / half ounces can leave you a bit short: top up with the leanest flex food
  const total = () => foods.reduce((a, f, i) => a + p(f, units[i] * f.grams_per_unit), 0);
  const flexIdx = foods.map((f, i) => (f.role === 'flex' ? i : -1)).filter((i) => i >= 0);
  const lean = [...flexIdx].sort((a, b) => foods[b].per100.protein / Math.max(foods[b].per100.calories, 1) - foods[a].per100.protein / Math.max(foods[a].per100.calories, 1));
  for (let n = 0; !alreadyThere && lean.length && total() < need - 1 && n < 12; n++) {
    const i = lean.find((j) => (units[j] + foods[j].step) * foods[j].grams_per_unit <= MAX_GRAMS);
    if (i == null) break;
    units[i] = round(units[i] + foods[i].step, 2);
  }
  const out = foods.map((f, i) => {
    const g = round(units[i] * f.grams_per_unit, 1);
    return { ...f, g, units: units[i], protein: round(p(f, g), 1), kcal: Math.round((f.per100.calories * g) / 100) };
  });
  return {
    foods: out,
    protein: round(out.reduce((a, f) => a + f.protein, 0), 1),
    kcal: out.reduce((a, f) => a + f.kcal, 0),
    alreadyThere,
    capped,
  };
}

/** "3 eggs", "4 1/2 oz", "150 g" */
export function amountLabel(f: PlanFood, units: number): string {
  return `${qty(units)} ${units === 1 ? f.unit_label : f.unit_plural}`;
}
