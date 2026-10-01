'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const OPTIONS: [string, string][] = [
  ['upper', 'Upper day'],
  ['lower', 'Lower day'],
  ['full_body', 'Full body'],
  ['abs', 'Abs day'],
  ['cardio', 'Cardio day'],
];

/** The day-type pill. Tap to change it; "Auto" goes back to working it out from your sets. */
export default function DayTypeSelect({ date, value, manual, auto }: { date: string; value: string; manual: boolean; auto: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [, start] = useTransition();

  async function change(next: string) {
    setV(next === 'auto' ? auto ?? value : next);
    await fetch('/api/day-type', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ date, dayType: next }) });
    start(() => router.refresh());
  }

  return (
    <select className="tag tag-purple" aria-label="Kind of day" value={v} onChange={(e) => change(e.target.value)}>
      {OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      {manual && <option value="auto">Auto</option>}
    </select>
  );
}
