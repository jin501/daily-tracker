import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isDate } from '@/lib/dates';
import { isDayType } from '@/lib/daytype';

/** Set a day's type by hand, or pass "auto" to go back to working it out from the sets. */
export async function POST(req: Request) {
  const { date, dayType } = (await req.json().catch(() => ({}))) as { date?: string; dayType?: string };
  if (!isDate(date)) return NextResponse.json({ error: 'Need a date' }, { status: 400 });
  const sql = db();
  if (dayType === 'auto') await sql`delete from day_types where local_date = ${date}`;
  else if (isDayType(dayType))
    await sql`insert into day_types (local_date, day_type) values (${date}, ${dayType})
      on conflict (local_date) do update set day_type = excluded.day_type`;
  else return NextResponse.json({ error: 'Unknown day type' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
