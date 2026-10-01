'use client';
import { useMemo, useState } from 'react';
import { amountLabel, solve, type PlanFood, type SolvedFood } from '@/lib/sandbox';
import { kcal, num, round } from '@/lib/format';
import type { MealDraft } from '@/lib/draft';

export type MealSandboxData = {
  kind: 'meal';
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  foods: PlanFood[];
  eaten: { protein: number; calories: number };
  goals: { pTarget: number; pMin: number; kMin: number; kMax: number };
  note: string | null;
};

/** Bar showing what's already eaten, what this meal adds, and the goal. */
function DayBar({ eaten, meal, max, marks, band, tone }: {
  eaten: number; meal: number; max: number; marks?: number[]; band?: [number, number]; tone: 'protein' | 'kcal';
}) {
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const colors = tone === 'protein' ? ['var(--green)', 'var(--green-light)'] : ['#D9A92B', '#F3DC86'];
  return (
    <div className="sbbar" aria-hidden>
      {band && <span className="sbband" style={{ left: pct(band[0]), width: `${((band[1] - band[0]) / max) * 100}%` }} />}
      <span style={{ left: 0, width: pct(eaten), background: colors[0] }} />
      <span style={{ left: pct(eaten), width: pct(meal), background: colors[1] }} />
      {marks?.map((m) => <i key={m} style={{ left: pct(m) }} />)}
    </div>
  );
}

export default function SandboxMeal({ data, onLog, onClear }: { data: MealSandboxData; onLog: (d: MealDraft) => void; onClear: () => void }) {
  const [foods, setFoods] = useState(data.foods);
  const [aim, setAim] = useState<'target' | 'min'>('target');
  const [mealType, setMealType] = useState(data.mealType);
  const { goals, eaten } = data;
  const goal = aim === 'target' ? goals.pTarget : goals.pMin;
  const r = useMemo(() => solve(foods, goal - eaten.protein), [foods, goal, eaten.protein]);
  const touched = foods !== data.foods;

  const dayP = Math.round(eaten.protein + r.protein);
  const dayK = Math.round(eaten.calories + r.kcal);
  const pLine = dayP >= goal ? `${dayP}g, hits ${goal}g` : `${dayP}g, ${goal - dayP}g short of ${goal}g`;
  const kLine = dayK > goals.kMax ? `${kcal(dayK)}, ${kcal(dayK - goals.kMax)} over` : dayK >= goals.kMin ? `${kcal(dayK)}, in range` : `${kcal(dayK)}, ${kcal(goals.kMax - dayK)} left`;

  /** Stepping a food sets its amount yourself; the auto ones rebalance around it. */
  function step(i: number, s: SolvedFood, dir: 1 | -1) {
    const units = Math.max(0, round(s.units + dir * s.step, 2));
    setFoods((fs) => fs.map((f, j) => (j === i ? { ...f, role: 'fixed', grams: units * f.grams_per_unit } : f)));
  }
  /** Locked -> auto (starting from where it is now), auto -> locked at the current amount. */
  function toggle(i: number, s: SolvedFood) {
    setFoods((fs) => fs.map((f, j) => (j === i ? { ...f, role: f.role === 'flex' ? 'fixed' : 'flex', grams: Math.max(s.g, f.grams_per_unit * f.step) } : f)));
  }
  const remove = (i: number) => setFoods((fs) => fs.filter((_, j) => j !== i));

  function logIt() {
    onLog({
      type: 'meal',
      date: data.date,
      meal_type: mealType,
      items: r.foods.filter((f) => f.g > 0).map((f) => ({
        name: f.name, quantity: f.units, unit: f.units === 1 ? f.unit_label : f.unit_plural, grams: round(f.g),
        protein_g: f.protein, calories: f.kcal,
        carbs_g: f.per100.carbs == null ? null : round((f.per100.carbs * f.g) / 100, 1),
        fat_g: f.per100.fat == null ? null : round((f.per100.fat * f.g) / 100, 1),
        source: f.source, fdc_id: f.fdc_id, fdc_description: f.fdc_description, per100: f.per100,
      })),
    });
  }

  const flexCount = foods.filter((f) => f.role === 'flex').length;
  const pMax = Math.max(goals.pTarget * 1.1, dayP);
  const kMax = Math.max(goals.kMax * 1.1, dayK);

  return (
    <section className="sbox" aria-label="Meal idea">
      <div className="row">
        <span className="sbtag">Sandbox meal</span>
        <div className="seg" role="group" aria-label="Protein goal to hit">
          <button type="button" aria-pressed={aim === 'target'} onClick={() => setAim('target')}>{goals.pTarget}g</button>
          <button type="button" aria-pressed={aim === 'min'} onClick={() => setAim('min')}>{goals.pMin}g</button>
        </div>
      </div>

      <div className="sbsum" aria-live="polite">
        <div className="row small"><span className="muted">Protein after this</span><strong>{pLine}</strong></div>
        <DayBar eaten={eaten.protein} meal={r.protein} max={pMax} marks={[goals.pMin, goals.pTarget]} tone="protein" />
        <div className="row small" style={{ marginTop: 6 }}><span className="muted">Calories after this</span><strong>{kLine}</strong></div>
        <DayBar eaten={eaten.calories} meal={r.kcal} max={kMax} band={[goals.kMin, goals.kMax]} tone="kcal" />
        <div className="small muted" style={{ marginTop: 2 }}>This meal: {num(r.protein)}g protein, {kcal(r.kcal)} kcal</div>
      </div>

      {r.foods.map((f, i) => (
        <div className="sbfood" key={`${f.name}-${i}`}>
          <div style={{ minWidth: 0 }}>
            <div className="sbname">
              {f.name}
              <button type="button" className={`lock ${f.role === 'flex' ? 'on' : ''}`} onClick={() => toggle(i, f)}
                aria-label={f.role === 'flex' ? `${f.name} adjusts automatically. Tap to keep this amount` : `${f.name} amount is set. Tap to let it adjust`}>
                {f.role === 'flex' ? 'auto' : 'set'}
              </button>
            </div>
            <div className="small muted">{num(f.protein)}g protein · {kcal(f.kcal)} kcal{f.source === 'estimate' ? ' · est.' : ''}</div>
          </div>
          <div className="stepper">
            <button type="button" onClick={() => step(i, f, -1)} disabled={f.units <= 0} aria-label={`Less ${f.name}`}>−</button>
            <span>{amountLabel(f, f.units)}</span>
            <button type="button" onClick={() => step(i, f, 1)} aria-label={`More ${f.name}`}>+</button>
          </div>
          <button type="button" className="x" onClick={() => remove(i)} aria-label={`Remove ${f.name}`}>×</button>
        </div>
      ))}

      <div className="small muted">
        {flexCount > 0
          ? 'Tap − or + to set an amount yourself. Anything marked auto rebalances to keep you on your goal.'
          : 'Every amount is set by you. Tap set on a food to let it auto-adjust again.'}
      </div>
      {r.alreadyThere && <div className="small muted">You're already at {goal}g today, so this is bonus protein.</div>}
      {r.capped && <div className="small muted">That's a lot of one food. Add another protein or set a bigger amount elsewhere.</div>}
      {data.note && <div className="small" style={{ color: 'var(--pink-ink)' }}>{data.note}</div>}

      <div className="actions" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <select aria-label="Meal" value={mealType} onChange={(e) => setMealType(e.target.value as typeof mealType)} style={{ marginRight: 'auto' }}>
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="dinner">Dinner</option>
          <option value="snack">Snack</option>
        </select>
        {touched ? (
          <button type="button" className="btn btn-soft" onClick={() => setFoods(data.foods)}>Reset</button>
        ) : (
          <button type="button" className="btn btn-soft" onClick={onClear}>Clear</button>
        )}
        <button type="button" className="btn btn-dark" onClick={logIt} disabled={!r.foods.some((f) => f.g > 0)}>Log this</button>
      </div>
    </section>
  );
}
