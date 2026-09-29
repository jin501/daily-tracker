/**
 * USDA FoodData Central lookup, per-100g nutrients, cached in Postgres.
 * Tries whole-food datasets first (Foundation, SR Legacy), then survey foods, then branded.
 */
import { db } from './db';

export type Per100 = { protein: number; calories: number; carbs: number | null; fat: number | null };
export type FoodMatch = { fdc_id: number; description: string; per100: Per100 };

const API = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const DATASETS = ['Foundation,SR Legacy', 'Survey (FNDDS)', 'Branded'];

type Nutrient = { nutrientId?: number; nutrientNumber?: string; value?: number; unitName?: string };
type Food = { fdcId: number; description: string; brandOwner?: string; foodNutrients?: Nutrient[] };

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
  const description = food.brandOwner ? `${food.description} (${food.brandOwner})` : food.description;
  return { fdc_id: food.fdcId, description, per100: { protein, calories, carbs, fat } };
}

export async function lookupFood(query: string): Promise<FoodMatch | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  const sql = db();

  const cached = await sql<{ fdc_id: number | null; description: string | null; per100: Per100 | null }[]>`
    select fdc_id, description, per100 from food_cache where query = ${key}`;
  if (cached.length) {
    const c = cached[0];
    return c.fdc_id && c.per100 && c.description ? { fdc_id: c.fdc_id, description: c.description, per100: c.per100 } : null;
  }

  const apiKey = process.env.USDA_API_KEY || 'DEMO_KEY';
  let match: FoodMatch | null = null;
  try {
    for (const dataType of DATASETS) {
      const url = `${API}?api_key=${apiKey}&pageSize=5&query=${encodeURIComponent(key)}&dataType=${encodeURIComponent(dataType)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!res.ok) throw new Error(`USDA ${res.status}`);
      const body = (await res.json()) as { foods?: Food[] };
      for (const f of body.foods ?? []) {
        match = extract(f);
        if (match) break;
      }
      if (match) break;
    }
  } catch (err) {
    console.warn('USDA lookup failed, falling back to estimate:', query, err);
    return null; // don't cache failures, try again next time
  }

  await sql`
    insert into food_cache (query, fdc_id, description, per100)
    values (${key}, ${match?.fdc_id ?? null}, ${match?.description ?? null}, ${match ? sql.json(match.per100) : null})
    on conflict (query) do update set fdc_id = excluded.fdc_id, description = excluded.description,
      per100 = excluded.per100, fetched_at = now()`;
  return match;
}
