'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Goal } from '@/lib/metrics';

export default function SettingsForm({ goals, habits }: { goals: Goal[]; habits: { key: string; name: string }[] }) {
  const router = useRouter();
  const [vals, setVals] = useState(goals.map((g) => ({ key: g.key, label: g.label, target: String(g.target), success_min: g.success_min == null ? '' : String(g.success_min) })));
  const [newHabit, setNewHabit] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function post(body: object, done: string) {
    setMsg(null);
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setMsg(res.ok ? done : json.error ?? 'Saving failed');
    start(() => router.refresh());
  }

  return (
    <>
      <section className="card">
        <h2 className="h2" style={{ paddingBottom: 8 }}>Goals</h2>
        {vals.map((g, i) => (
          <div key={g.key}>
            <label className="field">
              <span>{g.label}</span>
              <input type="number" inputMode="numeric" min={1} value={g.target}
                onChange={(e) => setVals(vals.map((v, j) => (j === i ? { ...v, target: e.target.value } : v)))} />
            </label>
            {g.key === 'protein_daily' && (
              <label className="field">
                <span>Still counts at</span>
                <input type="number" inputMode="numeric" min={1} value={g.success_min}
                  onChange={(e) => setVals(vals.map((v, j) => (j === i ? { ...v, success_min: e.target.value } : v)))} />
              </label>
            )}
          </div>
        ))}
        <div className="actions" style={{ paddingTop: 10 }}>
          <button type="button" className="btn btn-dark" disabled={pending}
            onClick={() => post({ goals: vals.map((v) => ({ key: v.key, target: Number(v.target), success_min: v.success_min === '' ? null : Number(v.success_min) })) }, 'Goals saved.')}>
            Save goals
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="h2" style={{ paddingBottom: 8 }}>Habits</h2>
        {habits.map((h) => (
          <div className="field" key={h.key}>
            <span>{h.name}</span>
            <button type="button" className="btn btn-soft" style={{ minHeight: 36 }} disabled={pending}
              onClick={() => confirm(`Stop tracking ${h.name}? Past days are kept.`) && post({ archiveHabit: h.key }, `${h.name} removed.`)}>
              Remove
            </button>
          </div>
        ))}
        <div className="field">
          <label htmlFor="newhabit" className="sr-only">New habit</label>
          <input id="newhabit" className="textfield" style={{ width: '100%', textAlign: 'left' }} placeholder="New habit, e.g. Creatine" value={newHabit} onChange={(e) => setNewHabit(e.target.value)} />
          <button type="button" className="btn btn-dark" disabled={!newHabit.trim() || pending}
            onClick={() => { post({ addHabit: newHabit.trim() }, `${newHabit.trim()} added.`); setNewHabit(''); }}>
            Add
          </button>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>You can also just say it in the log box, like "took creatine", and the habit gets created.</p>
      </section>

      {msg && <div className="small muted" role="status" style={{ padding: '0 4px' }}>{msg}</div>}

      <button type="button" className="btn btn-soft" style={{ alignSelf: 'flex-start' }}
        onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }}>
        Log out
      </button>
    </>
  );
}
