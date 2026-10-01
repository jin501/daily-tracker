import Link from 'next/link';
import Nav from '@/components/Nav';
import UnitToggle from '@/components/UnitToggle';
import MovementEditor from '@/components/MovementEditor';
import { allMovements, listMovements, variationPR, variationSessions, type Session } from '@/lib/queries';
import { est1RM, num, setLabel } from '@/lib/format';
import { fmt } from '@/lib/dates';
import { getUnit } from '@/lib/settings';
import { kgTo, weightIn, type WUnit } from '@/lib/units';
import { CATEGORY_LABEL, CATEGORY_TONE } from '@/lib/categories';

export const dynamic = 'force-dynamic';

type Top = { value: number; label: string; w: number | null; reps: number | null };

/** The session's best set: heaviest weight (then reps), else longest distance, else most reps. */
function topOf(s: Session, unit: WUnit): Top {
  const weighted = s.sets.filter((x) => x.weight_kg != null);
  if (weighted.length) {
    const b = weighted.reduce((a, x) => (x.weight_kg! > a.weight_kg! || (x.weight_kg === a.weight_kg && (x.reps ?? 0) > (a.reps ?? 0)) ? x : a));
    const w = weightIn(b, unit)!;
    return { value: w, label: setLabel(b, unit, true), w, reps: b.reps };
  }
  const dist = s.sets.filter((x) => x.distance_m != null);
  if (dist.length) {
    const b = dist.reduce((a, x) => (x.distance_m! > a.distance_m! ? x : a));
    return { value: b.distance_m!, label: setLabel(b, unit), w: null, reps: null };
  }
  const b = s.sets.reduce((a, x) => ((x.reps ?? x.duration_s ?? 0) > (a.reps ?? a.duration_s ?? 0) ? x : a));
  return { value: b.reps ?? b.duration_s ?? 0, label: setLabel(b, unit), w: null, reps: b.reps };
}

const HERO = { purple: 't-purple', abs: 't-abs', act: 't-act' } as const;
const INK = { purple: 'var(--purple-ink)', abs: 'var(--blue-ink)', act: 'var(--act-ink)' } as const;
const MID = { purple: 'var(--purple-mid)', abs: 'var(--abs-light)', act: 'var(--act-mid)' } as const;

export default async function Lifts({ searchParams }: { searchParams: Promise<{ m?: string; v?: string }> }) {
  const sp = await searchParams;
  const [movements, unit, everything] = await Promise.all([listMovements(), getUnit(), allMovements()]);
  const selected = movements.find((m) => String(m.id) === sp.m) ?? movements[0];

  if (!selected) {
    return (
      <>
        <main className="page">
          <header className="head"><h1 className="title">Lifts</h1><UnitToggle unit={unit} /></header>
          <section className="card">
            <h2 className="h2">No lifts yet</h2>
            <p className="empty">Log a workout on Today, like &quot;cable row 50 lb 12, 12, 10&quot;, and each exercise shows up here with its progress.</p>
          </section>
        </main>
        <Nav current="/lifts" />
      </>
    );
  }

  const variation = selected.variations.find((v) => String(v.id) === sp.v) ?? selected.variations[0];
  const [sessions, prKg] = await Promise.all([variationSessions(variation.id, 8), variationPR(variation.id)]);
  const tops = sessions.map((s) => ({ s, top: topOf(s, unit) }));
  const latest = tops[tops.length - 1];
  const max = Math.max(...tops.map((t) => t.top.value), 1);
  const pr = prKg == null ? null : kgTo(prKg, unit);
  const isPR = latest.top.w != null && pr != null && latest.top.w >= pr && tops.length > 1;
  const volume = latest.s.sets.reduce((a, x) => a + (weightIn(x, unit) ?? 0) * (x.reps ?? 0), 0);
  const oneRM = latest.top.w != null && latest.top.reps ? est1RM(latest.top.w, latest.top.reps) : null;
  const unitWord = latest.top.w != null ? unit : latest.s.sets.some((x) => x.distance_m != null) ? 'm' : latest.s.sets.some((x) => x.reps != null) ? 'reps' : 's';
  const tone = CATEGORY_TONE[selected.category];
  const others = everything.filter((m) => m.id !== selected.id);

  return (
    <>
      <main className="page">
        <header className="head">
          <h1 className="title">Lifts</h1>
          <UnitToggle unit={unit} />
        </header>

        <nav className="chiprow" aria-label="Exercises">
          {movements.map((m) => (
            <Link key={m.id} href={`/lifts?m=${m.id}`} aria-current={m.id === selected.id}>{m.name}</Link>
          ))}
        </nav>

        <section className={`hero ${HERO[tone]}`} aria-label={`${selected.name} progress`}>
          <div className="row">
            <h2 className="label">{CATEGORY_LABEL[selected.category]} · top set, last {tops.length}</h2>
            {isPR && <span className="pill" style={{ background: INK[tone] }}>PR</span>}
          </div>
          <div>
            <div className="h2" style={{ fontSize: 26 }}>{selected.name}</div>
            {selected.variations.length > 1 ? (
              <div className="chiprow" style={{ marginTop: 10 }}>
                {selected.variations.map((v) => (
                  <Link key={v.id} href={`/lifts?m=${selected.id}&v=${v.id}`} aria-current={v.id === variation.id} style={{ minHeight: 36, fontSize: 13 }}>{v.name}</Link>
                ))}
              </div>
            ) : (
              variation.name.toLowerCase() !== selected.name.toLowerCase() && <div className="small ink2">{variation.name}</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="huge" style={{ fontSize: 68 }}>{num(latest.top.value, latest.top.w != null ? 1 : 0)}</span>
            <span className="of" style={{ fontSize: 24 }}>{latest.top.w != null ? `${unit} × ${latest.top.reps ?? '?'}` : unitWord}</span>
          </div>
          <div className="bars" style={{ height: 130, justifyContent: tops.length < 5 ? 'flex-start' : undefined }}>
            {tops.map(({ s, top }, i) => (
              <div className="col" key={s.date}>
                <div style={{ height: `${Math.max(6, (top.value / max) * 90)}px`, background: i === tops.length - 1 ? INK[tone] : MID[tone] }} />
                <span className="v" style={{ color: INK[tone] }}>{num(top.value)}</span>
                <span className="k" style={{ color: INK[tone] }}>{fmt(s.date, { month: 'numeric', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </section>

        {latest.top.w != null && (
          <div className="grid2">
            <section className="tile t-yellow">
              <h2 className="label">Est. 1RM</h2>
              <div>
                <div className="big" style={{ fontSize: 36, whiteSpace: 'nowrap' }}>{oneRM ? num(oneRM, 0) : '—'}<span className="of" style={{ fontSize: 20 }}> {unit}</span></div>
                <div className="small ink2">from {latest.top.label}</div>
              </div>
            </section>
            <section className="tile t-blue">
              <h2 className="label">Volume {fmt(latest.s.date, { month: 'numeric', day: 'numeric' })}</h2>
              <div>
                <div className="big" style={{ fontSize: 36, whiteSpace: 'nowrap' }}>{Math.round(volume).toLocaleString()}<span className="of" style={{ fontSize: 20 }}> {unit}</span></div>
                <div className="small ink2">weight × reps, all sets</div>
              </div>
            </section>
          </div>
        )}

        <section className="card">
          <div className="row-base" style={{ paddingBottom: 8 }}>
            <h2 className="h2">Last session</h2>
            <Link href={`/?date=${latest.s.date}`} className="small muted">{fmt(latest.s.date, { month: 'short', day: 'numeric' })}</Link>
          </div>
          {latest.s.sets.map((x, i) => (
            <div className="row" key={x.id} style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
              <span className="muted">Set {i + 1}</span>
              <strong>{setLabel(x, unit, true)}</strong>
            </div>
          ))}
        </section>

        <MovementEditor
          key={selected.id}
          movement={{ id: selected.id, name: selected.name, category: selected.category }}
          variations={selected.variations.map((v) => ({ id: v.id, name: v.name }))}
          others={others}
        />

        <section className="card">
          <h2 className="h2" style={{ paddingBottom: 8 }}>All exercises</h2>
          {movements.map((m) => (
            <Link key={m.id} href={`/lifts?m=${m.id}`} className="listlink">
              <span style={{ minWidth: 0 }}>
                {m.name}
                <span className="src" style={CATEGORY_TONE[m.category] === 'abs' ? { background: 'var(--abs-light)', color: 'var(--blue-ink)' } : CATEGORY_TONE[m.category] === 'act' ? { background: 'var(--act)', color: 'var(--act-ink)' } : { background: 'var(--purple)', color: 'var(--purple-ink)' }}>
                  {CATEGORY_LABEL[m.category]}
                </span>
                {m.variations.length > 1 && <div className="small muted">{m.variations.map((v) => v.name).join(', ')}</div>}
              </span>
              <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{m.sessions} day{m.sessions === 1 ? '' : 's'}</span>
            </Link>
          ))}
        </section>
      </main>
      <Nav current="/lifts" />
    </>
  );
}
