import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseMessage } from '@/lib/parse';
import { qty } from '@/lib/format';

export const maxDuration = 60;

/** Re-run a saved meal through the current parser and USDA check, keeping hand-edited items. */
export async function POST(req: Request) {
  const { mealId } = (await req.json().catch(() => ({}))) as { mealId?: number };
  if (!Number.isInteger(mealId)) return NextResponse.json({ error: 'Need a meal' }, { status: 400 });
  const sql = db();
  const [meal] = await sql<{ local_date: string; meal_type: string }[]>`select local_date, meal_type from meals where id = ${mealId!}`;
  if (!meal) return NextResponse.json({ error: 'Meal not found' }, { status: 404 });
  const items = await sql<{ id: number; name: string; quantity: number | null; unit: string | null; source: string }[]>`
    select id, name, quantity, unit, source from food_items where meal_id = ${mealId!} order by id`;
  const redo = items.filter((i) => i.source !== 'manual');
  if (!redo.length) return NextResponse.json({ ok: true, changed: 0 });

  const text = `${meal.meal_type}: ${redo.map((i) => [i.quantity != null ? qty(i.quantity) : null, i.unit, i.name].filter(Boolean).join(' ')).join(', ')}`;
  try {
    const drafts = await parseMessage(text, meal.local_date);
    const fresh = drafts.find((d) => d.type === 'meal');
    if (!fresh || fresh.type !== 'meal') throw new Error("Couldn't re-read that meal");
    await sql.begin(async (tx) => {
      await tx`delete from food_items where id in ${tx(redo.map((i) => i.id))}`;
      for (const f of fresh.items) {
        await tx`
          insert into food_items (meal_id, name, quantity, unit, grams, protein_g, calories, carbs_g, fat_g, source, fdc_id, fdc_description)
          values (${mealId!}, ${f.name}, ${f.quantity}, ${f.unit}, ${f.grams}, ${f.protein_g}, ${f.calories},
                  ${f.carbs_g}, ${f.fat_g}, ${f.source}, ${f.fdc_id}, ${f.fdc_description})`;
      }
    });
    return NextResponse.json({ ok: true, changed: fresh.items.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Recheck failed' }, { status: 500 });
  }
}
