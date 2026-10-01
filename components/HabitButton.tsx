'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from './icons';

export default function HabitButton({ habitKey, name, emoji, date, done }: { habitKey: string; name: string; emoji?: string | null; date: string; done: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(done);
  const [, start] = useTransition();

  async function toggle() {
    const next = !on;
    setOn(next);
    const res = await fetch('/api/habits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: habitKey, date, done: next }),
    });
    if (!res.ok) setOn(!next);
    start(() => router.refresh());
  }

  return (
    <button type="button" className="habit" onClick={toggle} aria-pressed={on}>
      <span className={`check ${on ? 'check-on' : 'check-off'}`}>{on && <Check />}</span>
      {emoji && <span className="emoji" aria-hidden>{emoji}</span>}
      {name}
    </button>
  );
}

export function DerivedHabit({ name, emoji, done }: { name: string; emoji?: string; done: boolean }) {
  return (
    <button type="button" className="habit" disabled aria-pressed={done} title="Tracked automatically">
      <span className={`check ${done ? 'check-on' : 'check-off'}`}>{done && <Check />}</span>
      {emoji && <span className="emoji" aria-hidden>{emoji}</span>}
      {name}
    </button>
  );
}
