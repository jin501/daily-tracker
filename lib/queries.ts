import { db } from './db';
import { MEAL_ORDER } from './format';

export type FoodRow = {
  id: number; name: string; quantity: number | null; unit: string | null; grams: number | null;
  protein_g: number; calories: number; source: string; fdc_description: string | null;
};
export type MealRow = { id: number; meal_type: string; items: FoodRow[]; protein: number; calories: number };
export type SetRow = {
  exercise: string; tags: string[]; position: number; set_index: number;
  weight_kg: number | null; reps: number | null; duration_s: number | null; distance_m: number | null; superset: string | null;
};
export type ExerciseGroup = { name: string; tags: string[]; superset: string | null; sets: SetRow[] };
export type WorkoutRow = { id: number; title: string | null; notes: string | null; exercises: ExerciseGroup[] };
export type ActivityRow = { id: number; name: string; duration_min: number | null; distance_km: number | null; notes: string | null };
export type HabitRow = { key: string; name: string; color: string; done: boolean };

export async function getDay(date: string) {
  const sql = db();
  const [meals, workouts, activities, habits] = await Promise.all([
    sql<{ id: number; meal_type: string; items: FoodRow[] }[]>`
      select m.id, m.meal_type,
        coalesce(json_agg(json_build_object(
          'id', fi.id, 'name', fi.name, 'quantity', fi.quantity, 'unit', fi.unit, 'grams', fi.grams,
          'protein_g', fi.protein_g, 'calories', fi.calories, 'source', fi.source, 'fdc_description', fi.fdc_description
        ) order by fi.id) filter (where fi.id is not null), '[]') as items
      from meals m left join food_items fi on fi.meal_id = m.id
      where m.local_date = ${date}
      group by m.id order by m.created_at`,
    sql<{ id: number; title: string | null; notes: string | null; sets: SetRow[] }[]>`
      select w.id, w.title, w.notes,
        coalesce(json_agg(json_build_object(
          'exercise', e.name, 'tags', e.tags, 'position', s.position, 'set_index', s.set_index,
          'weight_kg', s.weight_kg, 'reps', s.reps, 'duration_s', s.duration_s, 'distance_m', s.distance_m, 'superset', s.superset
        ) order by s.position, s.set_index) filter (where s.id is not null), '[]') as sets
      from workouts w
      left join workout_sets s on s.workout_id = w.id
      left join exercises e on e.id = s.exercise_id
      where w.local_date = ${date}
      group by w.id order by w.created_at`,
    sql<ActivityRow[]>`
      select id, name, duration_min, distance_km, notes from activities
      where local_date = ${date} order by created_at`,
    sql<HabitRow[]>`
      select h.key, h.name, h.color, coalesce(hl.done, false) as done
      from habits h left join habit_logs hl on hl.habit_id = h.id and hl.local_date = ${date}
      where h.active order by h.sort, h.id`,
  ]);

  const mealRows: MealRow[] = meals
    .map((m) => ({
      ...m,
      protein: m.items.reduce((a, i) => a + Number(i.protein_g), 0),
      calories: m.items.reduce((a, i) => a + Number(i.calories), 0),
    }))
    .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type as never) - MEAL_ORDER.indexOf(b.meal_type as never));

  const workoutRows: WorkoutRow[] = workouts.map((w) => ({
    id: w.id,
    title: w.title,
    notes: w.notes,
    exercises: groupSets(w.sets),
  }));

  return { meals: mealRows, workouts: workoutRows, activities, habits };
}

export function groupSets(sets: SetRow[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  let lastPos = -1;
  for (const s of sets) {
    if (s.position !== lastPos || !groups.length) {
      groups.push({ name: s.exercise, tags: s.tags, superset: s.superset, sets: [] });
      lastPos = s.position;
    }
    groups[groups.length - 1].sets.push(s);
  }
  return groups;
}

/** Ab sets by exercise for one day, e.g. [{name:'Cable Crunch', sets:3}] */
export async function abBreakdown(date: string) {
  return db()<{ name: string; sets: number }[]>`
    select e.name, count(*)::int as sets
    from workouts w join workout_sets s on s.workout_id = w.id join exercises e on e.id = s.exercise_id
    where w.local_date = ${date} and 'abs' = any(e.tags)
    group by e.name order by min(s.position)`;
}

export async function lastDateOf(metric: 'ab'): Promise<string | null> {
  if (metric === 'ab') {
    const [r] = await db()<{ d: string | null }[]>`
      select max(w.local_date) as d
      from workouts w join workout_sets s on s.workout_id = w.id join exercises e on e.id = s.exercise_id
      where 'abs' = any(e.tags)`;
    return r?.d ?? null;
  }
  return null;
}

// ---------- lifts ----------

export type ExerciseSummary = {
  id: number; name: string; tags: string[]; last: string; sessions: number;
  top_weight: number | null; top_reps: number | null; top_distance: number | null; top_duration: number | null;
};

export async function listExercises(): Promise<ExerciseSummary[]> {
  return db()<ExerciseSummary[]>`
    with latest as (
      select distinct on (s.exercise_id) s.exercise_id, s.weight_kg, s.reps, s.distance_m, s.duration_s
      from workout_sets s join workouts w on w.id = s.workout_id
      order by s.exercise_id, w.local_date desc, w.id desc, s.weight_kg desc nulls last, s.reps desc nulls last
    )
    select e.id, e.name, e.tags, max(w.local_date) as last, count(distinct w.id)::int as sessions,
      l.weight_kg as top_weight, l.reps as top_reps, l.distance_m as top_distance, l.duration_s as top_duration
    from exercises e
    join workout_sets s on s.exercise_id = e.id
    join workouts w on w.id = s.workout_id
    left join latest l on l.exercise_id = e.id
    group by e.id, l.weight_kg, l.reps, l.distance_m, l.duration_s
    order by max(w.local_date) desc, e.name`;
}

export type Session = {
  workout_id: number; date: string;
  sets: { set_index: number; weight_kg: number | null; reps: number | null; duration_s: number | null; distance_m: number | null }[];
};

export async function exerciseSessions(exerciseId: number, limit = 8): Promise<Session[]> {
  const rows = await db()<(Session['sets'][number] & { workout_id: number; date: string })[]>`
    select w.id as workout_id, w.local_date as date, s.set_index, s.weight_kg, s.reps, s.duration_s, s.distance_m
    from workout_sets s join workouts w on w.id = s.workout_id
    where s.exercise_id = ${exerciseId} and w.id in (
      select w2.id from workouts w2 join workout_sets s2 on s2.workout_id = w2.id
      where s2.exercise_id = ${exerciseId}
      group by w2.id order by max(w2.local_date) desc, w2.id desc limit ${limit}
    )
    order by w.local_date, w.id, s.position, s.set_index`;
  const map = new Map<number, Session>();
  for (const r of rows) {
    if (!map.has(r.workout_id)) map.set(r.workout_id, { workout_id: r.workout_id, date: r.date, sets: [] });
    map.get(r.workout_id)!.sets.push(r);
  }
  return [...map.values()];
}

export async function exercisePR(exerciseId: number): Promise<number | null> {
  const [r] = await db()<{ max: number | null }[]>`select max(weight_kg) as max from workout_sets where exercise_id = ${exerciseId}`;
  return r?.max ?? null;
}
