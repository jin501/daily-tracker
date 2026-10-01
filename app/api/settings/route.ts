import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { setUnit } from '@/lib/settings';

const Body = z.object({
  goals: z.array(z.object({ key: z.string(), target: z.number().positive(), success_min: z.number().positive().nullable() })).optional(),
  addHabit: z.object({ name: z.string().trim().min(1).max(40), emoji: z.string().trim().max(16).nullable() }).optional(),
  editHabit: z.object({ key: z.string(), name: z.string().trim().min(1).max(40), emoji: z.string().trim().max(16).nullable() }).optional(),
  archiveHabit: z.string().optional(),
  unit: z.enum(['lb', 'kg']).optional(),
});

/** Strip colors for new habits, from the same pastel family as everything else. */
const HABIT_COLORS = ['#9C83E0', '#C99A6A', '#4FB08A', '#7EC0EC', '#F5A887', '#EBCB5C', '#F2A9C6'];

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the numbers and try again.' }, { status: 400 });
  const sql = db();
  const { goals, addHabit, editHabit, archiveHabit, unit } = parsed.data;
  for (const g of goals ?? []) {
    if (g.success_min != null && g.key === 'calories_daily' && g.success_min > g.target) {
      return NextResponse.json({ error: 'The calorie low end has to be below the high end.' }, { status: 400 });
    }
    await sql`update goals set target = ${g.target}, success_min = ${g.success_min} where key = ${g.key}`;
  }
  if (addHabit) {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from habits where active`;
    const color = HABIT_COLORS[n % HABIT_COLORS.length];
    const key = addHabit.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `habit_${Date.now()}`;
    await sql`
      insert into habits (key, name, emoji, color, sort) values (${key}, ${addHabit.name}, ${addHabit.emoji || null}, ${color}, (select coalesce(max(sort), 0) + 1 from habits))
      on conflict (key) do update set active = true, name = excluded.name, emoji = excluded.emoji`;
  }
  if (editHabit) await sql`update habits set name = ${editHabit.name}, emoji = ${editHabit.emoji || null} where key = ${editHabit.key}`;
  if (archiveHabit) await sql`update habits set active = false where key = ${archiveHabit}`;
  if (unit) await setUnit(unit);
  return NextResponse.json({ ok: true });
}
