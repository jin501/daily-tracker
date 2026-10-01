/**
 * Workout suggestions from your own history. No AI guessing here: it reads
 * the last 12 weeks of sets and applies simple, explainable rules, so it
 * gets better as more weeks are logged.
 *
 * - Day type: whichever of upper / lower / full body is most overdue relative
 *   to how often you usually do it (unless you ask for one).
 * - Exercises: the movements you do most on that kind of day, favoring ones
 *   you haven't done lately; count matches your usual session size.
 * - Targets (double progression): hit the top of your usual rep range on every
 *   set -> add weight. Otherwise same weight, beat last time's reps. Three
 *   sessions stuck -> a nudge to change something.
 * - Abs: adds ab work when you're behind on the weekly ab-set goal.
 */
import { db } from './db';
import { addDays, fmt, todayLocal, weekStart } from './dates';
import { DAY_LABEL, dayTypeFromCounts, emptyCounts, isDayType, type DayType } from './daytype';
import type { Category } from './categories';
import { increment, weightIn, type WUnit } from './units';
import { daily, getGoals } from './metrics';
import { num } from './format';

type HSet = {
  date: string; exercise_id: number; variation: string; movement: string; category: Category; tags: string[];
  weight_kg: number | null; weight_input: number | null; weight_unit: string | null;
  reps: number | null; duration_s: number | null; distance_m: number | null;
};
type Day = { date: string; sets: HSet[]; type: DayType | null; movements: Set<string> };

export type PlanItem = {
  movement: string; variation: string; category: Category;
  sets: number; target: string; why: string; last: string | null; logLine: string;
};
export type WorkoutPlan = {
  ready: boolean;
  progress: { days: number; weeks: number; needDays: number; needWeeks: number };
  dayType: DayType | null;
  label: string;
  basedOn: number;
  items: PlanItem[];
  abs: PlanItem[];
  notes: string[];
  unit: WUnit;
};
export type CoachOptions = { dayType: DayType | null; minutes: number | null; avoid: string[]; focusTags: string[]; includeAbs: boolean | null };

const NEED_DAYS = 6;
const NEED_WEEKS = 3;
const POOL: Record<DayType, Category[]> = {
  upper: ['upper'],
  lower: ['lower'],
  full_body: ['upper', 'lower', 'full_body'],
  abs: ['abs'],
  cardio: ['cardio'],
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};

export async function planWorkout(opts: CoachOptions, unit: WUnit): Promise<WorkoutPlan> {
  const today = todayLocal();
  const from = addDays(today, -84);
  const sql = db();
  const [rows, overrides, goals, abWeek] = await Promise.all([
    sql<HSet[]>`
      select w.local_date as date, ei.exercise_id, ei.variation, ei.movement, ei.category, ei.tags,
        s.weight_kg, s.weight_input, s.weight_unit, s.reps, s.duration_s, s.distance_m
      from workouts w join workout_sets s on s.workout_id = w.id join exercise_info ei on ei.exercise_id = s.exercise_id
      where w.local_date between ${from} and ${today}
      order by w.local_date, w.created_at, s.position, s.set_index`,
    sql<{ local_date: string; day_type: string }[]>`select local_date, day_type from day_types where local_date between ${from} and ${today}`,
    getGoals(),
    daily('ab_sets', weekStart(today), today),
  ]);

  const doneToday = new Set(rows.filter((r) => r.date === today).map((r) => r.movement));
  const byDate = new Map<string, Day>();
  for (const r of rows.filter((r) => r.date < today)) {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, sets: [], type: null, movements: new Set() });
    const d = byDate.get(r.date)!;
    d.sets.push(r);
    d.movements.add(r.movement);
  }
  const ov = new Map(overrides.map((o) => [o.local_date, o.day_type]));
  const days = [...byDate.values()];
  for (const d of days) {
    const c = emptyCounts();
    for (const s of d.sets) c[s.category]++;
    const o = ov.get(d.date);
    d.type = isDayType(o) ? o : dayTypeFromCounts(c);
  }

  const weeks = new Set(days.map((d) => weekStart(d.date))).size;
  const ready = days.length >= NEED_DAYS && weeks >= NEED_WEEKS;
  const base: WorkoutPlan = {
    ready,
    progress: { days: days.length, weeks, needDays: NEED_DAYS, needWeeks: NEED_WEEKS },
    dayType: null, label: 'Workout', basedOn: 0, items: [], abs: [], notes: [], unit,
  };
  if (!days.length) {
    base.notes.push('Log a few workouts first. Suggestions are built from your own sets, weights and reps.');
    return base;
  }

  // ---- which kind of day ----
  let dayType = opts.dayType;
  if (!dayType) {
    let best: { t: DayType; due: number } | null = null;
    // a day type you've only done once isn't part of your routine yet
    const regular = (['upper', 'lower', 'full_body'] as DayType[]).filter((t) => days.filter((d) => d.type === t).length >= 2);
    const candidates = regular.length ? regular : (['upper', 'lower', 'full_body'] as DayType[]);
    for (const t of candidates) {
      const ds = days.filter((d) => d.type === t).map((d) => d.date);
      if (!ds.length) continue;
      const gap = ds.length > 1 ? daysBetween(ds[0], ds[ds.length - 1]) / (ds.length - 1) : 7;
      const due = daysBetween(ds[ds.length - 1], today) / Math.max(gap, 1);
      if (!best || due > best.due) best = { t, due };
    }
    dayType = best?.t ?? (days.some((d) => d.type === 'abs') ? 'abs' : 'full_body');
  }
  base.dayType = dayType;
  base.label = `${DAY_LABEL[dayType]} plan`;

  const cats = POOL[dayType];
  const typeDays = days.filter((d) => d.type === dayType);
  const pool = typeDays.length ? typeDays : days;
  base.basedOn = typeDays.length;
  if (!typeDays.length) base.notes.push(`No ${DAY_LABEL[dayType].toLowerCase()} logged yet, so this uses those exercises from your other days.`);

  // ---- movement stats ----
  type Stat = { movement: string; category: Category; days: number; last: string; tags: Set<string>; variations: Map<string, { last: string; count: number }> };
  const stats = new Map<string, Stat>();
  const lastAny = new Map<string, string>();
  for (const d of days) for (const s of d.sets) lastAny.set(s.movement, d.date);
  for (const d of pool) {
    const seen = new Set<string>();
    for (const s of d.sets) {
      if (!cats.includes(s.category)) continue;
      let st = stats.get(s.movement);
      if (!st) stats.set(s.movement, (st = { movement: s.movement, category: s.category, days: 0, last: d.date, tags: new Set(), variations: new Map() }));
      if (!seen.has(s.movement)) {
        st.days++;
        seen.add(s.movement);
      }
      st.last = d.date;
      s.tags.forEach((t) => st.tags.add(t));
      const v = st.variations.get(s.variation) ?? { last: d.date, count: 0 };
      v.last = d.date;
      v.count++;
      st.variations.set(s.variation, v);
    }
  }

  const avoid = opts.avoid.map((a) => a.toLowerCase()).filter(Boolean);
  const allowed = (name: string) => !avoid.some((a) => name.toLowerCase().includes(a));
  const pickVariation = (st: Stat) =>
    [...st.variations.entries()].filter(([n]) => allowed(n)).sort((a, b) => (a[1].last < b[1].last ? 1 : a[1].last > b[1].last ? -1 : b[1].count - a[1].count))[0]?.[0];

  const scored = [...stats.values()]
    .filter((st) => !doneToday.has(st.movement) && pickVariation(st))
    .map((st) => {
      let score = st.days / pool.length;
      if (opts.focusTags.some((t) => st.tags.has(t))) score += 0.5;
      const since = daysBetween(lastAny.get(st.movement) ?? st.last, today);
      if (since <= 1) score *= 0.4;
      else score *= 1 + 0.1 * Math.min(since / 7, 2);
      return { st, score };
    })
    .sort((a, b) => b.score - a.score);

  let n = Math.round(median(typeDays.map((d) => [...d.movements].filter((m) => cats.includes(d.sets.find((s) => s.movement === m)!.category)).length))) || 4;
  if (opts.minutes) n = Math.min(n, Math.max(2, Math.floor(opts.minutes / 9)));
  let picks = scored.slice(0, n);
  if (dayType === 'full_body') {
    // keep it actually full body: at least one upper and one lower when you have them
    for (const need of ['upper', 'lower'] as Category[]) {
      if (picks.some((p) => p.st.category === need)) continue;
      const alt = scored.find((p) => p.st.category === need && !picks.includes(p));
      if (alt && picks.length) picks = [...picks.slice(0, -1), alt];
    }
  }

  const sessionsFor = (variation: string) => {
    const map = new Map<string, HSet[]>();
    for (const d of days) for (const s of d.sets) if (s.variation === variation) (map.get(d.date) ?? map.set(d.date, []).get(d.date)!).push(s);
    return [...map.entries()].map(([date, sets]) => ({ date, sets })).slice(-6);
  };

  base.items = picks.map(({ st }) => {
    const variation = pickVariation(st)!;
    return progression(st.movement, variation, st.category, sessionsFor(variation), unit);
  });

  // ---- abs ----
  const abGoal = goals.abs_sets_weekly?.target ?? 12;
  const abDone = [...abWeek.values()].reduce((a, b) => a + b, 0);
  const abLeft = Math.max(0, abGoal - abDone);
  if (dayType !== 'abs' && opts.includeAbs !== false && (abLeft > 0 || opts.includeAbs === true)) {
    const abStats = new Map<string, { movement: string; days: number; variation: string }>();
    for (const d of days) {
      const seen = new Set<string>();
      for (const s of d.sets) {
        if (s.category !== 'abs' || seen.has(s.movement) || doneToday.has(s.movement) || !allowed(s.variation)) continue;
        seen.add(s.movement);
        const a = abStats.get(s.movement) ?? { movement: s.movement, days: 0, variation: s.variation };
        a.days++;
        a.variation = s.variation;
        abStats.set(s.movement, a);
      }
    }
    const abPicks = [...abStats.values()].sort((a, b) => b.days - a.days).slice(0, 2);
    const each = Math.min(4, Math.max(2, Math.ceil((abLeft || 6) / Math.max(abPicks.length, 1))));
    base.abs = abPicks.map((a) => {
      const p = progression(a.movement, a.variation, 'abs', sessionsFor(a.variation), unit);
      return { ...p, sets: each, target: p.target.replace(/^\d+ ×/, `${each} ×`), logLine: p.logLine.replace(/\b\d+x/, `${each}x`) };
    });
    if (abLeft > 0) base.notes.push(`${abLeft} ab set${abLeft === 1 ? '' : 's'} left this week.`);
  }

  if (!ready) {
    base.notes.unshift(
      `Early days: ${days.length} gym day${days.length === 1 ? '' : 's'} over ${weeks} week${weeks === 1 ? '' : 's'} logged. Suggestions get sharper after about ${NEED_WEEKS} weeks.`,
    );
  }
  return base;
}

/** Targets for one variation from its recent sessions (oldest first). */
function progression(movement: string, variation: string, category: Category, sessions: { date: string; sets: HSet[] }[], unit: WUnit): PlanItem {
  const last = sessions[sessions.length - 1];
  const nSets = Math.min(6, Math.max(1, Math.round(median(sessions.map((s) => s.sets.length))))) || 3;
  const w = (s: HSet) => weightIn(s, unit);
  const lastLabel = last
    ? `${last.sets.map((s) => (w(s) != null && s.reps != null ? `${num(w(s)!)}×${s.reps}` : s.reps != null ? `${s.reps}` : s.duration_s != null ? `${s.duration_s}s` : s.distance_m != null ? `${num(s.distance_m, 0)}m` : '✓')).join(', ')} (${fmt(last.date, { month: 'numeric', day: 'numeric' })})`
    : null;
  const item = (target: string, why: string, logLine: string, sets = nSets): PlanItem => ({ movement, variation, category, sets, target, why, last: lastLabel, logLine });

  if (!last) return item(`${nSets} sets`, 'New to your plan.', `${variation} ${nSets}x`);

  const weighted = last.sets.filter((s) => w(s) != null && s.reps != null);
  if (weighted.length) {
    const topW = Math.max(...weighted.map((s) => w(s)!));
    const top = weighted.filter((s) => w(s) === topW);
    const reps = sessions.flatMap((x) => x.sets.filter((s) => w(s) != null && s.reps != null).map((s) => s.reps!));
    const hi = Math.round(pct(reps, 0.75));
    let lo = Math.round(pct(reps, 0.25));
    if (hi - lo < 2) lo = Math.max(1, hi - 2);
    const minTop = Math.min(...top.map((s) => s.reps!));

    const topOf = (x: { sets: HSet[] }) => {
      const ws = x.sets.filter((s) => w(s) != null && s.reps != null);
      if (!ws.length) return null;
      const mw = Math.max(...ws.map((s) => w(s)!));
      return { w: mw, reps: Math.max(...ws.filter((s) => w(s) === mw).map((s) => s.reps!)) };
    };
    const last3 = sessions.slice(-3).map(topOf);
    const stalled = last3.length === 3 && last3.every((t) => t && t.w === last3[0]!.w) && last3[2]!.reps <= last3[0]!.reps;

    if (minTop >= hi && top.length >= Math.min(2, nSets)) {
      const next = topW + increment(unit, category === 'lower');
      return item(`${nSets} × ${lo}–${hi} @ ${num(next)} ${unit}`, `Hit ${hi}+ reps on every set at ${num(topW)} last time, so go up.`, `${variation} ${num(next)}${unit} ${nSets}x${lo}`);
    }
    if (stalled) {
      const sets = Math.min(6, nSets + 1);
      return item(`${sets} × ${lo}–${hi} @ ${num(topW)} ${unit}`, `Stuck at ${num(topW)} for 3 sessions. Add a set and slow the lowering part down.`, `${variation} ${num(topW)}${unit} ${sets}x${lo}`, sets);
    }
    const goal = Math.min(hi, minTop + 1);
    return item(`${nSets} × ${goal} @ ${num(topW)} ${unit}`, `Same weight, aim for ${goal}+ reps each set. Go up once you hit ${hi} on all of them.`, `${variation} ${num(topW)}${unit} ${nSets}x${goal}`);
  }

  const bw = last.sets.filter((s) => s.reps != null);
  if (bw.length) {
    const best = Math.max(...bw.map((s) => s.reps!));
    const avg = bw.reduce((a, s) => a + s.reps!, 0) / bw.length;
    if (avg >= 20) return item(`${nSets} × ${best}`, 'Reps are high. Add weight or a harder variation.', `${variation} ${nSets}x${best}`);
    return item(`${nSets} × ${best + 1}`, `Best set was ${best}. One more rep each set.`, `${variation} ${nSets}x${best + 1}`);
  }
  const timed = last.sets.filter((s) => s.duration_s != null);
  if (timed.length) {
    const best = Math.max(...timed.map((s) => s.duration_s!));
    return item(`${nSets} × ${best + 10}s`, `Longest hold was ${best}s. Add 10 seconds.`, `${variation} ${nSets}x${best + 10}s`);
  }
  const dist = last.sets.find((s) => s.distance_m != null);
  if (dist) return item(`${num(dist.distance_m!, 0)}m`, 'Same distance, a little faster.', `${variation} ${num(dist.distance_m!, 0)}m`);
  return item(`${nSets} sets`, 'Repeat last time.', `${variation} ${nSets}x`);
}
