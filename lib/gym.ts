import { db } from './db';

export type GymSession = { id: number; local_date: string; started_at: string; ended_at: string | null; auto_ended: boolean };

export const AUTO_END_HOURS = 3;

/** Forgot to sign out? Anything open for 3+ hours is closed at the 3 hour mark. */
export async function closeStale() {
  await db()`
    update gym_sessions set ended_at = started_at + make_interval(hours => ${AUTO_END_HOURS}), auto_ended = true
    where ended_at is null and started_at < now() - make_interval(hours => ${AUTO_END_HOURS})`;
}

export async function activeSession(): Promise<GymSession | null> {
  const [s] = await db()<GymSession[]>`
    select id, local_date, started_at, ended_at, auto_ended from gym_sessions
    where ended_at is null order by started_at desc limit 1`;
  return s ?? null;
}

export async function sessionsOn(date: string): Promise<GymSession[]> {
  return db()<GymSession[]>`
    select id, local_date, started_at, ended_at, auto_ended from gym_sessions
    where local_date = ${date} order by started_at`;
}

export const minutesOf = (s: GymSession, now = Date.now()) =>
  Math.max(0, ((s.ended_at ? new Date(s.ended_at).getTime() : now) - new Date(s.started_at).getTime()) / 60000);
