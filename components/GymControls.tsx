'use client';
import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Dumbbell } from './icons';

export type GymSessionView = {
  id: number; startedAt: string; ended: boolean; auto: boolean;
  startHHMM: string; endHHMM: string | null; startLabel: string; endLabel: string | null; minutes: number;
};

const dur = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

async function gym(body: object) {
  const res = await fetch('/api/gym', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Something went wrong');
}

/** Gym check-in: live banner while you're there, time spent after, sign-in button otherwise. `children` are the other day pills. */
export default function GymControls({ isToday, sessions, children }: { isToday: boolean; sessions: GymSessionView[]; children?: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const active = sessions.find((s) => !s.ended) ?? null;
  const done = sessions.filter((s) => s.ended);
  const doneMin = done.reduce((a, s) => a + s.minutes, 0);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  async function run(body: object) {
    setBusy(true);
    setError(null);
    try {
      await gym(body);
      start(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const hasPills = !!children && (Array.isArray(children) ? children.some(Boolean) : true);
  const showRow = hasPills || done.length > 0 || (isToday && !active);

  return (
    <>
      {active && (
        <section className="gymlive" aria-label="Gym session in progress">
          <div>
            <div className="small" style={{ color: '#CBC2D6', fontWeight: 600 }}><span className="pulse" />At the gym</div>
            <div className="t" style={{ marginTop: 6 }} aria-live="off">{clock(now - new Date(active.startedAt).getTime())}</div>
            <div className="s">Since {active.startLabel}{done.length ? ` · ${dur(doneMin)} earlier today` : ''}</div>
          </div>
          <button type="button" className="btn btn-light" onClick={() => run({ action: 'end' })} disabled={busy || pending}>
            {busy ? 'Ending…' : 'End session'}
          </button>
        </section>
      )}

      {showRow && (
        <div className="pills">
          {isToday && !active && (
            <button type="button" className="tag tag-ghost" onClick={() => run({ action: 'start' })} disabled={busy || pending}>
              <Dumbbell size={16} /> {busy ? 'Signing in…' : done.length ? 'Back at the gym' : 'Sign in to gym'}
            </button>
          )}
          {done.length > 0 && (
            <button type="button" className="tag" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              ⏱ {dur(doneMin)} at the gym
            </button>
          )}
          {children}
        </div>
      )}

      {error && <div className="error" role="alert">{error}</div>}

      {editing && done.length > 0 && (
        <section className="gymedit" aria-label="Edit gym times">
          {done.map((s) => <SessionRow key={s.id} s={s} onSave={(start, end) => run({ action: 'edit', id: s.id, start, end })} onDelete={() => confirm('Delete this gym session?') && run({ action: 'delete', id: s.id })} busy={busy || pending} />)}
        </section>
      )}
    </>
  );
}

function SessionRow({ s, onSave, onDelete, busy }: { s: GymSessionView; onSave: (a: string, b: string) => void; onDelete: () => void; busy: boolean }) {
  const [a, setA] = useState(s.startHHMM);
  const [b, setB] = useState(s.endHHMM ?? '');
  const changed = a !== s.startHHMM || b !== (s.endHHMM ?? '');
  return (
    <div className="row" style={{ gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="time" aria-label="Start" value={a} onChange={(e) => setA(e.target.value)} />
        <span className="muted">–</span>
        <input type="time" aria-label="End" value={b} onChange={(e) => setB(e.target.value)} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {changed ? (
          <button type="button" className="btn btn-dark" style={{ minHeight: 36 }} disabled={busy || !a || !b} onClick={() => onSave(a, b)}>Save</button>
        ) : (
          <span className="small muted">{dur(s.minutes)}</span>
        )}
        <button type="button" className="x" onClick={onDelete} aria-label="Delete session">×</button>
      </div>
      {s.auto && <div className="small muted" style={{ width: '100%' }}>Ended automatically after 3 hours. Fix the end time if you left earlier.</div>}
    </div>
  );
}
