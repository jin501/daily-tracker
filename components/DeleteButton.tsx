'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteButton({ kind, id, label }: { kind: 'meal' | 'food' | 'workout' | 'activity'; id: number; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function remove() {
    if (!confirm(`Delete ${label}?`)) return;
    await fetch('/api/items', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, id }),
    });
    start(() => router.refresh());
  }

  return (
    <button type="button" className="x" onClick={remove} disabled={pending} aria-label={`Delete ${label}`}>
      ×
    </button>
  );
}
