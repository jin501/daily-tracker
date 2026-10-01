import Link from 'next/link';
import Nav from '@/components/Nav';
import LogBox from '@/components/LogBox';
import HabitButton, { DerivedHabit } from '@/components/HabitButton';
import DeleteButton from '@/components/DeleteButton';
import GymControls, { type GymSessionView } from '@/components/GymControls';
import DayTypeSelect from '@/components/DayTypeSelect';
import TrainingCards from '@/components/TrainingCards';
import { ChevronLeft, ChevronRight, Flame, Gear } from '@/components/icons';
import { abBreakdown, getDay } from '@/lib/queries';
import { daily, dailyStreak, getGoals, weeklyStreak } from '@/lib/metrics';
import { addDays, clock, fmt, isDate, toLocalHHMM, todayLocal, weekStart } from '@/lib/dates';
import { MEAL_COLORS, activityEmoji, cap, kcal, num, qty } from '@/lib/format';
import { minutesOf } from '@/lib/gym';
import { getUnit } from '@/lib/settings';
import { DAY_LABEL } from '@/lib/daytype';

export const dynamic = 'force-dynamic';

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

export default async function Today({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const today = todayLocal();
  const date = isDate(sp.date) && sp.date <= today ? sp.date : today;
  const isToday = date === today;
  const wk = weekStart(date);
  const wkEnd = addDays(wk, 6);

  const day = await getDay(date);
  const [goals, proteinHistory, trainingWeek, abWeek, abToday, unit] = await Promise.all([
    getGoals(),
    daily('protein_g', addDays(date, -400), date),
    daily('training_days', wk, wkEnd),
    daily('ab_sets', wk, wkEnd),
    abBreakdown(date),
    getUnit(),
  ]);

  const pg = goals.protein_daily;
  const cg = goals.calories_daily;
  const pMin = pg.success_min ?? pg.target;
  const kMin = cg.success_min ?? cg.target;
  const kMax = cg.target;
  const workoutGoal = goals.workouts_weekly.target;
  const absGoal = goals.abs_sets_weekly.target;
  const workoutStreak = await weeklyStreak('training_days', workoutGoal, date);

  // protein + calories
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
  const kStatus = calories > kMax ? `${kcal(calories - kMax)} over` : calories >= kMin ? 'In range' : `${kcal(kMax - calories)} left`;

  // weekly
  const trainingDays = sum(trainingWeek);
  const abSets = sum(abWeek);
  const absToGo = Math.max(0, absGoal - abSets);
  const absSegs = Math.max(absGoal, abSets);

  // gym
  const now = Date.now();
  const gym: GymSessionView[] = day.gym.map((s) => ({
    id: Number(s.id),
    startedAt: new Date(s.started_at).toISOString(),
    ended: !!s.ended_at,
    auto: s.auto_ended,
    startHHMM: toLocalHHMM(s.started_at),
    endHHMM: s.ended_at ? toLocalHHMM(s.ended_at) : null,
    startLabel: clock(s.started_at),
    endLabel: s.ended_at ? clock(s.ended_at) : null,
    minutes: minutesOf(s, now),
  }));

  const prevHref = `/?date=${addDays(date, -1)}`;
  const nextDate = addDays(date, 1);
  const nextHref = nextDate >= today ? '/' : `/?date=${nextDate}`;
  const autoType = day.dayType;

  return (
    <>
      <main className="page">
        <header className="head">
          <div style={{ minWidth: 0 }}>
            <div className="subdate">
              {fmt(date, { month: 'long', day: 'numeric' })}
              {!isToday && <Link href="/" className="backlink">Back to today</Link>}
            </div>
            <h1 className="title">{fmt(date, { weekday: 'long' })}</h1>
          </div>
          <div className="head-right">
            <div className="datepill">
              <Link href={prevHref} className="iconbtn" aria-label="Previous day"><ChevronLeft /></Link>
              <Link href={nextHref} className="iconbtn" aria-label="Next day" aria-disabled={isToday}><ChevronRight /></Link>
            </div>
            <Link href="/settings" className="iconbtn" aria-label="Settings"><Gear /></Link>
          </div>
        </header>

        <GymControls isToday={isToday} sessions={gym}>
          {day.dayType && <DayTypeSelect key={`${date}-${day.dayType}`} date={date} value={day.dayType} manual={day.dayTypeIsManual} auto={autoType ? DAY_LABEL[autoType] : null} />}
          {day.activities.map((a) => (
            <span key={a.id} className="tag tag-act">{activityEmoji(a.name)} {a.name}{a.duration_min != null ? ` · ${a.duration_min}m` : ''}</span>
          ))}
        </GymControls>

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
                <span key={m.id} style={{ flex: `${m.protein} 1 0`, background: MEAL_COLORS[m.meal_type] ?? '#6FA05F' }} />
              ))}
              {protein < pg.target && <span style={{ flex: `${pg.target - protein} 1 0`, background: '#F4F9EF' }} />}
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
          <Link href={isToday ? '/calories' : `/calories?date=${date}`} className="tile t-yellow" aria-label="Calories breakdown">
            <div className="row">
              <h2 className="label">Calories</h2>
              <span className="tilego" aria-hidden><ChevronRight size={14} /></span>
            </div>
            <div>
              <div className="big">{kcal(calories)}</div>
              <div className="small ink2">of {kcal(kMin)}–{kcal(kMax)} · {kStatus}</div>
            </div>
          </Link>
          <section className="tile t-peach">
            <h2 className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Flame color="#7B3014" /> Streak</h2>
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

        <LogBox date={date} today={today} unit={unit} />

        {/* Meals */}
        <section className="card" aria-label="Meals">
          <div className="mrow" style={{ paddingBottom: 6, alignItems: 'baseline' }}>
            <h2 className="h2">Meals</h2>
            <span className="colhead num">prot</span>
            <span className="colhead num">kcal</span>
            <span />
          </div>
          {day.meals.length === 0 && <p className="empty">Nothing logged yet. Tell the box above what you ate.</p>}
          {day.meals.map((m) => (
            <div className="meal" key={m.id}>
              <div className="mrow meal-head">
                <span className="meal-name"><i className="dot" style={{ background: MEAL_COLORS[m.meal_type] }} />{cap(m.meal_type)}</span>
                <strong className="num">{Math.round(m.protein)}g</strong>
                <strong className="num">{kcal(m.calories)}</strong>
                <DeleteButton kind="meal" id={m.id} label={`this ${m.meal_type}`} />
              </div>
              {m.items.map((f) => (
                <div className="item mrow" key={f.id} title={f.fdc_description ?? 'Estimated'}>
                  <span style={{ minWidth: 0 }}>
                    {f.name}
                    {f.quantity != null && <span className="muted"> · {qty(f.quantity)} {f.unit ?? ''}</span>}
                    {f.source === 'estimate' && <span className="src src-estimate">est.</span>}
                  </span>
                  <span className="num">{num(f.protein_g)}g</span>
                  <span className="num muted">{kcal(f.calories)}</span>
                  <span />
                </div>
              ))}
            </div>
          ))}
        </section>

        {/* Training */}
        <section className="card" aria-label="Training" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row-base">
            <h2 className="h2">Training</h2>
            {day.setCount > 0 && <span className="small muted">{day.setCount} sets</span>}
          </div>
          {day.cards.length + day.activities.length === 0 ? (
            <p className="empty" style={{ margin: 0, paddingTop: 0 }}>
              Nothing yet. Paste your workout, log exercises as you go, or say something like &quot;played tennis for an hour&quot;.
            </p>
          ) : (
            <TrainingCards date={date} cards={day.cards} activities={day.activities} unit={unit} />
          )}
        </section>

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
          <section className="tile t-purple" style={{ justifyContent: 'flex-start', gap: 12 }}>
            <h2 className="label">Workouts this week</h2>
            <div className="big" style={{ fontSize: 44 }}>{trainingDays}<span className="of"> / {workoutGoal}</span></div>
            <div className="segs" aria-hidden>
              {Array.from({ length: Math.max(workoutGoal, trainingDays) }, (_, i) => (
                <span key={i} style={{ height: 10, background: i < trainingDays ? 'var(--purple-ink)' : '#fff' }} />
              ))}
            </div>
            <div className="small ink2">{workoutStreak} week streak</div>
          </section>
          <section className="tile t-white" style={{ justifyContent: 'flex-start', gap: 2 }}>
            <h2 className="label" style={{ marginBottom: 6 }}>Habits</h2>
            {day.habits.map((h) => (
              <HabitButton key={`${h.key}-${date}`} habitKey={h.key} name={h.name} emoji={h.emoji} date={date} done={h.done} />
            ))}
            <DerivedHabit emoji="🥚" name={`${pMin}g+ protein`} done={protein >= pMin} />
            <DerivedHabit emoji="🏋️" name="Weekly workouts" done={trainingDays >= workoutGoal} />
          </section>
        </div>
      </main>
      <Nav current="/" />
    </>
  );
}
