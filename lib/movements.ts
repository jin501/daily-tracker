/**
 * Core movements. "Cable Row" and "DB Row" are variations (rows in `exercises`)
 * of one movement, "Row" (a row in `movements`), which carries the category.
 *
 * New exercises get their movement from the parser. Older ones (and anything the
 * parser missed) get one from the name rules below, and you can fix any of it on Lifts.
 */
import type postgres from 'postgres';
import { db } from './db';

import { type Category } from './categories';
export * from './categories';

type Sql = postgres.Sql | postgres.TransactionSql;

// ---------- name rules (used for backfill and as a fallback) ----------

const STRIP: RegExp[] = [
  /\b(single|one)[ -]?(arm|leg|hand)(ed)?\b/g,
  /\b(wide|close|narrow|neutral|underhand|overhand|supinated|pronated|mixed)[ -]?grip\b/g,
  /\bbent[ -]?over\b/g,
  /\bchest[ -]?supported\b/g,
  /\bplate[ -]?loaded\b/g,
  /\bhammer strength\b/g,
  /\biso[ -]?lateral\b/g,
  /\bresistance band\b/g,
  /\bt[ -]?bar\b/g,
  /\bez[ -]?bar\b/g,
  /\b(cable|cables|dumbbells?|db|dbs|barbell|bb|kettlebell|kb|machine|smith|band|banded|diverging|converging|lever|selectorized|trx|landmine)\b/g,
  /\b(seated|standing|kneeling|lying|incline|decline|flat|wide|close|narrow|weighted|assisted|alternating|alt)\b/g,
];

const SYNONYMS: Record<string, string> = {
  pulldown: 'Lat Pulldown',
  'pull down': 'Lat Pulldown',
  'lat pull down': 'Lat Pulldown',
  'lat pulldown': 'Lat Pulldown',
  'push up': 'Pushup',
  'push-up': 'Pushup',
  'pull up': 'Pullup',
  'pull-up': 'Pullup',
  'chin up': 'Chinup',
  'chin-up': 'Chinup',
  rdl: 'Romanian Deadlift',
  ohp: 'Overhead Press',
  'shoulder press': 'Shoulder Press',
};

const KEEP_S = new Set(['abs', 'biceps', 'triceps', 'glutes', 'lats', 'quads', 'hamstrings', 'calves', 'press', 'cross']);

function singular(word: string): string {
  const w = word.toLowerCase();
  if (KEEP_S.has(w) || w.length < 4) return word;
  if (/(ch|sh|ss|x)es$/.test(w)) return word.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return word.slice(0, -1);
  return word;
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function categoryFromTags(tags: string[]): Category {
  if (tags.includes('abs')) return 'abs';
  if (tags.includes('cardio')) return 'cardio';
  if (tags.includes('full_body')) return 'full_body';
  if (tags.includes('legs') || tags.includes('glutes')) return 'lower';
  return 'upper';
}

/** "Diverging Lat Pulldown Machine" -> "Lat Pulldown", "DB Row" -> "Row", "Face Pulls" -> "Face Pull". */
export function guessMovement(name: string, tags: string[] = []): { name: string; category: Category } {
  const category = categoryFromTags(tags);
  let s = ` ${name.toLowerCase()} `;
  for (const r of STRIP) s = s.replace(r, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) s = name.toLowerCase().trim();
  const words = s.split(' ');
  words[words.length - 1] = singular(words[words.length - 1]);
  s = words.join(' ');
  let out = SYNONYMS[s] ?? titleCase(s);
  if (out === 'Kickback') out = category === 'lower' ? 'Glute Kickback' : tags.includes('arms') ? 'Tricep Kickback' : out;
  return { name: out, category };
}

// ---------- db ----------

export async function findOrCreateMovement(sql: Sql, name: string, category: Category): Promise<number> {
  const clean = name.trim().replace(/\s+/g, ' ');
  const [found] = await sql<{ id: number }[]>`select id from movements where lower(name) = lower(${clean}) limit 1`;
  if (found) return found.id;
  const [row] = await sql<{ id: number }[]>`
    insert into movements (name, category) values (${clean}, ${category})
    on conflict (name) do update set name = excluded.name
    returning id`;
  return row.id;
}

/** Gives every exercise without a movement one, from the name rules. Cheap no-op once done. */
export async function ensureMovements(): Promise<void> {
  const sql = db();
  const rows = await sql<{ id: number; name: string; tags: string[] }[]>`
    select id, name, tags from exercises where movement_id is null`;
  for (const r of rows) {
    const g = guessMovement(r.name, r.tags);
    const id = await findOrCreateMovement(sql, g.name, g.category);
    await sql`update exercises set movement_id = ${id} where id = ${r.id}`;
  }
}
