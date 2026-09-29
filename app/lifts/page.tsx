import Link from 'next/link';
import Nav from '@/components/Nav';
import { exercisePR, exerciseSessions, listExercises, type Session } from '@/lib/queries';
import { est1RM, num, setLabel } from '@/lib/format';
import { fmt } from '@/lib/dates';

export const dynamic = 'force-dynamic';

type Top = { value: number; label: string; kg: number | null; reps: number | null };

/** The session's best set: heaviest weight (then reps), else longest distance, else most reps. */
function topOf(s: Session): Top {
  const weighted = s.sets.filter((x) => x.weight_kg != null);
  if (weighted.length) {
    const b = weighted.reduce((a, x) => (x.weight_kg! > a.weight_kg! || (x.weight_kg === a.weight_kg && (x.reps ?? 0) > (a.reps ?? 0)) ? x : a));
    return { value: b.weight_kg!, label: setLabel(b, true), kg: b.weight_kg, reps: b.reps };
  }
  const dist = s.sets.filter((x) => x.distance_m != null);
  if (dist.length) {
    const b = dist.reduce((a, x) => (x.distance_m! > a.distance_m! ? x : a));
    return { value: b.distance_m!, label: setLabel(b), kg: null, reps: null };
  }
  const b = s.sets.reduce((a, x) => ((x.reps ?? 0) > (a.reps ?? 0) ? x : a));
  return { value: b.reps ?? 0, label: setLabel(b), kg: null, reps: b.reps };
}

export default async function Lifts({ searchParams }: { searchParams: Promise<{ ex?: string }> }) {
  const sp = await searchParams;
  const exercises = await listExercises();
  const selected = exercises.find((e) => String(e.id) === sp.ex) ?? exercises[0];

  if (!selected) {
    return (
      <>
        <main className="page">
          <header className="head"><h1 className="title">Lifts</h1></header>
          <section className="card">
            <h2 className="h2">No lifts yet</h2>
            <p className="empty">Log a workout on Today, like your usual "Lat pulldown 25kg 15 reps" list, and every exercise shows up here with its progress.</p>
          </section>
        </main>
        <Nav current="/lifts" />
      </>
    );
  }

  const [sessions, pr] = await Promise.all([exerciseSessions(selected.id, 8), exercisePR(selected.id)]);
  const tops = sessions.map((s) => ({ s, top: topOf(s) }));
  const latest = tops[tops.length - 1];
  const max = Math.max(...tops.map((t) => t.top.value), 1);
  const isPR = latest.top.kg != null && pr != null && latest.top.kg >= pr && tops.length > 1;
  const volume = latest.s.sets.reduce((a, x) => a + (x.weight_kg ?? 0) * (x.reps ?? 0), 0);
  const oneRM = latest.top.kg != null && latest.top.reps ? est1RM(latest.top.kg, latest.top.reps) : null;
  const unitWord = latest.top.kg != null ? 'kg' : latest.s.sets.some((x) => x.distance_m != null) ? 'm' : 'reps';

  return (
    <>
      <main className="page">
        <header className="head"><h1 className="title">Lifts</h1></header>

        <nav className="chiprow" aria-label="Exercises">
          {exercises.map((e) => (
            <Link key={e.id} href={`/lifts?ex=${e.id}`} aria-current={e.id === selected.id}>{e.name}</Link>
          ))}
        </nav>

        <section className="hero t-purple" aria-label={`${selected.name} progress`}>
          <div className="row">
            <h2 className="label">Top set, last {tops.length} session{tops.length === 1 ? '' : 's'}</h2>
            {isPR && <span className="pill pill-purple">PR</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="huge" style={{ fontSize: 72 }}>{latest.top.kg != null ? num(latest.top.kg) : num(latest.top.value, 0)}</span>
            <span className="of" style={{ fontSize: 26 }}>
              {latest.top.kg != null ? `kg × ${latest.top.reps ?? '?'}` : unitWord}
            </span>
          </div>
          <div className="bars" style={{ height: 130, justifyContent: tops.length < 5 ? 'flex-start' : undefined }}>
            {tops.map(({ s, top }, i) => (
              <div className="col" key={s.workout_id}>
                <div style={{ height: `${Math.max(6, (top.value / max) * 90)}px`, background: i === tops.length - 1 ? 'var(--purple-ink)' : 'var(--purple-mid)' }} />
                <span className="v" style={{ color: 'var(--purple-ink)' }}>{num(top.value)}</span>
                <span className="k" style={{ color: 'var(--purple-ink)' }}>{fmt(s.date, { month: 'numeric', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </section>

        {latest.top.kg != null && (
          <div className="grid2">
            <section className="tile t-yellow">
              <h2 className="label">Est. 1RM</h2>
              <div>
                <div className="big" style={{ fontSize: 36, whiteSpace: 'nowrap' }}>{oneRM ? num(oneRM) : '—'}<span className="of" style={{ fontSize: 20 }}> kg</span></div>
                <div className="small ink2">from {latest.top.label}</div>
              </div>
            </section>
            <section className="tile t-blue">
              <h2 className="label">Volume {fmt(latest.s.date, { month: 'numeric', day: 'numeric' })}</h2>
              <div>
                <div className="big" style={{ fontSize: 36, whiteSpace: 'nowrap' }}>{Math.round(volume).toLocaleString()}<span className="of" style={{ fontSize: 20 }}> kg</span></div>
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
            <div className="row" key={i} style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
              <span className="muted">Set {i + 1}</span>
              <strong>{setLabel(x, true)}</strong>
            </div>
          ))}
        </section>

        <section className="card">
          <h2 className="h2" style={{ paddingBottom: 8 }}>All exercises</h2>
          {exercises.map((e) => (
            <Link key={e.id} href={`/lifts?ex=${e.id}`} className="listlink">
              <span>
                {e.name}
                {e.tags.includes('abs') && <span className="src" style={{ background: 'var(--abs-light)', color: 'var(--blue-ink)' }}>abs</span>}
              </span>
              <span className="small muted">
                {setLabel({ weight_kg: e.top_weight, reps: e.top_reps, distance_m: e.top_distance, duration_s: e.top_duration }, true)}
              </span>
            </Link>
          ))}
        </section>
      </main>
      <Nav current="/lifts" />
    </>
  );
}
