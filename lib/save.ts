import type postgres from 'postgres';
import { db } from './db';
import type { Draft } from './draft';

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

async function upsertExercise(tx: postgres.TransactionSql, name: string, asWritten: string | null, tags: string[]) {
  const [found] = await tx<{ id: number; aliases: string[] }[]>`
    select id, aliases from exercises
    where lower(name) = lower(${name})
       or exists (select 1 from unnest(aliases) a where lower(a) = lower(${name}))
    limit 1`;
  const alias = asWritten && asWritten.toLowerCase() !== name.toLowerCase() ? asWritten : null;
  if (found) {
    await tx`
      update exercises set
        tags = (select array(select distinct unnest(tags || ${tags}::text[]))),
        aliases = case when ${alias}::text is null or ${alias}::text = any(aliases) then aliases else aliases || ${alias}::text end
      where id = ${found.id}`;
    return found.id;
  }
  const [row] = await tx<{ id: number }[]>`
    insert into exercises (name, aliases, tags) values (${name}, ${alias ? [alias] : []}::text[], ${tags}::text[])
    returning id`;
  return row.id;
}

export async function saveDrafts(text: string, items: Draft[]) {
  return db().begin(async (tx) => {
    const [entry] = await tx<{ id: number }[]>`
      insert into entries (raw_text, parsed) values (${text}, ${tx.json(items as never)}) returning id`;

    for (const item of items) {
      if (item.type === 'meal') {
        const [meal] = await tx<{ id: number }[]>`
          insert into meals (entry_id, local_date, meal_type) values (${entry.id}, ${item.date}, ${item.meal_type}) returning id`;
        for (const f of item.items) {
          await tx`
            insert into food_items (meal_id, name, quantity, unit, grams, protein_g, calories, carbs_g, fat_g, source, fdc_id, fdc_description)
            values (${meal.id}, ${f.name}, ${f.quantity}, ${f.unit}, ${f.grams}, ${f.protein_g}, ${f.calories},
                    ${f.carbs_g}, ${f.fat_g}, ${f.source}, ${f.fdc_id}, ${f.fdc_description})`;
        }
      } else if (item.type === 'workout') {
        const [w] = await tx<{ id: number }[]>`
          insert into workouts (entry_id, local_date, title, notes) values (${entry.id}, ${item.date}, ${item.title}, ${item.notes}) returning id`;
        for (const [pos, ex] of item.exercises.entries()) {
          const exId = await upsertExercise(tx, ex.name, ex.as_written, ex.tags);
          for (const [idx, s] of ex.sets.entries()) {
            await tx`
              insert into workout_sets (workout_id, exercise_id, position, set_index, weight_kg, reps, duration_s, distance_m, superset)
              values (${w.id}, ${exId}, ${pos}, ${idx + 1}, ${s.weight_kg}, ${s.reps}, ${s.duration_s}, ${s.distance_m}, ${ex.superset})`;
          }
        }
      } else if (item.type === 'activity') {
        await tx`
          insert into activities (entry_id, local_date, name, duration_min, distance_km, notes)
          values (${entry.id}, ${item.date}, ${item.name}, ${item.duration_min}, ${item.distance_km}, ${item.notes})`;
      } else {
        await setHabit(tx, item.habit_key, item.date, item.done, entry.id);
      }
    }
    return entry.id;
  });
}

/** Unknown habit keys get created on the fly, so "took creatine" just works. */
export async function setHabit(sql: postgres.Sql | postgres.TransactionSql, key: string, date: string, done: boolean, entryId: number | null = null) {
  const [h] = await sql<{ id: number }[]>`
    insert into habits (key, name, sort) values (${key}, ${titleCase(key)}, 100)
    on conflict (key) do update set active = true
    returning id`;
  await sql`
    insert into habit_logs (habit_id, local_date, done, entry_id) values (${h.id}, ${date}, ${done}, ${entryId})
    on conflict (habit_id, local_date) do update set done = excluded.done, entry_id = coalesce(excluded.entry_id, habit_logs.entry_id)`;
}
