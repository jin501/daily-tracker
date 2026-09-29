import Link from 'next/link';
import Nav from '@/components/Nav';
import SettingsForm from '@/components/SettingsForm';
import { db } from '@/lib/db';
import { getGoals } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const [goals, habits] = await Promise.all([
    getGoals(),
    db()<{ key: string; name: string }[]>`select key, name from habits where active order by sort, id`,
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
        <SettingsForm goals={Object.values(goals)} habits={habits} />
      </main>
      <Nav current="/settings" />
    </>
  );
}
