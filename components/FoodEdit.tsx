'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/** Tap a food's numbers to fix them by hand. */
export default function FoodEdit({ id, calories, protein }: { id: number; calories: number; protein: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [k, setK] = useState(String(Math.round(calories)));
  const [p, setP] = useState(String(protein));
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);

  async function save() {
    const res = await fetch('/api/items', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, calories: Number(k), protein_g: Number(p) }) });
    setErr(!res.ok);
    if (res.ok) {
      setOpen(false);
      start(() => router.refresh());
    }
  }

  if (!open) {
    return (
      <button type="button" className="linkbtn" onClick={() => setOpen(true)} aria-label="Edit calories and protein" style={{ textAlign: 'right' }}>
        <strong style={{ color: 'var(--ink)', fontSize: 15 }}>{Math.round(calories).toLocaleString('en-US')}</strong>
        <span className="muted" style={{ fontWeight: 500 }}> kcal</span>
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>kcal<input type="number" inputMode="numeric" min={0} value={k} onChange={(e) => setK(e.target.value)} /></label>
      <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>prot<input type="number" inputMode="decimal" min={0} value={p} onChange={(e) => setP(e.target.value)} style={{ width: 56 }} /></label>
      <button type="button" className="btn btn-dark" style={{ minHeight: 34, padding: '0 12px' }} disabled={pending || k === '' || p === ''} onClick={save}>Save</button>
      {err && <span className="small" style={{ color: 'var(--peach-ink)' }}>Check the numbers</span>}
    </div>
  );
}

export function RecheckButton({ mealId }: { mealId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/recheck', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mealId }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(body.error ?? 'Recheck failed');
    setMsg(body.changed ? 'Rechecked' : 'Nothing to recheck (all edited by hand)');
    start(() => router.refresh());
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {msg && <span className="small muted">{msg}</span>}
      <button type="button" className="linkbtn" onClick={run} disabled={busy}>{busy ? 'Rechecking…' : 'Recheck'}</button>
    </span>
  );
}
