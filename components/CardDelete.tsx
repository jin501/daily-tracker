'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Target = { date: string; movement: string } | { workoutId: number; letter: string } | { activityId: number };

export default function CardDelete({ target, label }: { target: Target; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  async function remove() {
    if (!confirm(`Delete ${label}?`)) return;
    const body = 'activityId' in target ? { kind: 'activity', id: target.activityId } : { kind: 'card', ...target };
    await fetch('/api/items', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    start(() => router.refresh());
  }
  return (
    <button type="button" className="x" onClick={remove} disabled={pending} aria-label={`Delete ${label}`}>×</button>
  );
}
