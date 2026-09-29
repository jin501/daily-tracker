import { NextResponse } from 'next/server';
import { parseMessage } from '@/lib/parse';
import { isDate } from '@/lib/dates';

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; date?: string };
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: 'Type what you ate or did first.' }, { status: 400 });
  try {
    const items = await parseMessage(text, isDate(body.date) ? body.date : undefined);
    if (!items.length) return NextResponse.json({ error: "Couldn't find a meal, workout, activity or habit in that. Try adding a bit more detail." }, { status: 422 });
    return NextResponse.json({ items });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Parsing failed' }, { status: 500 });
  }
}
