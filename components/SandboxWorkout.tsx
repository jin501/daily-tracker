'use client';
import type { PlanItem, WorkoutPlan } from '@/lib/coach';
import { CATEGORY_LABEL } from '@/lib/categories';

function Item({ it }: { it: PlanItem }) {
  const showVariation = it.variation.toLowerCase() !== it.movement.toLowerCase();
  return (
    <div className="plan-item">
      <div className="row-base">
        <strong>{it.movement}</strong>
        <span className="small muted">{CATEGORY_LABEL[it.category]}</span>
      </div>
      {showVariation && <div className="small muted" style={{ marginTop: -2 }}>{it.variation}</div>}
      <div className="tgt">{it.target}</div>
      <div className="why">{it.why}</div>
      {it.last && <div className="last">Last: {it.last}</div>}
    </div>
  );
}

export default function SandboxWorkout({ plan, onFill, onClear }: { plan: WorkoutPlan; onFill: (text: string) => void; onClear: () => void }) {
  const all = [...plan.items, ...plan.abs];
  const pDays = Math.min(1, plan.progress.days / plan.progress.needDays);
  const pWeeks = Math.min(1, plan.progress.weeks / plan.progress.needWeeks);
  return (
    <section className="sbox" aria-label="Workout idea">
      <div className="row">
        <span className="sbtag">Sandbox workout</span>
        {plan.ready && plan.basedOn > 0 && <span className="small muted">from your last {plan.basedOn}</span>}
      </div>
      <h2 className="h2" style={{ fontSize: 24 }}>{plan.label}</h2>

      {!plan.ready && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="meter" aria-hidden><span style={{ width: `${Math.round(((pDays + pWeeks) / 2) * 100)}%` }} /></div>
          <div className="small muted">Learning your routine: {plan.progress.days} of {plan.progress.needDays} gym days, {plan.progress.weeks} of {plan.progress.needWeeks} weeks.</div>
        </div>
      )}
      {plan.notes.map((n) => <div key={n} className="small" style={{ color: 'var(--pink-ink)' }}>{n}</div>)}

      {plan.items.map((it) => <Item key={it.variation} it={it} />)}
      {plan.abs.length > 0 && (
        <>
          <div className="label" style={{ color: 'var(--blue-ink)', paddingTop: 6 }}>Abs</div>
          {plan.abs.map((it) => <Item key={it.variation} it={it} />)}
        </>
      )}

      <div className="actions">
        <button type="button" className="btn btn-soft" onClick={onClear}>Clear</button>
        {all.length > 0 && (
          <button type="button" className="btn btn-dark" onClick={() => onFill(all.map((i) => i.logLine).join('\n'))}>
            Put in log box
          </button>
        )}
      </div>
      {all.length > 0 && <div className="small muted">Put in log box fills in this plan. Fix the numbers after your workout, then send.</div>}
    </section>
  );
}
