import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { isDate, nowLabel, todayLocal } from '@/lib/dates';
import { daily, getGoals } from '@/lib/metrics';
import { getUnit } from '@/lib/settings';
import { resolveFood } from '@/lib/usda';
import { planWorkout } from '@/lib/coach';
import { MODEL } from '@/lib/parse';
import { isDayType } from '@/lib/daytype';
import type { PlanFood } from '@/lib/sandbox';

export const maxDuration = 60;

const TAGS = ['abs', 'back', 'chest', 'shoulders', 'arms', 'legs', 'glutes', 'cardio'];

const tool: Anthropic.Tool = {
  name: 'sandbox_request',
  description: 'Describe what the user wants to plan. Nothing is logged.',
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['meal', 'workout'] },
      meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
      foods: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            usda_query: { type: 'string', description: 'USDA search phrase in the state eaten, e.g. "chicken breast cooked", "rice white cooked"' },
            branded: { type: 'boolean' },
            mixed_dish: { type: 'boolean' },
            role: { type: 'string', enum: ['flex', 'fixed'], description: 'flex = amount should be solved to hit protein; fixed = keep this amount' },
            grams: { type: 'number', description: 'fixed: the amount (as said, or a normal portion). flex: a starting portion; flex portions set the ratio between flex foods' },
            protein_per100: { type: 'number' },
            calories_per100: { type: 'number' },
            unit_label: { type: 'string', description: 'How you would count it, singular: egg, shrimp, oz, cup, scoop, slice, piece, or g' },
            unit_plural: { type: 'string', description: 'Plural of unit_label: eggs, shrimp, oz, cups' },
            grams_per_unit: { type: 'number', description: 'Grams in one unit as eaten (large egg 50, large cooked shrimp 7, oz 28.35, cup cooked rice 158, g 1)' },
            step: { type: 'number', description: 'Sensible stepper size in units: 1 for eggs and pieces, 0.5 for oz, 0.25 for cups, 25 for g' },
          },
          required: ['name', 'usda_query', 'branded', 'mixed_dish', 'role', 'grams', 'protein_per100', 'calories_per100', 'unit_label', 'unit_plural', 'grams_per_unit', 'step'],
        },
      },
      note: { type: ['string', 'null'], description: 'One short tip, only if genuinely useful' },
      day_type: { type: ['string', 'null'], enum: ['upper', 'lower', 'full_body', 'abs', 'cardio', null], description: 'Only if the user asked for one' },
      minutes: { type: ['number', 'null'] },
      avoid: { type: 'array', items: { type: 'string' }, description: 'Lowercase words for equipment or exercises to skip, e.g. "cable", "squat"' },
      focus_tags: { type: 'array', items: { type: 'string', enum: TAGS } },
      include_abs: { type: ['boolean', 'null'] },
    },
    required: ['kind'],
  },
};

const nn = z.number().nullish();
const Req = z.object({
  kind: z.enum(['meal', 'workout']),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).nullish(),
  foods: z.array(z.object({
    name: z.string(), usda_query: z.string().nullish(), branded: z.boolean().nullish(), mixed_dish: z.boolean().nullish(),
    role: z.enum(['flex', 'fixed']).nullish(), grams: z.number().positive(),
    protein_per100: z.number().min(0), calories_per100: z.number().min(0),
    unit_label: z.string().nullish(), unit_plural: z.string().nullish(), grams_per_unit: nn, step: nn,
  })).nullish(),
  note: z.string().nullish(),
  day_type: z.string().nullish(),
  minutes: nn,
  avoid: z.array(z.string()).nullish(),
  focus_tags: z.array(z.string()).nullish(),
  include_abs: z.boolean().nullish(),
});

/** Friendly counting unit, falling back to grams. */
function units(f: { unit_label?: string | null; unit_plural?: string | null; grams_per_unit?: number | null; step?: number | null }) {
  const label = f.unit_label?.trim();
  if (!label || !f.grams_per_unit || f.grams_per_unit <= 0 || label === 'g') {
    return { unit_label: 'g', unit_plural: 'g', grams_per_unit: 1, step: 25 };
  }
  return { unit_label: label, unit_plural: f.unit_plural?.trim() || label, grams_per_unit: f.grams_per_unit, step: f.step && f.step > 0 ? f.step : 1 };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; date?: string };
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: 'Type a meal idea or ask for a workout.' }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 500 });
  const today = todayLocal();
  const date = isDate(body.date) && body.date <= today ? body.date : today;

  try {
    const [goals, protein, calories, unit] = await Promise.all([
      getGoals(), daily('protein_g', date, date), daily('calories', date, date), getUnit(),
    ]);
    const pg = goals.protein_daily;
    const cg = goals.calories_daily;
    const eaten = { protein: protein.get(date) ?? 0, calories: calories.get(date) ?? 0 };
    const pMin = pg.success_min ?? pg.target;

    const res = await new Anthropic().messages.create({
      model: MODEL(),
      max_tokens: 2048,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'sandbox_request' },
      system: `You help plan meals and workouts in a personal tracker's sandbox. Nothing gets logged. Always answer with sandbox_request.
It is ${nowLabel()}. Protein so far today: ${Math.round(eaten.protein)} g (goal ${pg.target} g, ${pMin} g still counts), so ${Math.max(0, Math.round(pg.target - eaten.protein))} g to go. Calories so far: ${Math.round(eaten.calories)} kcal (target ${cg.success_min ?? cg.target}-${cg.target}).

Meal ideas (kind meal):
- Use exactly the foods the user names. A list with no amounts ("eggs salmon shrimp") means: work out how much of each. Make every protein food flex, with starting portions in a realistic ratio for one plate (e.g. 2 eggs, 4 oz salmon, 5 shrimp), leaning toward leaner foods if calories are tight.
- A food with an amount from the user is fixed. Sides and carbs (rice, veggies, toast) are fixed at a normal portion unless the user asks otherwise.
- If they don't name foods, suggest 2 to 4 foods for a simple high-protein meal that fits the calories left, with the protein foods as flex.
- protein_per100 and calories_per100 describe the food as eaten (cooked rice, cooked salmon). Be accurate; they check the database numbers.
- Count things the way a person would: eggs by the egg, shrimp by the piece, fish and meat in oz, rice in cups, yogurt by the container.

Workout ideas (kind workout): the user wants a suggested session. Set day_type only if they named one (arm or push/pull days are upper; leg or glute days are lower). Put equipment they want to skip in avoid, and muscle focus in focus_tags.`,
      messages: [{ role: 'user', content: text }],
    });
    const block = res.content.find((b) => b.type === 'tool_use');
    const parsed = Req.safeParse(block && block.type === 'tool_use' ? block.input : null);
    if (!parsed.success) throw new Error("Couldn't work that out. Try naming foods, or say something like \"lower day\".");
    const r = parsed.data;

    if (r.kind === 'workout') {
      const plan = await planWorkout(
        {
          dayType: isDayType(r.day_type) ? r.day_type : null,
          minutes: r.minutes ?? null,
          avoid: r.avoid ?? [],
          focusTags: (r.focus_tags ?? []).filter((t) => TAGS.includes(t)),
          includeAbs: r.include_abs ?? null,
        },
        unit,
      );
      return NextResponse.json({ kind: 'workout', plan });
    }

    const foods: PlanFood[] = await Promise.all(
      (r.foods ?? []).map(async (f) => {
        const estPer100 = { protein: f.protein_per100, calories: f.calories_per100 };
        const est = { protein: (estPer100.protein * f.grams) / 100, calories: (estPer100.calories * f.grams) / 100 };
        const match = f.usda_query && !f.mixed_dish ? await resolveFood(f.usda_query, f.grams, est, !!f.branded) : null;
        return {
          name: f.name,
          role: f.role ?? 'fixed',
          grams: f.grams,
          per100: match ? match.per100 : { ...estPer100, carbs: null, fat: null },
          ...units(f),
          source: match ? 'usda' : 'estimate',
          fdc_id: match?.fdc_id ?? null,
          fdc_description: match?.description ?? null,
        };
      }),
    );
    if (!foods.length) throw new Error('Name a food or two, like "chicken and rice".');
    return NextResponse.json({
      kind: 'meal',
      date,
      mealType: r.meal_type ?? 'snack',
      foods,
      eaten,
      goals: { pTarget: pg.target, pMin, kMin: cg.success_min ?? cg.target, kMax: cg.target },
      note: r.note ?? null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sandbox failed' }, { status: 500 });
  }
}
