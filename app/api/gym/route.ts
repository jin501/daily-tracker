import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { localTimeToDate, todayLocal } from '@/lib/dates';
import { activeSession, closeStale } from '@/lib/gym';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('end') }),
  z.object({ action: z.literal('edit'), id: z.number().int(), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  z.object({ action: z.literal('delete'), id: z.number().int() }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const b = parsed.data;
  const sql = db();
  await closeStale();

  if (b.action === 'start') {
    const open = await activeSession();
    if (!open) await sql`insert into gym_sessions (local_date) values (${todayLocal()})`;
  } else if (b.action === 'end') {
    await sql`update gym_sessions set ended_at = now() where ended_at is null`;
  } else if (b.action === 'edit') {
    const [s] = await sql<{ local_date: string }[]>`select local_date from gym_sessions where id = ${b.id}`;
    if (!s) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const start = localTimeToDate(s.local_date, b.start);
    let end = b.end ? localTimeToDate(s.local_date, b.end) : null;
    if (end && end <= start) end = new Date(end.getTime() + 86_400_000);
    if (end && end.getTime() > Date.now() + 60_000) return NextResponse.json({ error: "End time can't be in the future." }, { status: 400 });
    await sql`update gym_sessions set started_at = ${start}, ended_at = ${end}, auto_ended = false where id = ${b.id}`;
  } else {
    await sql`delete from gym_sessions where id = ${b.id}`;
  }
  return NextResponse.json({ ok: true });
}
