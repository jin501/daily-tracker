import { NextResponse } from 'next/server';
import { SaveRequest } from '@/lib/draft';
import { saveDrafts } from '@/lib/save';
import { todayLocal } from '@/lib/dates';

export async function POST(req: Request) {
  const parsed = SaveRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are invalid.', issues: parsed.error.issues }, { status: 400 });
  }
  const today = todayLocal();
  if (parsed.data.items.some((i) => i.date > today)) {
    return NextResponse.json({ error: "Dates can't be in the future." }, { status: 400 });
  }
  const id = await saveDrafts(parsed.data.text, parsed.data.items);
  return NextResponse.json({ ok: true, id });
}
