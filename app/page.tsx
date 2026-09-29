import Link from 'next/link';
import Nav from '@/components/Nav';
import LogBox from '@/components/LogBox';
import HabitButton, { DerivedHabit } from '@/components/HabitButton';
import DeleteButton from '@/components/DeleteButton';
import { Ball, ChevronLeft, ChevronRight, Dumbbell, Flame, Gear } from '@/components/icons';
import { abBreakdown, getDay, type WorkoutRow } from '@/lib/queries';
import { daily, dailyStreak, getGoals, weeklyStreak } from '@/lib/metrics';
import { addDays, fmt, isDate, todayLocal, weekStart } from '@/lib/dates';
import { MEAL_COLORS, cap, num, qty, setLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

function topSet(w: WorkoutRow) {
  let best: { name: string; label: string; kg: number } | null = null;
  for (const ex of w.exercises)
    for (const s of ex.sets)
      if (s.weight_kg != null && (!best || s.weight_kg > best.kg)) best = { name: ex.name, label: `${num(s.weight_kg)}kg × ${s.reps ?? '?'}`, kg: s.weight_kg };
  return best;
}

export default async function Today({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const today = todayLocal();
  const date = isDate(sp.date) && sp.date <= today ? sp.date : today;
  const isToday = date === today;
  const wk = weekStart(date);
  const wkEnd = addDays(wk, 6);

  const [day, goals, proteinHistory, trainingWeek, abWeek, abToday] = await Promise.all([
    getDay(date),
    getGoals(),
    daily('protein_g', addDays(date, -400), date),
    daily('training_days', wk, wkEnd),
    daily('ab_sets', wk, wkEnd),
    abBreakdown(date),
  ]);

  const pg = goals.protein_daily;
  const pMin = pg.success_min ?? pg.target;
  const workoutGoal = goals.workouts_weekly.target;
  const absGoal = goals.abs_sets_weekly.target;
  const workoutStreak = await weeklyStreak('training_days', workoutGoal, date);

  // protein
  const protein = Math.round(day.meals.reduce((a, m) => a + m.protein, 0));
  const calories = Math.round(day.meals.reduce((a, m) => a + m.calories, 0));
  const toCount = Math.max(0, Math.ceil(pMin - protein));
  const toGo = Math.max(0, Math.ceil(pg.target - protein));
  const scale = Math.max(pg.target, protein);
  const counted = (v: number) => v >= pMin;
  const pStreak = dailyStreak(proteinHistory, date, counted);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6)).map((d) => ({
    d,
    ok: counted(proteinHistory.get(d) ?? 0),
    current: d === date,
  }));

  // weekly
  const trainingDays = sum(trainingWeek);
  const abSets = sum(abWeek);
  const absToGo = Math.max(0, absGoal - abSets);
  const absSegs = Math.max(absGoal, abSets);

  const prevHref = `/?date=${addDays(date, -1)}`;
  const nextDate = addDays(date, 1);
  const nextHref = nextDate >= today ? '/' : `/?date=${nextDate}`;

  return (
    <>
      <main className="page">
        <header className="head">
          <div>
            {!isToday && <Link href="/" className="backlink">Back to today</Link>}
            <h1 className="title">{fmt(date, { weekday: 'long' })}</h1>
          </div>
          <div className="head-right">
            <div className="datepill">
              <Link href={prevHref} className="iconbtn" aria-label="Previous day"><ChevronLeft /></Link>
              <span>{fmt(date, { month: 'short', day: 'numeric' })}</span>
              <Link href={nextHref} className="iconbtn" aria-label="Next day" aria-disabled={isToday}><ChevronRight /></Link>
            </div>
            <Link href="/settings" className="iconbtn" aria-label="Settings"><Gear /></Link>
          </div>
        </header>

        {/* Protein */}
        <section className="hero t-green" aria-label="Protein">
          <div className="row">
            <h2 className="label">Protein</h2>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span className="pill">{toCount > 0 ? `${toCount}g to count` : toGo > 0 ? 'Counted' : 'Goal hit'}</span>
              <span className="small ink2" style={{ fontWeight: 500, paddingRight: 4 }}>
                {toGo > 0 ? `${toGo}g to go` : protein > pg.target ? `${protein - pg.target}g over` : 'Right on it'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="huge">{protein}</span>
            <span className="of">/ {pg.target}g</span>
          </div>
          <div className="pbar-wrap" style={{ paddingBottom: 4 }}>
            <div className="pbar" role="img" aria-label={`${protein} of ${pg.target} grams, ${pMin} counts`}>
              {day.meals.filter((m) => m.protein > 0).map((m) => (
                <span key={m.id} style={{ flex: `${m.protein} 1 0`, background: MEAL_COLORS[m.meal_type] ?? '#5E9A5A' }} />
              ))}
              {protein < pg.target && <span style={{ flex: `${pg.target - protein} 1 0`, background: '#F3F8EE' }} />}
            </div>
            <div className="tick" style={{ left: `${(pMin / scale) * 100}%` }} />
          </div>
          {day.meals.length > 0 && (
            <div className="legend">
              {day.meals.map((m) => (
                <span key={m.id}><i className="dot" style={{ background: MEAL_COLORS[m.meal_type] }} />{cap(m.meal_type)} {Math.round(m.protein)}g</span>
              ))}
            </div>
          )}
        </section>

        <div className="grid2">
          <section className="tile t-yellow">
            <h2 className="label">Calories</h2>
            <div>
              <div className="big">{calories}</div>
              <div className="small ink2">kcal eaten</div>
            </div>
          </section>
          <section className="tile t-peach">
            <h2 className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Flame color="#8A2F0E" /> Streak</h2>
            <div>
              <div className="big">{pStreak}</div>
              <div className="small ink2">{pStreak === 1 ? 'day' : 'days'} at {pMin}g+</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 10 }} aria-hidden>
                {last7.map((x) => (
                  <span key={x.d} style={{
                    width: 14, height: 14, borderRadius: 999,
                    background: x.ok ? 'var(--peach-ink)' : 'var(--peach-soft)',
                    boxShadow: x.current && !x.ok ? 'inset 0 0 0 2px var(--peach-ink)' : undefined,
                  }} />
                ))}
              </div>
            </div>
          </section>
        </div>

        <LogBox date={date} today={today} />

        {/* Meals */}
        <section className="card" aria-label="Meals">
          <div className="row-base" style={{ paddingBottom: 6 }}>
            <h2 className="h2">Meals</h2>
            <span className="small muted">protein per item</span>
          </div>
          {day.meals.length === 0 && <p className="empty">Nothing logged yet. Tell the box above what you ate.</p>}
          {day.meals.map((m) => (
            <div className="meal" key={m.id}>
              <div className="meal-head">
                <span className="meal-name"><i className="dot" style={{ background: MEAL_COLORS[m.meal_type] }} />{cap(m.meal_type)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <strong>{Math.round(m.protein)}g</strong>
                  <DeleteButton kind="meal" id={m.id} label={`this ${m.meal_type}`} />
                </span>
              </div>
              {m.items.map((f) => (
                <div className="item" key={f.id} title={f.fdc_description ?? 'Estimated'}>
                  <span>
                    {f.name}
                    {f.quantity != null && <span className="muted"> · {qty(f.quantity)} {f.unit ?? ''}</span>}
                    {f.source === 'estimate' && <span className="src src-estimate">est.</span>}
                  </span>
                  <span>{num(f.protein_g)}g</span>
                </div>
              ))}
            </div>
          ))}
        </section>

        {/* Workouts + activities */}
        <div className="grid2">
          {day.workouts.map((w) => {
            const allAbs = w.exercises.every((e) => e.tags.includes('abs'));
            const top = topSet(w);
            return (
              <section key={`w${w.id}`} className="tile t-purple">
                <h2 className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Dumbbell color="#3B2C7A" /> {allAbs ? 'Abs' : 'Strength'}</h2>
                <div>
                  <div className="h2" style={{ fontSize: 24, lineHeight: 1.1 }}>{w.title || 'Workout'}</div>
                  <div className="small ink2" style={{ marginTop: 4 }}>
                    {w.exercises.length} exercise{w.exercises.length === 1 ? '' : 's'}
                    {top && <><br />{top.name} top set {top.label}</>}
                  </div>
                </div>
              </section>
            );
          })}
          {day.activities.map((a) => (
            <section key={`a${a.id}`} className="tile t-blue">
              <h2 className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Ball color="#174A66" /> Activity</h2>
              <div>
                <div className="h2" style={{ fontSize: 24, lineHeight: 1.1 }}>{a.name}</div>
                <div className="small ink2" style={{ marginTop: 4 }}>
                  {[a.duration_min != null ? `${a.duration_min} min` : null, a.distance_km != null ? `${num(a.distance_km)} km` : null].filter(Boolean).join(' · ') || 'Logged'}
                </div>
              </div>
              <div style={{ alignSelf: 'flex-end', marginTop: -8 }}><DeleteButton kind="activity" id={a.id} label={a.name} /></div>
            </section>
          ))}
          {day.workouts.length + day.activities.length === 0 && (
            <section className="tile t-white" style={{ gridColumn: '1 / -1', minHeight: 0 }}>
              <h2 className="label">Moved today</h2>
              <p className="empty" style={{ margin: 0 }}>No workout or activity yet. Paste your workout log or say something like "played tennis for an hour".</p>
            </section>
          )}
        </div>

        {day.workouts.map((w) => (
          <section className="card" key={`wd${w.id}`} aria-label={`${w.title ?? 'Workout'} details`}>
            <div className="row" style={{ paddingBottom: 6 }}>
              <h2 className="h2">{w.title || 'Workout'}</h2>
              <DeleteButton kind="workout" id={w.id} label="this workout" />
            </div>
            {w.exercises.map((ex, i) => (
              <div className="ex" key={i}>
                <span>
                  {ex.name}
                  {ex.tags.includes('abs') && <span className="src" style={{ background: 'var(--abs-light)', color: 'var(--blue-ink)' }}>abs</span>}
                </span>
                <span className="sets">{ex.sets.map((s) => setLabel(s)).join(' · ')}</span>
              </div>
            ))}
          </section>
        ))}

        {/* Abs this week */}
        <section className="card t-blue" style={{ display: 'flex', flexDirection: 'column', gap: 14 }} aria-label="Abs this week">
          <div className="row">
            <h2 className="label">Abs this week</h2>
            <span className="pill pill-blue">{absToGo > 0 ? `${absToGo} set${absToGo === 1 ? '' : 's'} to go` : 'Goal hit'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="big" style={{ fontSize: 56 }}>{abSets}</span>
            <span className="of" style={{ fontSize: 22 }}>/ {absGoal} sets</span>
          </div>
          <div className="segs" aria-hidden>
            {Array.from({ length: absSegs }, (_, i) => <span key={i} style={{ background: i < abSets ? 'var(--blue-ink)' : '#fff' }} />)}
          </div>
          <div className="small ink2">
            {abToday.length
              ? `${isToday ? 'Today' : fmt(date, { month: 'short', day: 'numeric' })}: ${abToday.map((a) => `${a.name} ${a.sets}`).join(', ')}`
              : `No abs logged ${isToday ? 'today' : 'this day'}`}
          </div>
        </section>

        <div className="grid2">
          <section className="tile t-mint" style={{ justifyContent: 'flex-start', gap: 12 }}>
            <h2 className="label">Workouts this week</h2>
            <div className="big" style={{ fontSize: 44 }}>{trainingDays}<span className="of"> / {workoutGoal}</span></div>
            <div className="segs" aria-hidden>
              {Array.from({ length: Math.max(workoutGoal, trainingDays) }, (_, i) => (
                <span key={i} style={{ height: 10, background: i < trainingDays ? 'var(--green-ink)' : '#fff' }} />
              ))}
            </div>
            <div className="small ink2">{workoutStreak} week streak</div>
          </section>
          <section className="tile t-white" style={{ justifyContent: 'flex-start', gap: 2 }}>
            <h2 className="label" style={{ marginBottom: 6 }}>Habits</h2>
            {day.habits.map((h) => (
              <HabitButton key={`${h.key}-${date}`} habitKey={h.key} name={h.name} date={date} done={h.done} />
            ))}
            <DerivedHabit name={`${pMin}g+ protein`} done={protein >= pMin} />
            <DerivedHabit name="Weekly workouts" done={trainingDays >= workoutGoal} />
          </section>
        </div>
      </main>
      <Nav current="/" />
    </>
  );
}
