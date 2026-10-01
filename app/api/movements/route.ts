import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { CATEGORIES, findOrCreateMovement } from '@/lib/movements';

const Body = z.union([
  // rename and/or recategorize a movement; renaming onto an existing movement merges them
  z.object({ id: z.number().int(), name: z.string().trim().min(1).max(60).optional(), category: z.enum(CATEGORIES).optional() }),
  // move a variation under another (or a new) movement
  z.object({ exerciseId: z.number().int(), movementName: z.string().trim().min(1).max(60) }),
]);

export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Check the name and try again.' }, { status: 400 });
  const b = p.data;
  const sql = db();

  if ('exerciseId' in b) {
    const [ex] = await sql<{ movement_id: number | null }[]>`select movement_id from exercises where id = ${b.exerciseId}`;
    if (!ex) return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
    const [cur] = await sql<{ category: string }[]>`select category from movements where id = ${ex.movement_id}`;
    const target = await findOrCreateMovement(sql, b.movementName, (cur?.category as never) ?? 'upper');
    await sql`update exercises set movement_id = ${target} where id = ${b.exerciseId}`;
    await sql`delete from movements m where not exists (select 1 from exercises e where e.movement_id = m.id)`;
    return NextResponse.json({ ok: true, movementId: target });
  }

  let id = b.id;
  await sql.begin(async (tx) => {
    if (b.name) {
      const [other] = await tx<{ id: number }[]>`select id from movements where lower(name) = lower(${b.name}) and id <> ${b.id}`;
      if (other) {
        await tx`update exercises set movement_id = ${other.id} where movement_id = ${b.id}`;
        await tx`delete from movements where id = ${b.id}`;
        id = other.id;
      } else {
        await tx`update movements set name = ${b.name} where id = ${b.id}`;
      }
    }
    if (b.category) await tx`update movements set category = ${b.category} where id = ${id}`;
  });
  return NextResponse.json({ ok: true, movementId: id });
}
