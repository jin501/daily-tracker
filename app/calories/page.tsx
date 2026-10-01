import Link from 'next/link';
import Nav from '@/components/Nav';
import FoodEdit, { RecheckButton } from '@/components/FoodEdit';
import { getDay } from '@/lib/queries';
import { getGoals } from '@/lib/metrics';
import { fmt, isDate, todayLocal } from '@/lib/dates';
import { MEAL_COLORS, cap, kcal, num, qty } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Calories({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const today = todayLocal();
  const date = isDate(sp.date) && sp.date <= today ? sp.date : today;
  const isToday = date === today;
  const [day, goals] = await Promise.all([getDay(date), getGoals()]);
  const cg = goals.calories_daily;
  const kMin = cg.success_min ?? cg.target;
  const kMax = cg.target;

  const total = Math.round(day.meals.reduce((a, m) => a + m.calories, 0));
  const protein = Math.round(day.meals.reduce((a, m) => a + m.protein, 0));
  const scale = Math.max(kMax * 1.1, total);
  const status = total > kMax ? `${kcal(total - kMax)} over` : total >= kMin ? 'In your range' : `${kcal(kMax - total)} left`;
  const estimated = day.meals.flatMap((m) => m.items).filter((i) => i.source === 'estimate').length;
  const back = isToday ? '/' : `/?date=${date}`;

  return (
    <>
      <main className="page">
        <header className="head">
          <div>
            <Link href={back} className="backlink">Back to {isToday ? 'today' : fmt(date, { weekday: 'long' })}</Link>
            <h1 className="title">Calories</h1>
          </div>
          <span className="small muted" style={{ paddingBottom: 4 }}>{fmt(date, { month: 'short', day: 'numeric' })}</span>
        </header>

        <section className="hero t-yellow" aria-label="Calories today">
          <div className="row">
            <h2 className="label">Eaten</h2>
            <span className="pill">{status}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="huge" style={{ fontSize: 72 }}>{kcal(total)}</span>
            <span className="of">kcal</span>
          </div>
          <div className="kbar-wrap">
            <div className="kbar" role="img" aria-label={`${total} kcal, target ${kMin} to ${kMax}`}>
              {day.meals.filter((m) => m.calories > 0).map((m) => (
                <span key={m.id} style={{ flex: `${m.calories} 1 0`, background: MEAL_COLORS[m.meal_type] ?? '#6FA05F' }} />
              ))}
              {total < scale && <span style={{ flex: `${scale - total} 1 0`, background: '#FFF7D6' }} />}
            </div>
            <div className="band" style={{ left: `${(kMin / scale) * 100}%`, width: `${((kMax - kMin) / scale) * 100}%` }} aria-hidden />
          </div>
          <div className="legend">
            {day.meals.map((m) => (
              <span key={m.id}><i className="dot" style={{ background: MEAL_COLORS[m.meal_type] }} />{cap(m.meal_type)} {kcal(m.calories)}</span>
            ))}
            <span>Target {kcal(kMin)}–{kcal(kMax)}</span>
          </div>
        </section>

        {day.meals.length === 0 && (
          <section className="card"><p className="empty" style={{ margin: 0 }}>No meals logged {isToday ? 'yet today' : 'this day'}.</p></section>
        )}

        {day.meals.map((m) => {
          const share = total ? Math.round((m.calories / total) * 100) : 0;
          return (
            <section className="card" key={m.id} aria-label={`${m.meal_type} calories`}>
              <div className="row" style={{ paddingBottom: 4 }}>
                <span className="meal-name" style={{ fontSize: 17 }}><i className="dot" style={{ background: MEAL_COLORS[m.meal_type] }} />{cap(m.meal_type)}</span>
                <span><strong style={{ fontSize: 17 }}>{kcal(m.calories)}</strong><span className="small muted"> kcal · {share}%</span></span>
              </div>
              <div className="row small muted" style={{ paddingBottom: 6 }}>
                <span>{num(m.protein)}g protein</span>
                <RecheckButton mealId={m.id} />
              </div>
              {m.items.map((f) => (
                <div className="fitem" key={f.id}>
                  <span style={{ minWidth: 0 }}>
                    {f.name}
                    <span className={`src src-${f.source}`}>{f.source === 'usda' ? 'USDA' : f.source === 'manual' ? 'edited' : 'est.'}</span>
                  </span>
                  <FoodEdit id={f.id} calories={Number(f.calories)} protein={Number(f.protein_g)} />
                  <span className="meta">
                    {[f.quantity != null ? `${qty(f.quantity)} ${f.unit ?? ''}`.trim() : null, f.grams != null ? `${num(f.grams, 0)} g` : null, `${num(f.protein_g)}g protein`, f.fdc_description ? `matched: ${f.fdc_description}` : f.source === 'estimate' ? 'AI estimate' : null]
                      .filter(Boolean).join(' · ')}
                  </span>
                </div>
              ))}
            </section>
          );
        })}

        {day.meals.length > 0 && (
          <p className="small muted" style={{ padding: '0 6px', margin: 0 }}>
            {protein}g protein total. USDA numbers are checked against a realistic estimate before they're used{estimated ? `; ${estimated} item${estimated === 1 ? ' is' : 's are'} marked est. because no USDA match agreed` : ''}. Tap any number to fix it, or Recheck a meal logged before this update.
          </p>
        )}
      </main>
      <Nav current="/" />
    </>
  );
}
