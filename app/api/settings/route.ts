import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const Body = z.object({
  goals: z.array(z.object({ key: z.string(), target: z.number().positive(), success_min: z.number().positive().nullable() })).optional(),
  addHabit: z.string().trim().min(1).max(40).optional(),
  archiveHabit: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the numbers and try again.' }, { status: 400 });
  const sql = db();
  const { goals, addHabit, archiveHabit } = parsed.data;
  for (const g of goals ?? []) {
    await sql`update goals set target = ${g.target}, success_min = ${g.success_min} where key = ${g.key}`;
  }
  if (addHabit) {
    const key = addHabit.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    await sql`
      insert into habits (key, name, sort) values (${key}, ${addHabit}, (select coalesce(max(sort), 0) + 1 from habits))
      on conflict (key) do update set active = true, name = excluded.name`;
  }
  if (archiveHabit) await sql`update habits set active = false where key = ${archiveHabit}`;
  return NextResponse.json({ ok: true });
}
