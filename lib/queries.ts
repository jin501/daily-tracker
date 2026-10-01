import { db } from './db';
import { MEAL_ORDER } from './format';
import { ensureMovements, type Category } from './movements';
import { dayTypeFromCounts, emptyCounts, isDayType, type DayType } from './daytype';
import { closeStale, sessionsOn, type GymSession } from './gym';

export type FoodRow = {
  id: number; name: string; quantity: number | null; unit: string | null; grams: number | null;
  protein_g: number; calories: number; source: string; fdc_description: string | null;
};
export type MealRow = { id: number; meal_type: string; items: FoodRow[]; protein: number; calories: number };

export type SetRow = {
  id: number; workout_id: number; position: number; set_index: number;
  weight_kg: number | null; weight_input: number | null; weight_unit: string | null;
  reps: number | null; duration_s: number | null; distance_m: number | null; superset: string | null;
  exercise_id: number; variation: string; movement_id: number | null; movement: string; category: Category;
};

/** One card per core movement per day, however many times it was logged. */
export type ExerciseCard = {
  kind: 'exercise'; key: string; movement: string; movementId: number | null; category: Category;
  groups: { variation: string; sets: SetRow[] }[]; setCount: number;
};
/** Exercises done as a superset stay together on one card. */
export type SupersetCard = {
  kind: 'superset'; key: string; workoutId: number; letter: string; category: Category;
  members: { movement: string; variation: string; category: Category; sets: SetRow[] }[]; setCount: number;
};
export type TrainingCard = ExerciseCard | SupersetCard;

export type ActivityRow = { id: number; name: string; duration_min: number | null; distance_km: number | null; notes: string | null };
export type HabitRow = { key: string; name: string; emoji: string | null; color: string; done: boolean };

const SET_COLS = (sql: ReturnType<typeof db>) => sql`
  s.id, s.workout_id, s.position, s.set_index, s.weight_kg, s.weight_input, s.weight_unit,
  s.reps, s.duration_s, s.distance_m, s.superset,
  ei.exercise_id, ei.variation, ei.movement_id, ei.movement, ei.category`;

export function buildCards(sets: SetRow[]): TrainingCard[] {
  const cards = new Map<string, TrainingCard>();
  for (const s of sets) {
    if (s.superset) {
      const key = `ss:${s.workout_id}:${s.superset}`;
      let c = cards.get(key) as SupersetCard | undefined;
      if (!c) {
        c = { kind: 'superset', key, workoutId: s.workout_id, letter: s.superset, category: s.category, members: [], setCount: 0 };
        cards.set(key, c);
      }
      let m = c.members.find((x) => x.variation === s.variation);
      if (!m) c.members.push((m = { movement: s.movement, variation: s.variation, category: s.category, sets: [] }));
      m.sets.push(s);
      c.setCount++;
    } else {
      const key = `m:${s.movement.toLowerCase()}`;
      let c = cards.get(key) as ExerciseCard | undefined;
      if (!c) {
        c = { kind: 'exercise', key, movement: s.movement, movementId: s.movement_id, category: s.category, groups: [], setCount: 0 };
        cards.set(key, c);
      }
      let g = c.groups.find((x) => x.variation === s.variation);
      if (!g) c.groups.push((g = { variation: s.variation, sets: [] }));
      g.sets.push(s);
      c.setCount++;
    }
  }
  // a superset takes the category of its members when they agree, else it's full body
  for (const c of cards.values()) {
    if (c.kind === 'superset') {
      const cats = new Set(c.members.map((m) => m.category).filter((x) => x !== 'abs'));
      c.category = cats.size === 1 ? [...cats][0] : cats.size === 0 ? 'abs' : 'full_body';
    }
  }
  return [...cards.values()];
}

export async function getDay(date: string) {
  const sql = db();
  await Promise.all([ensureMovements(), closeStale()]);
  const [meals, sets, activities, habits, override, gym] = await Promise.all([
    sql<{ id: number; meal_type: string; items: FoodRow[] }[]>`
      select m.id, m.meal_type,
        coalesce(json_agg(json_build_object(
          'id', fi.id, 'name', fi.name, 'quantity', fi.quantity, 'unit', fi.unit, 'grams', fi.grams,
          'protein_g', fi.protein_g, 'calories', fi.calories, 'source', fi.source, 'fdc_description', fi.fdc_description
        ) order by fi.id) filter (where fi.id is not null), '[]') as items
      from meals m left join food_items fi on fi.meal_id = m.id
      where m.local_date = ${date}
      group by m.id order by m.created_at`,
    sql<SetRow[]>`
      select ${SET_COLS(sql)}
      from workouts w
      join workout_sets s on s.workout_id = w.id
      join exercise_info ei on ei.exercise_id = s.exercise_id
      where w.local_date = ${date}
      order by w.created_at, w.id, s.position, s.set_index`,
    sql<ActivityRow[]>`
      select id, name, duration_min, distance_km, notes from activities
      where local_date = ${date} order by created_at`,
    sql<HabitRow[]>`
      select h.key, h.name, h.emoji, h.color, coalesce(hl.done, false) as done
      from habits h left join habit_logs hl on hl.habit_id = h.id and hl.local_date = ${date}
      where h.active order by h.sort, h.id`,
    sql<{ day_type: string }[]>`select day_type from day_types where local_date = ${date}`,
    sessionsOn(date),
  ]);

  const mealRows: MealRow[] = meals
    .map((m) => ({
      ...m,
      protein: m.items.reduce((a, i) => a + Number(i.protein_g), 0),
      calories: m.items.reduce((a, i) => a + Number(i.calories), 0),
    }))
    .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type as never) - MEAL_ORDER.indexOf(b.meal_type as never));

  const counts = emptyCounts();
  for (const s of sets) counts[s.category]++;
  const autoType = dayTypeFromCounts(counts);
  const manual = override[0]?.day_type;
  const dayType: DayType | null = isDayType(manual) ? manual : autoType;

  return {
    meals: mealRows,
    cards: buildCards(sets),
    setCount: sets.length,
    activities,
    habits,
    dayType,
    dayTypeIsManual: isDayType(manual),
    gym: gym as GymSession[],
  };
}

/** Ab sets by movement for one day, e.g. [{name:'Cable Crunch', sets:3}] */
export async function abBreakdown(date: string) {
  return db()<{ name: string; sets: number }[]>`
    select ei.movement as name, count(*)::int as sets
    from workouts w join workout_sets s on s.workout_id = w.id join exercise_info ei on ei.exercise_id = s.exercise_id
    where w.local_date = ${date} and ei.category = 'abs'
    group by ei.movement order by min(w.created_at), min(s.position)`;
}

export async function lastDateOf(metric: 'ab'): Promise<string | null> {
  if (metric === 'ab') {
    const [r] = await db()<{ d: string | null }[]>`
      select max(w.local_date) as d
      from workouts w join workout_sets s on s.workout_id = w.id join exercise_info ei on ei.exercise_id = s.exercise_id
      where ei.category = 'abs'`;
    return r?.d ?? null;
  }
  return null;
}

// ---------- lifts ----------

export type MovementSummary = {
  id: number; name: string; category: Category; last: string; sessions: number;
  variations: { id: number; name: string; last: string; sessions: number }[];
};

export async function listMovements(): Promise<MovementSummary[]> {
  await ensureMovements();
  const rows = await db()<{ mid: number; mname: string; category: Category; eid: number; ename: string; last: string; sessions: number }[]>`
    select m.id as mid, m.name as mname, m.category, e.id as eid, e.name as ename,
      max(w.local_date) as last, count(distinct w.local_date)::int as sessions
    from movements m
    join exercises e on e.movement_id = m.id
    join workout_sets s on s.exercise_id = e.id
    join workouts w on w.id = s.workout_id
    group by m.id, e.id
    order by max(w.local_date) desc, e.name`;
  const map = new Map<number, MovementSummary>();
  for (const r of rows) {
    let m = map.get(r.mid);
    if (!m) map.set(r.mid, (m = { id: r.mid, name: r.mname, category: r.category, last: r.last, sessions: 0, variations: [] }));
    m.variations.push({ id: r.eid, name: r.ename, last: r.last, sessions: r.sessions });
    if (r.last > m.last) m.last = r.last;
  }
  const out = [...map.values()];
  // sessions per movement = distinct days any variation was done
  const days = await db()<{ mid: number; n: number }[]>`
    select e.movement_id as mid, count(distinct w.local_date)::int as n
    from exercises e join workout_sets s on s.exercise_id = e.id join workouts w on w.id = s.workout_id
    group by e.movement_id`;
  for (const m of out) m.sessions = days.find((d) => d.mid === m.id)?.n ?? 0;
  return out.sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : a.name.localeCompare(b.name)));
}

export async function allMovements() {
  return db()<{ id: number; name: string; category: Category }[]>`select id, name, category from movements order by lower(name)`;
}

export type Session = { date: string; sets: SetRow[] };

/** A variation's sessions, one per day (sets from several logs that day are merged). Oldest first. */
export async function variationSessions(exerciseId: number, limit = 8): Promise<Session[]> {
  const sql = db();
  const rows = await sql<(SetRow & { date: string })[]>`
    select w.local_date as date, ${SET_COLS(sql)}
    from workout_sets s join workouts w on w.id = s.workout_id join exercise_info ei on ei.exercise_id = s.exercise_id
    where s.exercise_id = ${exerciseId} and w.local_date in (
      select distinct w2.local_date from workouts w2 join workout_sets s2 on s2.workout_id = w2.id
      where s2.exercise_id = ${exerciseId} order by w2.local_date desc limit ${limit}
    )
    order by w.local_date, w.created_at, s.position, s.set_index`;
  const map = new Map<string, Session>();
  for (const r of rows) {
    if (!map.has(r.date)) map.set(r.date, { date: r.date, sets: [] });
    map.get(r.date)!.sets.push(r);
  }
  return [...map.values()];
}

export async function variationPR(exerciseId: number): Promise<number | null> {
  const [r] = await db()<{ max: number | null }[]>`select max(weight_kg) as max from workout_sets where exercise_id = ${exerciseId}`;
  return r?.max ?? null;
}
