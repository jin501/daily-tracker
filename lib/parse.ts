/**
 * Natural language -> drafts.
 * Claude only extracts structure (and a gram estimate). Nutrition numbers come
 * from USDA; Claude's own protein guess is only a fallback when USDA has no match.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { db } from './db';
import { nowLabel, todayLocal } from './dates';
import { lookupFood } from './usda';
import { round } from './format';
import type { Draft, FoodItem } from './draft';

const TAGS = ['abs', 'back', 'chest', 'shoulders', 'arms', 'legs', 'glutes', 'cardio', 'full_body'];
const LB_TO_KG = 0.45359237;

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
                  unit: { type: ['string', 'null'], description: 'As the user said it: cup, piece, oz, g, scoop, slice...' },
                  grams: { type: 'number', description: 'Best estimate of the weight in grams as eaten' },
                  usda_query: { type: 'string', description: 'Plain USDA FoodData Central search phrase, e.g. "shrimp cooked", "oats steel cut", "egg whole cooked"' },
                  protein_g: { type: 'number', description: 'Your own estimate, only used if the USDA lookup fails' },
                  calories: { type: 'number', description: 'Your own estimate, only used if the USDA lookup fails' },
                },
                required: ['name', 'quantity', 'unit', 'grams', 'usda_query', 'protein_g', 'calories'],
              },
            },
            title: { type: 'string', description: 'Short workout title, e.g. "Back day"' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Canonical Title Case name' },
                  as_written: { type: 'string', description: "How the user spelled the exercise name itself (no weights, reps or notes)" },
                  tags: { type: 'array', items: { type: 'string', enum: TAGS } },
                  superset: { type: ['string', 'null'], description: 'Same letter for exercises done as a superset' },
                  sets: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        weight: { type: ['number', 'null'] },
                        weight_unit: { type: 'string', enum: ['kg', 'lb'] },
                        reps: { type: ['integer', 'null'] },
                        duration_s: { type: ['integer', 'null'] },
                        distance_m: { type: ['number', 'null'] },
                      },
                    },
                  },
                },
                required: ['name', 'tags', 'sets'],
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
    usda_query: z.string().nullish(), protein_g: nn, calories: nn,
  })).nullish(),
  title: z.string().nullish(),
  exercises: z.array(z.object({
    name: z.string(), as_written: z.string().nullish(), tags: z.array(z.string()).nullish(), superset: z.string().nullish(),
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
  const [exercises, habits] = await Promise.all([
    sql<{ name: string; aliases: string[] }[]>`select name, aliases from exercises order by name`,
    sql<{ key: string; name: string }[]>`select key, name from habits where active order by sort, id`,
  ]);
  return { exercises, habits };
}

function systemPrompt(today: string, viewDate: string, ctx: Awaited<ReturnType<typeof context>>) {
  const ex = ctx.exercises.length
    ? ctx.exercises.map((e) => (e.aliases.length ? `${e.name} (also: ${e.aliases.join(', ')})` : e.name)).join('; ')
    : 'none yet';
  const hb = ctx.habits.map((h) => `${h.key}: ${h.name}`).join('; ') || 'none yet';
  return `You turn quick personal log messages into structured records for a fitness and nutrition tracker. Always answer by calling log_entries.

Context
- It is ${nowLabel()} for the user. Today's log date is ${today}.
- The user is looking at ${viewDate}. Use that date unless the message says otherwise.
- Resolve "yesterday", "last friday", "on monday", "9/18" relative to ${today}. Never return a future date: "9/18" means the most recent Sept 18 on or before ${today}.
- Known exercises (reuse these exact names when the user means one, even with typos): ${ex}
- Known habits (habit_key: name): ${hb}

Rules
- One message can produce several items, e.g. a meal plus a habit.
- Meals: one item per meal, with each food listed separately. grams is the weight as eaten; for oats, rice or pasta given dry, use dry weight. usda_query is a plain generic description USDA would recognize; only include a brand if the user named one. If no meal type is given, infer it from the wording and time of day.
- Workouts: one item per session. List every set in order; "8 reps 3 sets" becomes three sets of 8. Keep weights in the unit the user wrote. Bodyweight moves have weight null. Cardio like "500m row" is an exercise with distance_m and the cardio tag. Exercises done back to back as a superset share a superset letter (A, B...).
- Exercise names are specific Title Case ("Cable Row", "Lat Pulldown", "Cable Crunch", "TRX Row"). Put the user's spelling in as_written.
- Tags only from: ${TAGS.join(', ')}. Anything that mainly trains the core (crunches, Russian twists, planks, leg raises, ab wheel, woodchops) must include abs.
- Sports and cardio that aren't gym sets (tennis, running, biking, hiking, yoga, climbing) are activity items, with duration_min and distance_km if given.
- Habits: "took vitamins" -> habit_key vitamins, done true. "pooped" -> poop. A habit not in the list gets a short snake_case key. "forgot vitamins" -> done false.
- Never invent anything the user didn't say.`;
}

export async function parseMessage(text: string, viewDate?: string): Promise<Draft[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const today = todayLocal();
  const ctx = await context();
  const client = new Anthropic();

  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
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

  const drafts = await Promise.all(parsed.data.items.map((i) => normalize(i, today)));
  return drafts.filter((d): d is Draft => d !== null);
}

async function normalize(i: z.infer<typeof RawItem>, today: string): Promise<Draft | null> {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(i.date) && i.date <= today ? i.date : today;

  if (i.type === 'meal') {
    const foods = i.foods ?? [];
    if (!foods.length) return null;
    const items = await Promise.all(foods.map((f) => enrichFood(f)));
    return { type: 'meal', date, meal_type: i.meal_type ?? 'snack', items };
  }

  if (i.type === 'workout') {
    const exercises = (i.exercises ?? [])
      .map((e) => ({
        name: e.name.trim(),
        as_written: e.as_written?.trim() || null,
        tags: (e.tags ?? []).filter((t) => TAGS.includes(t)),
        superset: e.superset ?? null,
        sets: e.sets.map((s) => ({
          weight_kg: s.weight == null ? null : round(s.weight_unit === 'lb' ? s.weight * LB_TO_KG : s.weight, 1),
          reps: s.reps == null ? null : Math.round(s.reps),
          duration_s: s.duration_s == null ? null : Math.round(s.duration_s),
          distance_m: s.distance_m ?? null,
        })),
      }))
      .filter((e) => e.sets.length);
    if (!exercises.length) return null;
    return { type: 'workout', date, title: i.title ?? null, notes: i.notes ?? null, exercises };
  }

  if (i.type === 'activity') {
    if (!i.activity) return null;
    return { type: 'activity', date, name: i.activity, duration_min: i.duration_min ?? null, distance_km: i.distance_km ?? null, notes: i.notes ?? null };
  }

  if (!i.habit_key) return null;
  return { type: 'habit', date, habit_key: i.habit_key.toLowerCase().replace(/[^a-z0-9_]+/g, '_'), done: i.done ?? true };
}

async function enrichFood(f: {
  name: string; quantity?: number | null; unit?: string | null; grams?: number | null;
  usda_query?: string | null; protein_g?: number | null; calories?: number | null;
}): Promise<FoodItem> {
  const grams = f.grams ?? null;
  const match = f.usda_query && grams ? await lookupFood(f.usda_query) : null;
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
  return {
    name: f.name, quantity: f.quantity ?? null, unit: f.unit ?? null, grams: grams == null ? null : round(grams),
    protein_g: round(Math.max(0, f.protein_g ?? 0), 1), calories: round(Math.max(0, f.calories ?? 0)),
    carbs_g: null, fat_g: null, source: 'estimate', fdc_id: null, fdc_description: null, per100: null,
  };
}
