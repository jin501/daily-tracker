import Link from 'next/link';
import Nav from '@/components/Nav';
import { ChevronLeft, ChevronRight, Flame } from '@/components/icons';
import { trendsLayout, type Tone, type Widget } from '@/config/trends';
import { bestRun, daily, dailyStreak, getGoals, series, status, weeklyStreak, type Daily, type Goal } from '@/lib/metrics';
import { lastDateOf } from '@/lib/queries';
import { db } from '@/lib/db';
import { num } from '@/lib/format';
import {
  addDays, addMonths, dayNum, eachDay, fmt, isDate, minDate, monthEnd, monthStart,
  todayLocal, weekStart, weekday, yearEnd, yearStart,
} from '@/lib/dates';

export const dynamic = 'force-dynamic';

type Period = 'week' | 'month' | 'year';
type Mode = 'training' | 'protein';

const TONES: Record<Tone, { cls: string; ink: string; mid: string }> = {
  purple: { cls: 't-purple', ink: 'var(--purple-ink)', mid: 'var(--purple-mid)' },
  blue: { cls: 't-blue', ink: 'var(--blue-ink)', mid: 'var(--abs-light)' },
  green: { cls: 't-green', ink: 'var(--green-ink)', mid: 'var(--green-light)' },
  yellow: { cls: 't-yellow', ink: 'var(--yellow-ink)', mid: 'var(--yellow-mid)' },
  peach: { cls: 't-peach', ink: 'var(--peach-ink)', mid: '#F5A887' },
  mint: { cls: 't-act', ink: 'var(--act-ink)', mid: 'var(--act-mid)' },
};

export default async function Trends({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const today = todayLocal();
  const period: Period = sp.p === 'week' || sp.p === 'year' ? sp.p : 'month';
  const mode: Mode = sp.m === 'protein' ? 'protein' : 'training';
  const anchor = isDate(sp.a) && sp.a <= today ? sp.a : today;

  const from = period === 'week' ? weekStart(anchor) : period === 'month' ? monthStart(anchor) : yearStart(anchor);
  const to = period === 'week' ? addDays(from, 6) : period === 'month' ? monthEnd(anchor) : yearEnd(anchor);
  const until = minDate(to, today);
  const prevAnchor = period === 'week' ? addDays(from, -7) : period === 'month' ? addMonths(from, -1) : addMonths(from, -12);
  const nextAnchor = period === 'week' ? addDays(from, 7) : period === 'month' ? addMonths(from, 1) : addMonths(from, 12);

  const href = (o: Partial<{ p: Period; m: Mode; a: string }>) => {
    const q = new URLSearchParams({ p: o.p ?? period, m: o.m ?? mode, a: o.a ?? anchor });
    return `/trends?${q}`;
  };

  const [goals, protein, regular, abs, proteinAll] = await Promise.all([
    getGoals(),
    daily('protein_g', from, to),
    daily('regular_days', from, to),
    daily('ab_days', from, to),
    daily('protein_g', addDays(today, -400), today),
  ]);
  const ctx: Ctx = { today, from, to, until, period, mode, goals, protein, regular, abs, proteinAll, href, prevAnchor, nextAnchor };

  const title = period === 'week'
    ? `Week of ${fmt(from, { month: 'short', day: 'numeric' })}`
    : period === 'month' ? fmt(from, { month: 'long', year: 'numeric' }) : from.slice(0, 4);

  return (
    <>
      <main className="page">
        <header className="head">
          <h1 className="title">Trends</h1>
        </header>
        <nav className="toggle" aria-label="Period">
          {(['week', 'month', 'year'] as Period[]).map((p) => (
            <Link key={p} href={href({ p, a: anchor })} aria-current={p === period}>{p[0].toUpperCase() + p.slice(1)}</Link>
          ))}
        </nav>
        {await Promise.all(trendsLayout.map((w, i) => renderWidget(w, ctx, title, i)))}
      </main>
      <Nav current="/trends" />
    </>
  );
}

type Ctx = {
  today: string; from: string; to: string; until: string; period: Period; mode: Mode;
  goals: Record<string, Goal>; protein: Daily; regular: Daily; abs: Daily; proteinAll: Daily;
  href: (o: Partial<{ p: Period; m: Mode; a: string }>) => string; prevAnchor: string; nextAnchor: string;
};

async function renderWidget(w: Widget, c: Ctx, title: string, key: number) {
  switch (w.type) {
    case 'calendar': return <Calendar key={key} c={c} title={title} />;
    case 'protein-stats': return <ProteinStats key={key} c={c} />;
    case 'protein-streak': return <ProteinStreak key={key} c={c} />;
    case 'weekly-bars': return <WeeklyBars key={key} c={c} w={w} />;
    case 'ab-summary': return <AbSummary key={key} c={c} />;
    case 'habit-strips': return <HabitStrips key={key} c={c} days={w.days} />;
  }
}

// ---------- calendar ----------

function cellStyle(d: string, c: Ctx): React.CSSProperties {
  if (d > c.today) return {};
  if (c.mode === 'training') {
    const reg = c.regular.has(d);
    const ab = c.abs.has(d);
    if (reg && ab) return { background: 'var(--purple-ink)', color: '#fff', boxShadow: 'inset 0 -9px 0 var(--abs-mark)' };
    if (reg) return { background: 'var(--purple-ink)', color: '#fff' };
    if (ab) return { background: 'var(--abs-light)', color: 'var(--blue-ink)' };
    return { background: 'var(--pale)' };
  }
  const s = status(c.protein.get(d) ?? 0, c.goals.protein_daily);
  if (s === 'goal') return { background: 'var(--green)', color: '#fff' };
  if (s === 'counted') return { background: 'var(--green-light)' };
  return { background: 'var(--pale)' };
}

function Calendar({ c, title }: { c: Ctx; title: string }) {
  const pMin = c.goals.protein_daily.success_min ?? c.goals.protein_daily.target;
  const nextDisabled = c.nextAnchor > c.today;
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, borderRadius: 28 }} aria-label="Calendar">
      <div className="row">
        <Link href={c.href({ a: c.prevAnchor })} className="iconbtn" aria-label="Previous"><ChevronLeft /></Link>
        <h2 className="h2" style={{ fontSize: 22 }}>{title}</h2>
        <Link href={c.href({ a: c.nextAnchor })} className="iconbtn" aria-label="Next" aria-disabled={nextDisabled}><ChevronRight /></Link>
      </div>
      <nav className="toggle inset" aria-label="Color by">
        <Link href={c.href({ m: 'training' })} aria-current={c.mode === 'training'}>Training</Link>
        <Link href={c.href({ m: 'protein' })} aria-current={c.mode === 'protein'}>Protein</Link>
      </nav>

      {c.period === 'year' ? (
        <div className="year">
          {Array.from({ length: 12 }, (_, m) => {
            const ms = addMonths(c.from, m);
            const days = eachDay(ms, monthEnd(ms));
            return (
              <div key={ms}>
                <div className="small muted" style={{ marginBottom: 4 }}>{fmt(ms, { month: 'short' })}</div>
                <div className="mini">
                  {Array.from({ length: weekday(ms) }, (_, i) => <span key={`b${i}`} />)}
                  {days.map((d) => <span key={d} style={{ ...cellStyle(d, c), boxShadow: undefined, ...(d === c.today ? { outline: '1.5px solid var(--ink)' } : {}) }} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={c.period === 'week' ? 'cal-week' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="cal" aria-hidden>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="cal-dow">{d}</span>)}
          </div>
          <div className="cal">
            {c.period === 'month' && Array.from({ length: weekday(c.from) }, (_, i) => <span key={`b${i}`} />)}
            {eachDay(c.from, c.to).map((d) =>
              d > c.today ? (
                <span key={d} className="cal-cell future">{dayNum(d)}</span>
              ) : (
                <Link key={d} href={d === c.today ? '/' : `/?date=${d}`} className={`cal-cell${d === c.today ? ' today' : ''}`} style={cellStyle(d, c)}
                  aria-label={fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}>
                  {dayNum(d)}
                  {c.period === 'week' && c.mode === 'protein' && (
                    <span style={{ fontSize: 11, fontWeight: 500 }}>{Math.round(c.protein.get(d) ?? 0)}g</span>
                  )}
                </Link>
              ),
            )}
          </div>
        </div>
      )}

      <div className="legend" style={{ fontSize: 12 }}>
        {c.mode === 'training' ? (
          <>
            <span><i className="sq" style={{ background: 'var(--purple-ink)' }} />Workout</span>
            <span><i className="sq" style={{ background: 'var(--abs-light)' }} />Abs only</span>
            <span><i className="sq" style={{ background: 'var(--purple-ink)', boxShadow: 'inset 0 -4px 0 var(--abs-mark)' }} />Workout + abs</span>
            <span><i className="sq" style={{ background: 'var(--pale)' }} />Rest</span>
          </>
        ) : (
          <>
            <span><i className="sq" style={{ background: 'var(--pale)' }} />Under {pMin}</span>
            <span><i className="sq" style={{ background: 'var(--green-light)' }} />{pMin}+ counts</span>
            <span><i className="sq" style={{ background: 'var(--green)' }} />{c.goals.protein_daily.target} goal</span>
          </>
        )}
      </div>
    </section>
  );
}

// ---------- protein ----------

function ProteinStats({ c }: { c: Ctx }) {
  if (c.from > c.today) return null;
  const days = eachDay(c.from, c.until);
  const st = days.map((d) => status(c.protein.get(d) ?? 0, c.goals.protein_daily));
  const countedDays = st.filter((s) => s !== 'miss').length;
  const goalDays = st.filter((s) => s === 'goal').length;
  const pg = c.goals.protein_daily;
  return (
    <div className="grid2">
      <section className="tile t-green">
        <h2 className="label">Days that counted</h2>
        <div>
          <div className="big" style={{ fontSize: 44 }}>{countedDays}<span className="of"> / {days.length}</span></div>
          <div className="small ink2">{pg.success_min ?? pg.target}g or more</div>
        </div>
      </section>
      <section className="tile t-yellow">
        <h2 className="label">Full {pg.target} days</h2>
        <div>
          <div className="big" style={{ fontSize: 44 }}>{goalDays}</div>
          <div className="small ink2">this {c.period}</div>
        </div>
      </section>
    </div>
  );
}

function ProteinStreak({ c }: { c: Ctx }) {
  const pg = c.goals.protein_daily;
  const ok = (v: number) => v >= (pg.success_min ?? pg.target);
  const current = dailyStreak(c.proteinAll, c.today, ok);
  const best = c.from > c.today ? 0 : bestRun(eachDay(c.from, c.until), c.protein, ok);
  return (
    <section className="card t-peach row">
      <div>
        <h2 className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Flame color="#7B3014" /> Protein streak</h2>
        <div className="small ink2" style={{ marginTop: 6 }}>Best this {c.period}: {best} day{best === 1 ? '' : 's'}</div>
      </div>
      <div className="big">{current}</div>
    </section>
  );
}

// ---------- weekly bars (generic: any metric + goal) ----------

async function WeeklyBars({ c, w }: { c: Ctx; w: Extract<Widget, { type: 'weekly-bars' }> }) {
  const end = weekStart(c.until < c.from ? c.today : c.until);
  const start = addDays(end, -7 * (w.weeks - 1));
  const target = w.goal ? c.goals[w.goal]?.target ?? 0 : 0;
  const [weeks, streak] = await Promise.all([
    series(w.metric, start, addDays(end, 6), 'week'),
    target ? weeklyStreak(w.metric, target, c.today) : Promise.resolve(0),
  ]);
  const max = Math.max(target, ...weeks.map((x) => x.value), 1);
  const tone = TONES[w.tone];
  const currentWeek = weekStart(c.today);
  return (
    <section className={`card ${tone.cls}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row-base">
        <h2 className="label">{w.title}</h2>
        <span className="small ink2">{target ? `goal ${target}${w.unit}` : `${num(weeks.reduce((a, x) => a + x.value, 0) / Math.max(1, weeks.filter((x) => x.value > 0).length), 1)}${w.unit} avg`}</span>
      </div>
      <div className="bars" style={{ height: 150 }}>
        {weeks.map((x) => {
          const inProgress = x.start === currentWeek;
          return (
            <div className="col" key={x.start}>
              <div style={{
                height: `${Math.max(4, (x.value / max) * 100)}px`,
                background: inProgress ? '#fff' : target && x.value >= target ? tone.ink : target ? tone.mid : tone.ink,
                border: inProgress ? `2px dashed ${tone.ink}` : undefined,
              }} />
              <span className="v" style={{ color: tone.ink }}>{num(x.value, w.decimals ?? 0)}</span>
              <span className="k" style={{ color: tone.ink }}>{fmt(x.start, { month: 'numeric', day: 'numeric' })}</span>
            </div>
          );
        })}
      </div>
      <div className="small ink2">
        {!target ? 'Dashed bar is this week so far.' : `${streak > 0 ? `Weekly goal hit ${streak} week${streak === 1 ? '' : 's'} in a row` : 'Hit the goal this week to start a streak'}. Dashed bar is this week so far.`}
      </div>
    </section>
  );
}

// ---------- abs ----------

async function AbSummary({ c }: { c: Ctx }) {
  const last = await lastDateOf('ab');
  const count = c.from > c.today ? 0 : eachDay(c.from, c.until).filter((d) => c.abs.has(d)).length;
  const lastLabel = !last ? 'none yet' : last === c.today ? 'today' : last === addDays(c.today, -1) ? 'yesterday' : fmt(last, { weekday: 'short', month: 'numeric', day: 'numeric' });
  return (
    <section className="card t-blue row">
      <div>
        <h2 className="label">Ab workouts</h2>
        <div className="small ink2" style={{ marginTop: 6 }}>Last: {lastLabel}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="big" style={{ fontSize: 44 }}>{count}</div>
        <div className="small ink2">this {c.period}</div>
      </div>
    </section>
  );
}

// ---------- habits ----------

async function HabitStrips({ c, days }: { c: Ctx; days: number }) {
  const end = c.until < c.from ? c.today : c.until;
  const start = addDays(end, -(days - 1));
  const range = eachDay(start, end);
  const habits = await db()<{ key: string; name: string; emoji: string | null; color: string }[]>`
    select key, name, emoji, color from habits where active order by sort, id`;
  const pg = c.goals.protein_daily;
  const pMin = pg.success_min ?? pg.target;

  const rows = await Promise.all(
    habits.map(async (h) => {
      const vals = await daily(`habit:${h.key}`, addDays(end, -400), end);
      return { name: h.emoji ? `${h.emoji} ${h.name}` : h.name, color: h.color, vals, ok: (v: number) => v > 0 };
    }),
  );
  rows.push({ name: `Hit ${pMin}g+`, color: 'var(--green)', vals: c.proteinAll, ok: (v: number) => v >= pMin });

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div className="row-base" style={{ paddingBottom: 6 }}>
        <h2 className="h2">Habits</h2>
        <span className="small muted">last {days} days</span>
      </div>
      {rows.map((r) => {
        const hits = range.filter((d) => r.ok(r.vals.get(d) ?? 0)).length;
        const streak = dailyStreak(r.vals, end, r.ok);
        return (
          <div key={r.name} style={{ padding: '12px 0', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row-base">
              <span style={{ fontWeight: 600 }}>{r.name}</span>
              <span className="small muted">{streak >= 3 ? `${streak} day streak` : `${hits} of ${days} days`}</span>
            </div>
            <div className="strip" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }} aria-hidden>
              {range.map((d) => <span key={d} style={{ background: r.ok(r.vals.get(d) ?? 0) ? r.color : 'var(--pale)' }} />)}
            </div>
          </div>
        );
      })}
    </section>
  );
}
