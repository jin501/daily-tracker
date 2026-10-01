'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Draft, FoodItem, MealDraft } from '@/lib/draft';
import type { WorkoutPlan } from '@/lib/coach';
import type { WUnit } from '@/lib/units';
import { CATEGORY_LABEL } from '@/lib/categories';
import { ArrowUp, Mic } from './icons';
import { cap, qty, setLabel } from '@/lib/format';
import SandboxMeal, { type MealSandboxData } from './SandboxMeal';
import SandboxWorkout from './SandboxWorkout';

type Props = { date: string; today: string; unit: WUnit };
type SandboxResult = MealSandboxData | { kind: 'workout'; plan: WorkoutPlan };

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void;
};
type RecognitionCtor = new () => Recognition;

const r1 = (n: number) => Math.round(n * 10) / 10;
const total = (items: FoodItem[], k: 'protein_g' | 'calories') => items.reduce((a, i) => a + (i[k] || 0), 0);
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

export default function LogBox({ date, today, unit }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'log' | 'sandbox'>('log');
  const [sandbox, setSandbox] = useState<SandboxResult | null>(null);
  const [text, setText] = useState('');
  const [sentText, setSentText] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState<'parse' | 'save' | 'sandbox' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, start] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);

  // voice input (Web Speech API; hidden where unsupported, keyboard dictation still works)
  const recRef = useRef<Recognition | null>(null);
  const [speechCtor, setSpeechCtor] = useState<RecognitionCtor | null>(null);
  const [listening, setListening] = useState(false);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    setSpeechCtor(() => w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null);
  }, []);

  function toggleMic() {
    if (listening) return recRef.current?.stop();
    if (!speechCtor) return;
    const rec = new speechCtor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText((prev) => (prev ? `${prev.trimEnd()} ` : '') + t.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  // auto-grow textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 320)}px`;
  }, [text]);

  async function send() {
    return mode === 'sandbox' ? plan() : parse();
  }

  /** Sandbox: nothing is saved. The text stays in the box so you can tweak and resend. */
  async function plan() {
    const msg = text.trim();
    if (!msg || busy) return;
    recRef.current?.stop();
    setBusy('sandbox');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/sandbox', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: msg, date }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Something went wrong');
      setSandbox(body);
      setSentText(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  function logFromSandbox(d: MealDraft) {
    setDrafts([d]);
    setSentText(`(sandbox) ${sentText}`);
    setSandbox(null);
    setText('');
    setMode('log');
  }

  function fillFromSandbox(t: string) {
    setSandbox(null);
    setMode('log');
    setText(t);
    requestAnimationFrame(() => taRef.current?.focus());
  }

  async function parse() {
    const msg = text.trim();
    if (!msg || busy) return;
    recRef.current?.stop();
    setBusy('parse');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: msg, date }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Something went wrong');
      setDrafts(body.items);
      setSentText(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!drafts?.length) return;
    setBusy('save');
    setError(null);
    try {
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: sentText, items: drafts }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Saving failed');
      const elsewhere = [...new Set(drafts.map((d) => d.date))].filter((d) => d !== date);
      setNotice(elsewhere.length ? `Saved to ${elsewhere.map(shortDate).join(', ')}.` : null);
      setDrafts(null);
      setText('');
      start(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving failed');
    } finally {
      setBusy(null);
    }
  }

  // ---- draft editing ----
  const update = (i: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds && ds.map((d, j) => (j === i ? ({ ...d, ...patch } as Draft) : d)));
  const removeDraft = (i: number) => setDrafts((ds) => (ds && ds.length > 1 ? ds.filter((_, j) => j !== i) : null));

  function updateFood(i: number, fi: number, patch: Partial<FoodItem>) {
    setDrafts((ds) =>
      ds &&
      ds.map((d, j) => {
        if (j !== i || d.type !== 'meal') return d;
        const items = d.items.map((f, k) => {
          if (k !== fi) return f;
          const next = { ...f, ...patch };
          if ('grams' in patch && f.per100 && next.grams != null) {
            const g = next.grams / 100;
            next.protein_g = r1(f.per100.protein * g);
            next.calories = Math.round(f.per100.calories * g);
            next.carbs_g = f.per100.carbs == null ? null : r1(f.per100.carbs * g);
            next.fat_g = f.per100.fat == null ? null : r1(f.per100.fat * g);
          }
          if ('protein_g' in patch || 'calories' in patch) next.source = 'manual';
          return next;
        });
        return { ...d, items };
      }),
    );
  }
  function removeFood(i: number, fi: number) {
    const d = drafts?.[i];
    if (!d || d.type !== 'meal') return;
    if (d.items.length === 1) return removeDraft(i);
    update(i, { items: d.items.filter((_, k) => k !== fi) } as Partial<Draft>);
  }
  function removeExercise(i: number, ei: number) {
    const d = drafts?.[i];
    if (!d || d.type !== 'workout') return;
    if (d.exercises.length === 1) return removeDraft(i);
    update(i, { exercises: d.exercises.filter((_, k) => k !== ei) } as Partial<Draft>);
  }

  const num = (v: string) => (v === '' ? null : Number(v));

  return (
    <>
      <div className={`logbox ${mode === 'sandbox' ? 'sb' : ''}`}>
        <label htmlFor="log" className="sr-only">{mode === 'sandbox' ? 'Plan a meal or workout' : 'Log a meal, workout, activity or habit'}</label>
        <textarea
          id="log"
          ref={taRef}
          value={text}
          rows={2}
          placeholder={
            mode === 'sandbox'
              ? 'Try "salmon and rice", or "lower day, 45 min"'
              : date === today ? 'What did you eat or do?' : `Log something for ${shortDate(date)}`
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="row">
          <div className="seg" role="group" aria-label="Mode">
            <button type="button" aria-pressed={mode === 'log'} onClick={() => setMode('log')}>Log</button>
            <button type="button" aria-pressed={mode === 'sandbox'} onClick={() => setMode('sandbox')}>Sandbox</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {speechCtor && (
              <button type="button" className={`round round-soft ${listening ? 'listening' : ''}`} onClick={toggleMic} aria-label={listening ? 'Stop dictating' : 'Dictate'} aria-pressed={listening}>
                <Mic />
              </button>
            )}
            <button type="button" className="round round-dark" onClick={send} disabled={!text.trim() || !!busy} aria-label={mode === 'sandbox' ? 'Plan it' : 'Read my log'}
              style={mode === 'sandbox' ? { background: 'var(--pink-ink)' } : undefined}>
              <ArrowUp color="#fff" />
            </button>
          </div>
        </div>
        {mode === 'sandbox' && !busy && !error && <div className="sbnote">Sandbox: plan a meal to hit your protein, or ask for a workout. Nothing gets saved.</div>}
        {busy === 'parse' && <div className="small muted" role="status">Reading that and looking up the foods…</div>}
        {busy === 'sandbox' && <div className="sbnote" role="status">Working it out…</div>}
        {error && <div className="error" role="alert">{error}</div>}
        {notice && <div className="small muted" role="status">{notice}</div>}
      </div>

      {sandbox?.kind === 'meal' && <SandboxMeal key={sentText} data={sandbox} onLog={logFromSandbox} onClear={() => setSandbox(null)} />}
      {sandbox?.kind === 'workout' && <SandboxWorkout plan={sandbox.plan} onFill={fillFromSandbox} onClear={() => setSandbox(null)} />}

      {drafts && (
        <section aria-label="Check before saving" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {drafts.map((d, i) => (
            <div className="confirm" key={i}>
              <div className="confirm-head">
                {d.type === 'meal' && (
                  <select aria-label="Meal" value={d.meal_type} onChange={(e) => update(i, { meal_type: e.target.value } as Partial<Draft>)}>
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="snack">Snack</option>
                  </select>
                )}
                {d.type === 'workout' && <strong style={{ flex: 1 }}>Workout <span className="small muted" style={{ fontWeight: 500 }}>· {unit}</span></strong>}
                {d.type === 'activity' && (
                  <input aria-label="Activity" value={d.name} onChange={(e) => update(i, { name: e.target.value } as Partial<Draft>)} style={{ flex: 1, minWidth: 0 }} />
                )}
                {d.type === 'habit' && <strong style={{ flex: 1 }}>{cap(d.habit_key.replace(/_/g, ' '))}</strong>}
                <input type="date" aria-label="Date" value={d.date} max={today} onChange={(e) => e.target.value && update(i, { date: e.target.value })} />
                <button type="button" className="x" onClick={() => removeDraft(i)} aria-label="Remove this">×</button>
              </div>

              {d.type === 'meal' && (
                <>
                  <div className="food-row small muted" style={{ borderTop: 0, paddingBottom: 0 }}>
                    <span>Food</span><span style={{ textAlign: 'right' }}>grams</span><span style={{ textAlign: 'right' }}>prot</span><span style={{ textAlign: 'right' }}>kcal</span><span />
                  </div>
                  {d.items.map((f, fi) => (
                    <div className="food-row" key={fi}>
                      <div style={{ minWidth: 0 }}>
                        <div>
                          {f.name}
                          <span className={`src src-${f.source}`}>{f.source === 'usda' ? 'USDA' : f.source === 'manual' ? 'edited' : 'est.'}</span>
                        </div>
                        <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[f.quantity != null ? `${qty(f.quantity)} ${f.unit ?? ''}`.trim() : null, f.fdc_description].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <input type="number" inputMode="decimal" min={0} aria-label={`${f.name} grams`} value={f.grams ?? ''} onChange={(e) => updateFood(i, fi, { grams: num(e.target.value) })} />
                      <input type="number" inputMode="decimal" min={0} aria-label={`${f.name} protein grams`} value={f.protein_g} onChange={(e) => updateFood(i, fi, { protein_g: num(e.target.value) ?? 0 })} />
                      <input type="number" inputMode="numeric" min={0} aria-label={`${f.name} calories`} value={f.calories} onChange={(e) => updateFood(i, fi, { calories: num(e.target.value) ?? 0 })} />
                      <button type="button" className="x" onClick={() => removeFood(i, fi)} aria-label={`Remove ${f.name}`}>×</button>
                    </div>
                  ))}
                  <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <span className="muted small">{Math.round(total(d.items, 'calories'))} kcal</span>
                    <strong>{r1(total(d.items, 'protein_g'))}g protein</strong>
                  </div>
                </>
              )}

              {d.type === 'workout' &&
                d.exercises.map((ex, ei) => (
                  <div className="ex" key={ei} style={{ alignItems: 'center' }}>
                    <span>
                      {ex.movement}
                      <span className="src" style={ex.category === 'abs' ? { background: 'var(--abs-light)', color: 'var(--blue-ink)' } : ex.category === 'cardio' ? { background: 'var(--act)', color: 'var(--act-ink)' } : { background: 'var(--purple)', color: 'var(--purple-ink)' }}>
                        {CATEGORY_LABEL[ex.category]}
                      </span>
                      {ex.name.toLowerCase() !== ex.movement.toLowerCase() && <div className="small muted">{ex.name}</div>}
                      {ex.superset && <span className="small muted">superset {ex.superset}</span>}
                    </span>
                    <span className="sets" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {ex.sets.map((s) => setLabel(s, unit, false)).join(' · ')}
                      <button type="button" className="x" onClick={() => removeExercise(i, ei)} aria-label={`Remove ${ex.name}`}>×</button>
                    </span>
                  </div>
                ))}

              {d.type === 'activity' && (
                <div className="row">
                  <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    Minutes
                    <input type="number" inputMode="numeric" min={0} value={d.duration_min ?? ''} onChange={(e) => update(i, { duration_min: num(e.target.value) } as Partial<Draft>)} />
                  </label>
                  <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    km
                    <input type="number" inputMode="decimal" min={0} value={d.distance_km ?? ''} onChange={(e) => update(i, { distance_km: num(e.target.value) } as Partial<Draft>)} />
                  </label>
                </div>
              )}

              {d.type === 'habit' && (
                <label className="row small">
                  <span>{d.done ? 'Done' : 'Not done'}</span>
                  <input type="checkbox" checked={d.done} onChange={(e) => update(i, { done: e.target.checked } as Partial<Draft>)} />
                </label>
              )}
            </div>
          ))}
          <div className="actions">
            <button type="button" className="btn btn-soft" onClick={() => setDrafts(null)} disabled={busy === 'save'}>Discard</button>
            <button type="button" className="btn btn-dark" onClick={save} disabled={busy === 'save'}>
              {busy === 'save' ? 'Saving…' : drafts.length > 1 ? `Save all ${drafts.length}` : 'Save'}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
