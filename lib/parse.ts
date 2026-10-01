/**
 * Natural language -> drafts.
 * Claude extracts structure plus a realistic nutrition estimate per food. The
 * numbers you see come from USDA when a USDA match agrees with that estimate
 * (see lib/usda.ts); otherwise the estimate is used and marked "est.".
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { db } from './db';
import { nowLabel, todayLocal } from './dates';
import { resolveFood } from './usda';
import { round } from './format';
import { getUnit } from './settings';
import { toKg, type WUnit } from './units';
import { CATEGORIES, guessMovement, isCategory } from './movements';
import type { Draft, FoodItem } from './draft';

const TAGS = ['abs', 'back', 'chest', 'shoulders', 'arms', 'legs', 'glutes', 'cardio', 'full_body'];
export const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

const tool: Anthropic.Tool = {
  name: 'log_entries',
  description: 'Record everything the user logged in their message.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['meal', 'workout', 'activity', 'habit'] },
            date: { type: 'string', description: 'YYYY-MM-DD the thing happened' },
            meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
            foods: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Short display name, e.g. "Shrimp"' },
                  quantity: { type: ['number', 'null'] },
                  unit: { type: ['string', 'null'], description: 'As the user said it: cup, piece, oz, g, scoop, slice, bowl...' },
                  grams: { type: 'number', description: 'Weight in grams in the state it was eaten (cooked rice is cooked weight)' },
                  usda_query: { type: 'string', description: 'USDA search phrase naming the same state, e.g. "rice white cooked", "oats steel cut dry", "egg whole cooked", "shrimp cooked"' },
                  branded: { type: 'boolean', description: 'True when the user named a brand or product' },
                  mixed_dish: { type: 'boolean', description: 'True for stews, soups, jjigae, sandwiches, baked goods, restaurant dishes: anything made of several ingredients' },
                  protein_g: { type: 'number', description: 'Realistic protein for the whole amount eaten' },
                  calories: { type: 'number', description: 'Realistic kcal for the whole amount eaten' },
                },
                required: ['name', 'quantity', 'unit', 'grams', 'usda_query', 'branded', 'mixed_dish', 'protein_g', 'calories'],
              },
            },
            title: { type: 'string', description: 'Short workout title' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'The specific variation in Title Case, e.g. "Cable Row", "Diverging Lat Pulldown"' },
                  movement: { type: 'string', description: 'The core movement it belongs to, e.g. "Row", "Lat Pulldown"' },
                  category: { type: 'string', enum: [...CATEGORIES] },
                  as_written: { type: 'string', description: 'How the user spelled the exercise name itself (no weights, reps or notes)' },
                  tags: { type: 'array', items: { type: 'string', enum: TAGS } },
                  superset: { type: ['string', 'null'], description: 'Same letter for exercises done as a superset' },
                  sets: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        weight: { type: ['number', 'null'] },
                        weight_unit: { type: ['string', 'null'], enum: ['kg', 'lb', null] },
                        reps: { type: ['integer', 'null'] },
                        duration_s: { type: ['integer', 'null'] },
                        distance_m: { type: ['number', 'null'] },
                      },
                    },
                  },
                },
                required: ['name', 'movement', 'category', 'tags', 'sets'],
              },
            },
            activity: { type: 'string', description: 'Activity name, e.g. "Tennis"' },
            duration_min: { type: ['number', 'null'] },
            distance_km: { type: ['number', 'null'] },
            habit_key: { type: 'string' },
            done: { type: 'boolean' },
            notes: { type: ['string', 'null'] },
          },
          required: ['type', 'date'],
        },
      },
    },
    required: ['items'],
  },
};

// Loose schema for what the model sends back; we normalize it into strict drafts.
const nn = z.number().nullish();
const RawItem = z.object({
  type: z.enum(['meal', 'workout', 'activity', 'habit']),
  date: z.string(),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).nullish(),
  foods: z.array(z.object({
    name: z.string(), quantity: nn, unit: z.string().nullish(), grams: nn,
    usda_query: z.string().nullish(), branded: z.boolean().nullish(), mixed_dish: z.boolean().nullish(),
    protein_g: nn, calories: nn,
  })).nullish(),
  title: z.string().nullish(),
  exercises: z.array(z.object({
    name: z.string(), movement: z.string().nullish(), category: z.string().nullish(),
    as_written: z.string().nullish(), tags: z.array(z.string()).nullish(), superset: z.string().nullish(),
    sets: z.array(z.object({
      weight: nn, weight_unit: z.enum(['kg', 'lb']).nullish(), reps: nn, duration_s: nn, distance_m: nn,
    })),
  })).nullish(),
  activity: z.string().nullish(),
  duration_min: nn,
  distance_km: nn,
  habit_key: z.string().nullish(),
  done: z.boolean().nullish(),
  notes: z.string().nullish(),
});

async function context() {
  const sql = db();
  const [movements, aliases, habits, unit] = await Promise.all([
    sql<{ name: string; category: string; variations: string[] }[]>`
      select m.name, m.category, coalesce(array_agg(e.name order by e.name) filter (where e.id is not null), '{}') as variations
      from movements m left join exercises e on e.movement_id = m.id
      group by m.id order by m.name`,
    sql<{ name: string; aliases: string[] }[]>`select name, aliases from exercises where cardinality(aliases) > 0`,
    sql<{ key: string; name: string }[]>`select key, name from habits where active order by sort, id`,
    getUnit(),
  ]);
  return { movements, aliases, habits, unit };
}
type Ctx = Awaited<ReturnType<typeof context>>;

function systemPrompt(today: string, viewDate: string, ctx: Ctx) {
  const mv = ctx.movements.length
    ? ctx.movements.map((m) => `${m.name} [${m.category}]: ${m.variations.join(', ') || m.name}`).join('\n  ')
    : 'none yet';
  const al = ctx.aliases.map((a) => `${a.name} = ${a.aliases.join(', ')}`).join('; ') || 'none';
  const hb = ctx.habits.map((h) => `${h.key} (${h.name})`).join(', ') || 'none';
  return `You turn quick personal log messages into structured records for a fitness and nutrition tracker. Always answer by calling log_entries.

Context
- It is ${nowLabel()} for the user. Today's log date is ${today}.
- The user is looking at ${viewDate}. Use that date unless the message says otherwise.
- Resolve "yesterday", "last friday", "on monday", "9/18" relative to ${today}. Never return a future date: "9/18" means the most recent Sept 18 on or before ${today}.
- Known movements [category]: variations
  ${mv}
- Known spellings: ${al}
- Habits the user tracks: ${hb}
- The user's weight unit is ${ctx.unit}.

Meals
- One item per meal, each food listed separately. If no meal type is given, infer it from the wording and time of day.
- grams is the weight as eaten. Rice, pasta and grains mentioned at a meal ("1 cup rice") are cooked. Oats measured by the cup ("1/4 cup steel cut oats") are dry. usda_query must name that same state.
- protein_g and calories are your realistic numbers for the whole amount, like a nutrition label. They are used to check the database match, so be accurate: 1 cup cooked white rice is about 205 kcal, 1 large egg about 72 kcal.
- mixed_dish is true for anything made of several ingredients (stews, soups, jjigae, hotteok, sandwiches, pizza, restaurant plates). branded is true when a brand or product is named, and then usda_query includes the brand.

Workouts
- One item per session. List every set in order; "8 reps 3 sets" becomes three sets of 8. Bodyweight moves have weight null. Cardio like "500m row" is an exercise with distance_m.
- weight_unit is what the user wrote; if they wrote a number with no unit, use ${ctx.unit}.
- name is the specific variation in Title Case ("Cable Row", "DB Row", "Wide Grip Lat Pulldown", "Diverging Lat Pulldown"). Reuse a known variation name when the user means it, even with typos. Put the user's spelling in as_written.
- movement is the core movement without equipment, grip, angle or machine words: Cable Row and DB Row are "Row"; wide grip and diverging lat pulldowns are "Lat Pulldown". Reuse a known movement when it fits. Keep movements that train different muscles apart ("Glute Kickback" vs "Tricep Kickback", "Reverse Fly" vs "Chest Fly").
- category: upper (chest, back, shoulders, arms), lower (legs and glutes: squats, lunges, deadlifts, hip thrusts, kickbacks for glutes, abductors), abs (anything mainly for the core: crunches, planks, Russian twists, leg raises, woodchops), cardio (rower, bike, treadmill, sled done as sets), full_body (burpees, thrusters, cleans).
- tags from: ${TAGS.join(', ')}.
- Exercises done back to back as a superset share a superset letter (A, B...). Only use it when the user says superset or clearly alternates two exercises.

Activities and habits
- Sports and cardio that aren't gym sets (tennis, running, biking, hiking, yoga, climbing, walking with a time or distance) are activity items with duration_min and distance_km if given.
- Habits: only use these keys: ${hb}. "took vitamins" -> vitamins. "pooped" -> poop. Any walk ("walked", "went on a walk", "walked 30 min") -> walked, plus an activity "Walk" if a time or distance is given. "forgot vitamins" -> done false. Ignore any other habit.
- Never invent anything the user didn't say.`;
}

export async function parseMessage(text: string, viewDate?: string): Promise<Draft[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const today = todayLocal();
  const ctx = await context();
  const client = new Anthropic();

  const res = await client.messages.create({
    model: MODEL(),
    max_tokens: 4096,
    system: systemPrompt(today, viewDate && viewDate <= today ? viewDate : today, ctx),
    tools: [tool],
    tool_choice: { type: 'tool', name: 'log_entries' },
    messages: [{ role: 'user', content: text }],
  });

  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('The parser did not return anything');
  const parsed = z.object({ items: z.array(RawItem) }).safeParse(block.input);
  if (!parsed.success) throw new Error('The parser returned something unexpected. Try rephrasing.');

  const habitKeys = new Set(ctx.habits.map((h) => h.key));
  const drafts = await Promise.all(parsed.data.items.map((i) => normalize(i, today, ctx.unit, habitKeys)));
  return drafts.filter((d): d is Draft => d !== null);
}

async function normalize(i: z.infer<typeof RawItem>, today: string, unit: WUnit, habitKeys: Set<string>): Promise<Draft | null> {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(i.date) && i.date <= today ? i.date : today;

  if (i.type === 'meal') {
    const foods = i.foods ?? [];
    if (!foods.length) return null;
    const items = await Promise.all(foods.map((f) => enrichFood(f)));
    return { type: 'meal', date, meal_type: i.meal_type ?? 'snack', items };
  }

  if (i.type === 'workout') {
    const exercises = (i.exercises ?? [])
      .map((e) => {
        const tags = (e.tags ?? []).filter((t) => TAGS.includes(t));
        const guess = guessMovement(e.name, tags);
        return {
          name: e.name.trim(),
          movement: e.movement?.trim() || guess.name,
          category: isCategory(e.category) ? e.category : guess.category,
          as_written: e.as_written?.trim() || null,
          tags,
          superset: e.superset ?? null,
          sets: e.sets.map((s) => {
            const u: WUnit = s.weight_unit ?? unit;
            return {
              weight_kg: s.weight == null ? null : round(toKg(s.weight, u), 3),
              weight_input: s.weight ?? null,
              weight_unit: s.weight == null ? null : u,
              reps: s.reps == null ? null : Math.round(s.reps),
              duration_s: s.duration_s == null ? null : Math.round(s.duration_s),
              distance_m: s.distance_m ?? null,
            };
          }),
        };
      })
      .filter((e) => e.sets.length);
    if (!exercises.length) return null;
    return { type: 'workout', date, title: i.title ?? null, notes: i.notes ?? null, exercises };
  }

  if (i.type === 'activity') {
    if (!i.activity) return null;
    return { type: 'activity', date, name: i.activity, duration_min: i.duration_min ?? null, distance_km: i.distance_km ?? null, notes: i.notes ?? null };
  }

  const key = i.habit_key?.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  if (!key || !habitKeys.has(key)) return null;
  return { type: 'habit', date, habit_key: key, done: i.done ?? true };
}

export async function enrichFood(f: {
  name: string; quantity?: number | null; unit?: string | null; grams?: number | null;
  usda_query?: string | null; branded?: boolean | null; mixed_dish?: boolean | null;
  protein_g?: number | null; calories?: number | null;
}): Promise<FoodItem> {
  const grams = f.grams ?? null;
  const est = f.calories != null && f.protein_g != null ? { protein: f.protein_g, calories: f.calories } : null;
  const match = f.usda_query && grams && !f.mixed_dish ? await resolveFood(f.usda_query, grams, est, !!f.branded) : null;
  if (match && grams) {
    const k = grams / 100;
    return {
      name: f.name, quantity: f.quantity ?? null, unit: f.unit ?? null, grams: round(grams),
      protein_g: round(match.per100.protein * k, 1),
      calories: round(match.per100.calories * k),
      carbs_g: match.per100.carbs == null ? null : round(match.per100.carbs * k, 1),
      fat_g: match.per100.fat == null ? null : round(match.per100.fat * k, 1),
      source: 'usda', fdc_id: match.fdc_id, fdc_description: match.description, per100: match.per100,
    };
  }
  const per100 = grams && est ? { protein: (est.protein / grams) * 100, calories: (est.calories / grams) * 100, carbs: null, fat: null } : null;
  return {
    name: f.name, quantity: f.quantity ?? null, unit: f.unit ?? null, grams: grams == null ? null : round(grams),
    protein_g: round(Math.max(0, f.protein_g ?? 0), 1), calories: round(Math.max(0, f.calories ?? 0)),
    carbs_g: null, fat_g: null, source: 'estimate', fdc_id: null, fdc_description: null, per100,
  };
}
