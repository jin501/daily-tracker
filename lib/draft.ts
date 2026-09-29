/**
 * The contract between the parser, the confirm card, and the database.
 * Anything the parser returns is validated against this before it is saved,
 * so swapping the model or the prompt can't corrupt data.
 */
import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nnum = z.number().finite().nullable();

export const Per100 = z.object({ protein: z.number(), calories: z.number(), carbs: nnum, fat: nnum });

export const FoodItem = z.object({
  name: z.string().min(1),
  quantity: nnum,
  unit: z.string().nullable(),
  grams: nnum,
  protein_g: z.number().min(0),
  calories: z.number().min(0),
  carbs_g: nnum,
  fat_g: nnum,
  source: z.enum(['usda', 'estimate', 'manual']),
  fdc_id: z.number().int().nullable(),
  fdc_description: z.string().nullable(),
  per100: Per100.nullable(), // lets the confirm card recompute when you edit grams
});

export const MealDraft = z.object({
  type: z.literal('meal'),
  date,
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  items: z.array(FoodItem).min(1),
});

export const SetDraft = z.object({
  weight_kg: nnum,
  reps: z.number().int().nullable(),
  duration_s: z.number().int().nullable(),
  distance_m: nnum,
});

export const ExerciseDraft = z.object({
  name: z.string().min(1),
  as_written: z.string().nullable(),
  tags: z.array(z.string()),
  superset: z.string().nullable(),
  sets: z.array(SetDraft).min(1),
});

export const WorkoutDraft = z.object({
  type: z.literal('workout'),
  date,
  title: z.string().nullable(),
  notes: z.string().nullable(),
  exercises: z.array(ExerciseDraft).min(1),
});

export const ActivityDraft = z.object({
  type: z.literal('activity'),
  date,
  name: z.string().min(1),
  duration_min: nnum,
  distance_km: nnum,
  notes: z.string().nullable(),
});

export const HabitDraft = z.object({
  type: z.literal('habit'),
  date,
  habit_key: z.string().min(1),
  done: z.boolean(),
});

export const Draft = z.discriminatedUnion('type', [MealDraft, WorkoutDraft, ActivityDraft, HabitDraft]);
export const SaveRequest = z.object({ text: z.string(), items: z.array(Draft).min(1) });

export type Draft = z.infer<typeof Draft>;
export type MealDraft = z.infer<typeof MealDraft>;
export type WorkoutDraft = z.infer<typeof WorkoutDraft>;
export type FoodItem = z.infer<typeof FoodItem>;
