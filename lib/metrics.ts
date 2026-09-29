/**
 * Metrics registry.
 *
 * Every number the UI shows comes from here: a metric knows how to produce a
 * value per day, and everything else (weeks, months, streaks, goal status) is
 * derived generically. Adding a stat to a screen = adding one entry below.
 * Screens never write their own SQL for totals.
 */
import { db } from './db';
import { addDays, eachDay, weekStart } from './dates';

export type Daily = Map<string, number>;
export type Bucket = 'day' | 'week' | 'month';

type MetricDef = {
  label: string;
  unit: string;
  daily: (from: string, to: string) => Promise<Daily>;
};

async function toMap(rows: Promise<readonly { d: string; v: number }[]>): Promise<Daily> {
  const m: Daily = new Map();
  for (const r of await rows) m.set(r.d, Number(r.v));
  return m;
}

const registry: Record<string, MetricDef> = {
  protein_g: {
    label: 'Protein',
    unit: 'g',
    daily: (f, t) => toMap(db()`
      select m.local_date as d, sum(fi.protein_g)::float8 as v
      from meals m join food_items fi on fi.meal_id = m.id
      where m.local_date between ${f} and ${t} group by 1`),
  },
  calories: {
    label: 'Calories',
    unit: 'kcal',
    daily: (f, t) => toMap(db()`
      select m.local_date as d, sum(fi.calories)::float8 as v
      from meals m join food_items fi on fi.meal_id = m.id
      where m.local_date between ${f} and ${t} group by 1`),
  },
  /** Any workout or activity (tennis, runs...) that day. Counts toward the weekly goal. */
  training_days: {
    label: 'Workout days',
    unit: 'days',
    daily: (f, t) => toMap(db()`
      select d, 1::float8 as v from (
        select local_date as d from workouts where local_date between ${f} and ${t}
        union select local_date from activities where local_date between ${f} and ${t}
      ) x group by d`),
  },
  /** Days with non-ab lifting or an activity. Used for calendar colors. */
  regular_days: {
    label: 'Regular workout days',
    unit: 'days',
    daily: (f, t) => toMap(db()`
      select d, 1::float8 as v from (
        select w.local_date as d
        from workouts w join workout_sets s on s.workout_id = w.id join exercises e on e.id = s.exercise_id
        where w.local_date between ${f} and ${t} and not ('abs' = any(e.tags))
        union select local_date from activities where local_date between ${f} and ${t}
      ) x group by d`),
  },
  ab_sets: {
    label: 'Ab sets',
    unit: 'sets',
    daily: (f, t) => toMap(db()`
      select w.local_date as d, count(*)::float8 as v
      from workouts w join workout_sets s on s.workout_id = w.id join exercises e on e.id = s.exercise_id
      where w.local_date between ${f} and ${t} and 'abs' = any(e.tags) group by 1`),
  },
  ab_days: {
    label: 'Ab days',
    unit: 'days',
    daily: async (f, t) => {
      const sets = await registry.ab_sets.daily(f, t);
      return new Map([...sets].filter(([, v]) => v > 0).map(([d]) => [d, 1]));
    },
  },
};

/** 'habit:vitamins', 'habit:poop', ... resolve dynamically from the habits table. */
function habitMetric(key: string): MetricDef {
  return {
    label: key,
    unit: 'days',
    daily: (f, t) => toMap(db()`
      select hl.local_date as d, 1::float8 as v
      from habit_logs hl join habits h on h.id = hl.habit_id
      where h.key = ${key} and hl.done and hl.local_date between ${f} and ${t}`),
  };
}

export function getMetric(id: string): MetricDef | null {
  if (id.startsWith('habit:')) return habitMetric(id.slice(6));
  return registry[id] ?? null;
}

export const metricIds = () => Object.keys(registry);

export async function daily(id: string, from: string, to: string): Promise<Daily> {
  const m = getMetric(id);
  if (!m) throw new Error(`Unknown metric: ${id}`);
  return m.daily(from, to);
}

const bucketKey = (d: string, b: Bucket) => (b === 'day' ? d : b === 'week' ? weekStart(d) : `${d.slice(0, 7)}-01`);

/** Values rolled up by day/week/month, zero-filled. */
export async function series(id: string, from: string, to: string, bucket: Bucket) {
  const values = await daily(id, from, to);
  const out = new Map<string, number>();
  for (const d of eachDay(from, to)) {
    const k = bucketKey(d, bucket);
    out.set(k, (out.get(k) ?? 0) + (values.get(d) ?? 0));
  }
  return [...out].map(([start, value]) => ({ start, value }));
}

// ---------- goals ----------

export type Goal = { key: string; label: string; target: number; success_min: number | null; period: 'day' | 'week' };

export async function getGoals(): Promise<Record<string, Goal>> {
  const rows = await db()<Goal[]>`select key, label, target, success_min, period from goals`;
  const out: Record<string, Goal> = {};
  for (const r of rows) out[r.key] = r;
  // sensible fallbacks if the seed wasn't run
  out.protein_daily ??= { key: 'protein_daily', label: 'Protein', target: 130, success_min: 110, period: 'day' };
  out.workouts_weekly ??= { key: 'workouts_weekly', label: 'Workouts per week', target: 4, success_min: null, period: 'week' };
  out.abs_sets_weekly ??= { key: 'abs_sets_weekly', label: 'Ab sets per week', target: 12, success_min: null, period: 'week' };
  return out;
}

export type DayStatus = 'goal' | 'counted' | 'miss';

export function status(value: number, goal: Goal): DayStatus {
  if (value >= goal.target) return 'goal';
  if (value >= (goal.success_min ?? goal.target)) return 'counted';
  return 'miss';
}

// ---------- streaks ----------

/**
 * Consecutive days ending at `end` where ok(value) is true.
 * If `end` itself isn't done yet it doesn't break the streak (the day is still in progress).
 */
export function dailyStreak(values: Daily, end: string, ok: (v: number) => boolean, maxDays = 400): number {
  let d = end;
  if (!ok(values.get(d) ?? 0)) d = addDays(d, -1);
  let n = 0;
  while (n < maxDays && ok(values.get(d) ?? 0)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Longest run inside the given ordered list of days. */
export function bestRun(days: string[], values: Daily, ok: (v: number) => boolean): number {
  let best = 0;
  let cur = 0;
  for (const d of days) {
    cur = ok(values.get(d) ?? 0) ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

/** Consecutive weeks hitting `target`, ending with the week containing `today` (in-progress week doesn't break it). */
export async function weeklyStreak(metricId: string, target: number, today: string, maxWeeks = 104): Promise<number> {
  const thisWeek = weekStart(today);
  const from = addDays(thisWeek, -7 * maxWeeks);
  const weeks = new Map((await series(metricId, from, today, 'week')).map((w) => [w.start, w.value]));
  let w = thisWeek;
  if ((weeks.get(w) ?? 0) < target) w = addDays(w, -7);
  let n = 0;
  while (n < maxWeeks && (weeks.get(w) ?? 0) >= target) {
    n++;
    w = addDays(w, -7);
  }
  return n;
}
