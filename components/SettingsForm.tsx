'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Goal } from '@/lib/metrics';
import type { WUnit } from '@/lib/units';

type Habit = { key: string; name: string; emoji: string | null };
const n = (v: number | null | undefined) => (v == null ? '' : String(v));

export default function SettingsForm({ goals, habits, unit }: { goals: Record<string, Goal>; habits: Habit[]; unit: WUnit }) {
  const router = useRouter();
  const [v, setV] = useState({
    protein: n(goals.protein_daily.target),
    proteinMin: n(goals.protein_daily.success_min),
    kLow: n(goals.calories_daily.success_min),
    kHigh: n(goals.calories_daily.target),
    workouts: n(goals.workouts_weekly.target),
    abs: n(goals.abs_sets_weekly.target),
  });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();

  async function post(body: object, done: string) {
    setMsg(null);
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setMsg(res.ok ? { text: done, ok: true } : { text: json.error ?? 'Saving failed', ok: false });
    start(() => router.refresh());
    return res.ok;
  }

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const numOrNull = (s: string) => (s === '' ? null : Number(s));
  const valid = [v.protein, v.kLow, v.kHigh, v.workouts, v.abs].every((x) => Number(x) > 0) && Number(v.kLow) <= Number(v.kHigh);

  function saveGoals() {
    post({
      goals: [
        { key: 'protein_daily', target: Number(v.protein), success_min: numOrNull(v.proteinMin) },
        { key: 'calories_daily', target: Number(v.kHigh), success_min: Number(v.kLow) },
        { key: 'workouts_weekly', target: Number(v.workouts), success_min: null },
        { key: 'abs_sets_weekly', target: Number(v.abs), success_min: null },
      ],
    }, 'Goals saved.');
  }

  return (
    <>
      <section className="card">
        <h2 className="h2" style={{ paddingBottom: 8 }}>Protein</h2>
        <label className="field"><span>Daily goal (g)</span><input type="number" inputMode="numeric" min={1} value={v.protein} onChange={set('protein')} /></label>
        <label className="field"><span>Still counts at (g)</span><input type="number" inputMode="numeric" min={1} value={v.proteinMin} onChange={set('proteinMin')} /></label>

        <h2 className="h2" style={{ padding: '18px 0 8px' }}>Calories</h2>
        <label className="field"><span>Low end (kcal)</span><input type="number" inputMode="numeric" min={1} value={v.kLow} onChange={set('kLow')} /></label>
        <label className="field"><span>High end (kcal)</span><input type="number" inputMode="numeric" min={1} value={v.kHigh} onChange={set('kHigh')} /></label>

        <h2 className="h2" style={{ padding: '18px 0 8px' }}>Weekly</h2>
        <label className="field"><span>Workout days</span><input type="number" inputMode="numeric" min={1} value={v.workouts} onChange={set('workouts')} /></label>
        <label className="field"><span>Ab sets</span><input type="number" inputMode="numeric" min={1} value={v.abs} onChange={set('abs')} /></label>

        <div className="actions" style={{ paddingTop: 12 }}>
          <button type="button" className="btn btn-dark" disabled={pending || !valid} onClick={saveGoals}>Save goals</button>
        </div>
      </section>

      <section className="card">
        <h2 className="h2" style={{ paddingBottom: 8 }}>Weights</h2>
        <div className="field">
          <span>Show weights in</span>
          <div className="seg" role="group" aria-label="Weight unit">
            {(['lb', 'kg'] as const).map((u) => (
              <button key={u} type="button" aria-pressed={unit === u} onClick={() => unit !== u && post({ unit: u }, `Weights now in ${u}.`)}>{u}</button>
            ))}
          </div>
        </div>
        <p className="small muted" style={{ margin: '4px 0 0' }}>Numbers without a unit in your logs are read as {unit}.</p>
      </section>

      <section className="card">
        <h2 className="h2" style={{ paddingBottom: 8 }}>Habits</h2>
        {habits.map((h) => <HabitRow key={h.key} h={h} pending={pending} post={post} />)}
        <NewHabit pending={pending} post={post} />
        <p className="small muted" style={{ margin: '10px 0 0' }}>Check them off on Today, or just say it in the log box, like &quot;took vitamins&quot; or &quot;walked 30 min&quot;.</p>
      </section>

      {msg && <div className="small" role="status" style={{ padding: '0 4px', color: msg.ok ? 'var(--muted)' : 'var(--peach-ink)' }}>{msg.text}</div>}

      <button type="button" className="btn btn-soft" style={{ alignSelf: 'flex-start' }}
        onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }}>
        Log out
      </button>
    </>
  );
}

type Post = (body: object, done: string) => Promise<boolean>;

function HabitRow({ h, pending, post }: { h: Habit; pending: boolean; post: Post }) {
  const [emoji, setEmoji] = useState(h.emoji ?? '');
  const [name, setName] = useState(h.name);
  const changed = emoji !== (h.emoji ?? '') || name.trim() !== h.name;
  return (
    <div className="field" style={{ gap: 8 }}>
      <input aria-label={`${h.name} emoji`} value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ width: 48, textAlign: 'center', fontSize: 18, padding: '6px 4px' }} />
      <input aria-label={`${h.name} name`} value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 0, width: 'auto', textAlign: 'left' }} />
      {changed ? (
        <button type="button" className="btn btn-dark" style={{ minHeight: 38 }} disabled={pending || !name.trim()}
          onClick={() => post({ editHabit: { key: h.key, name: name.trim(), emoji: emoji.trim() || null } }, `${name.trim()} saved.`)}>
          Save
        </button>
      ) : (
        <button type="button" className="btn btn-soft" style={{ minHeight: 38 }} disabled={pending}
          onClick={() => confirm(`Stop tracking ${h.name}? Past days are kept.`) && post({ archiveHabit: h.key }, `${h.name} removed.`)}>
          Remove
        </button>
      )}
    </div>
  );
}

function NewHabit({ pending, post }: { pending: boolean; post: Post }) {
  const [emoji, setEmoji] = useState('');
  const [name, setName] = useState('');
  return (
    <div className="field" style={{ gap: 8 }}>
      <input aria-label="New habit emoji" placeholder="✨" value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ width: 48, textAlign: 'center', fontSize: 18, padding: '6px 4px' }} />
      <input aria-label="New habit" placeholder="New habit, e.g. Stretched" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 0, width: 'auto', textAlign: 'left' }} />
      <button type="button" className="btn btn-dark" style={{ minHeight: 38 }} disabled={!name.trim() || pending}
        onClick={async () => { if (await post({ addHabit: { name: name.trim(), emoji: emoji.trim() || null } }, `${name.trim()} added.`)) { setName(''); setEmoji(''); } }}>
        Add
      </button>
    </div>
  );
}
