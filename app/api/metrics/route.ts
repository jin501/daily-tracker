import { NextResponse } from 'next/server';
import { getMetric, series, type Bucket } from '@/lib/metrics';
import { addDays, isDate, todayLocal } from '@/lib/dates';

/**
 * Generic read API for any registered metric:
 *   /api/metrics?ids=protein_g,ab_sets,habit:vitamins&from=2026-09-01&to=2026-09-30&bucket=week
 * Any new screen or widget can be built on this without new backend code.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const to = isDate(p.get('to')) ? p.get('to')! : todayLocal();
  const from = isDate(p.get('from')) ? p.get('from')! : addDays(to, -29);
  const bucket = (['day', 'week', 'month'].includes(p.get('bucket') ?? '') ? p.get('bucket') : 'day') as Bucket;
  const ids = (p.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !getMetric(id));
  if (!ids.length || unknown.length) {
    return NextResponse.json({ error: unknown.length ? `Unknown metrics: ${unknown.join(', ')}` : 'Pass ?ids=' }, { status: 400 });
  }
  const data = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await series(id, from, to, bucket)] as const)));
  return NextResponse.json({ from, to, bucket, data });
}
