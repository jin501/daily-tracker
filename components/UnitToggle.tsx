'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WUnit } from '@/lib/units';

export default function UnitToggle({ unit }: { unit: WUnit }) {
  const router = useRouter();
  const [u, setU] = useState(unit);
  const [, start] = useTransition();
  async function pick(next: WUnit) {
    if (next === u) return;
    setU(next);
    await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unit: next }) });
    start(() => router.refresh());
  }
  return (
    <div className="seg" role="group" aria-label="Weight unit" style={{ background: 'var(--card)' }}>
      <button type="button" aria-pressed={u === 'lb'} onClick={() => pick('lb')}>lb</button>
      <button type="button" aria-pressed={u === 'kg'} onClick={() => pick('kg')}>kg</button>
    </div>
  );
}
