/**
 * USDA FoodData Central lookup with a sanity check.
 *
 * The old version trusted the first search hit, which is how "1 cup rice" can
 * become raw rice (3x the calories) or a stew can match a paste. Now we keep the
 * top candidates and only accept one whose calories and protein for the amount
 * eaten land near a realistic estimate. If none do, the estimate is used and the
 * item is marked "est." so you can see it.
 */
import { db } from './db';

export type Per100 = { protein: number; calories: number; carbs: number | null; fat: number | null };
export type FoodMatch = { fdc_id: number; description: string; per100: Per100 };

const API = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const GENERIC = 'Foundation,SR Legacy,Survey (FNDDS)';

type Nutrient = { nutrientId?: number; nutrientNumber?: string; value?: number; unitName?: string };
type Food = { fdcId: number; description: string; brandOwner?: string; brandName?: string; foodNutrients?: Nutrient[] };

function pick(nutrients: Nutrient[], ids: number[], numbers: string[], unit?: string): number | null {
  for (const n of nutrients) {
    const idMatch = (n.nutrientId && ids.includes(n.nutrientId)) || (n.nutrientNumber && numbers.includes(n.nutrientNumber));
    const unitOk = !unit || (n.unitName ?? '').toUpperCase() === unit;
    if (idMatch && unitOk && typeof n.value === 'number') return n.value;
  }
  return null;
}

function extract(food: Food): FoodMatch | null {
  const n = food.foodNutrients ?? [];
  const protein = pick(n, [1003], ['203']);
  if (protein == null) return null;
  const carbs = pick(n, [1005], ['205']);
  const fat = pick(n, [1004], ['204']);
  let calories = pick(n, [1008, 2047, 2048], ['208', '957', '958'], 'KCAL');
  if (calories == null) calories = 4 * protein + 4 * (carbs ?? 0) + 9 * (fat ?? 0);
  const brand = food.brandName || food.brandOwner;
  const description = brand ? `${food.description} (${brand})` : food.description;
  return { fdc_id: food.fdcId, description, per100: { protein, calories, carbs, fat } };
}

async function search(query: string, dataType: string): Promise<FoodMatch[]> {
  const apiKey = process.env.USDA_API_KEY || 'DEMO_KEY';
  const url = `${API}?api_key=${apiKey}&pageSize=12&query=${encodeURIComponent(query)}&dataType=${encodeURIComponent(dataType)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`USDA ${res.status}`);
  const body = (await res.json()) as { foods?: Food[] };
  return (body.foods ?? []).map(extract).filter((m): m is FoodMatch => m !== null);
}

/** Top USDA candidates for a phrase, cached. null means the lookup failed (not cached, retried next time). */
export async function candidates(query: string, branded = false): Promise<FoodMatch[] | null> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const key = `${branded ? 'b:' : ''}${q}`;
  const sql = db();
  const cached = await sql<{ candidates: FoodMatch[] }[]>`select candidates from food_lookup where query = ${key}`;
  if (cached.length) return cached[0].candidates;

  let found: FoodMatch[];
  try {
    found = await search(q, branded ? 'Branded' : GENERIC);
    if (!found.length) found = await search(q, branded ? GENERIC : 'Branded');
  } catch (err) {
    console.warn('USDA lookup failed:', q, err);
    return null;
  }
  await sql`
    insert into food_lookup (query, candidates) values (${key}, ${sql.json(found as never)})
    on conflict (query) do update set candidates = excluded.candidates, fetched_at = now()`;
  return found;
}

export type Estimate = { protein: number; calories: number };

/**
 * Best candidate for `grams` of this food whose numbers are close to the estimate.
 * Calories must be within 35% (or 50 kcal) and protein within 40% (or 4 g).
 */
export function bestMatch(cands: FoodMatch[], grams: number, est: Estimate | null): FoodMatch | null {
  if (!cands.length) return null;
  if (!est || !(est.calories > 0)) return cands[0];
  let best: FoodMatch | null = null;
  let bestScore = Infinity;
  cands.forEach((m, rank) => {
    const kcal = (m.per100.calories * grams) / 100;
    const prot = (m.per100.protein * grams) / 100;
    const kErr = Math.abs(kcal - est.calories);
    const pErr = Math.abs(prot - est.protein);
    if (kErr > Math.max(0.35 * est.calories, 50)) return;
    if (pErr > Math.max(0.4 * est.protein, 4)) return;
    const score = kErr / Math.max(est.calories, 60) + (0.5 * pErr) / Math.max(est.protein, 5) + rank * 0.03;
    if (score < bestScore) {
      best = m;
      bestScore = score;
    }
  });
  return best;
}

export async function resolveFood(query: string, grams: number, est: Estimate | null, branded = false): Promise<FoodMatch | null> {
  const cands = await candidates(query, branded);
  if (!cands) return null;
  return bestMatch(cands, grams, est);
}
