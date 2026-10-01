import Link from 'next/link';
import Nav from '@/components/Nav';
import SettingsForm from '@/components/SettingsForm';
import { db } from '@/lib/db';
import { getGoals } from '@/lib/metrics';
import { getUnit } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const [goals, habits, unit] = await Promise.all([
    getGoals(),
    db()<{ key: string; name: string; emoji: string | null }[]>`select key, name, emoji from habits where active order by sort, id`,
    getUnit(),
  ]);
  return (
    <>
      <main className="page">
        <header className="head">
          <div>
            <Link href="/" className="backlink">Back to today</Link>
            <h1 className="title">Settings</h1>
          </div>
        </header>
        <SettingsForm goals={goals} habits={habits} unit={unit} />
      </main>
      <Nav current="/settings" />
    </>
  );
}
