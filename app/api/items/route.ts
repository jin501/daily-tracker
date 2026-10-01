import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isDate } from '@/lib/dates';

const TABLES = { meal: 'meals', workout: 'workouts', activity: 'activities', food: 'food_items' } as const;

/**
 * Delete one logged thing: a meal, a food, a workout, an activity, or a training card
 * (all of a movement's sets that day, or one superset).
 */
export async function DELETE(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { kind?: string; id?: number; date?: string; movement?: string; workoutId?: number; letter?: string };
  const sql = db();

  if (b.kind === 'card') {
    if (b.movement && isDate(b.date)) {
      await sql`
        delete from workout_sets s using workouts w, exercise_info ei
        where s.workout_id = w.id and ei.exercise_id = s.exercise_id
          and w.local_date = ${b.date} and lower(ei.movement) = lower(${b.movement}) and s.superset is null`;
    } else if (Number.isInteger(b.workoutId) && b.letter) {
      await sql`delete from workout_sets where workout_id = ${b.workoutId!} and superset = ${b.letter}`;
    } else {
      return NextResponse.json({ error: 'Need a movement and date, or a superset' }, { status: 400 });
    }
    await sql`delete from workouts w where not exists (select 1 from workout_sets s where s.workout_id = w.id)`;
    return NextResponse.json({ ok: true });
  }

  const kind = b.kind as keyof typeof TABLES | undefined;
  if (!kind || !(kind in TABLES) || !Number.isInteger(b.id)) {
    return NextResponse.json({ error: 'Need a kind and id' }, { status: 400 });
  }
  if (kind === 'food') {
    // remove the food, and the meal too if it's now empty
    const [row] = await sql<{ meal_id: number }[]>`delete from food_items where id = ${b.id!} returning meal_id`;
    if (row) await sql`delete from meals m where m.id = ${row.meal_id} and not exists (select 1 from food_items where meal_id = m.id)`;
  } else {
    await sql`delete from ${sql(TABLES[kind])} where id = ${b.id!}`;
  }
  return NextResponse.json({ ok: true });
}

const Patch = z.object({ id: z.number().int(), calories: z.number().min(0).max(10000), protein_g: z.number().min(0).max(1000) });

/** Fix a food's numbers by hand. */
export async function PATCH(req: Request) {
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Check the numbers' }, { status: 400 });
  await db()`update food_items set calories = ${p.data.calories}, protein_g = ${p.data.protein_g}, source = 'manual' where id = ${p.data.id}`;
  return NextResponse.json({ ok: true });
}
