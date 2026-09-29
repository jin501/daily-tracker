import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const TABLES = { meal: 'meals', workout: 'workouts', activity: 'activities', food: 'food_items' } as const;

/** Delete one logged thing (a whole meal, one food, a workout, an activity). */
export async function DELETE(req: Request) {
  const { kind, id } = (await req.json().catch(() => ({}))) as { kind?: keyof typeof TABLES; id?: number };
  if (!kind || !(kind in TABLES) || !Number.isInteger(id)) {
    return NextResponse.json({ error: 'Need a kind and id' }, { status: 400 });
  }
  const sql = db();
  if (kind === 'food') {
    // remove the food, and the meal too if it's now empty
    const [row] = await sql<{ meal_id: number }[]>`delete from food_items where id = ${id!} returning meal_id`;
    if (row) await sql`delete from meals m where m.id = ${row.meal_id} and not exists (select 1 from food_items where meal_id = m.id)`;
  } else {
    await sql`delete from ${sql(TABLES[kind])} where id = ${id!}`;
  }
  return NextResponse.json({ ok: true });
}
