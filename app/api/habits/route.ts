import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isDate } from '@/lib/dates';
import { setHabit } from '@/lib/save';

export async function POST(req: Request) {
  const { key, date, done } = (await req.json().catch(() => ({}))) as { key?: string; date?: string; done?: boolean };
  if (!key || !isDate(date) || typeof done !== 'boolean') {
    return NextResponse.json({ error: 'Need key, date and done' }, { status: 400 });
  }
  await setHabit(db(), key, date, done);
  return NextResponse.json({ ok: true });
}
