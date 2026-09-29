import Link from 'next/link';

const TABS = [
  { href: '/', label: 'Today' },
  { href: '/trends', label: 'Trends' },
  { href: '/lifts', label: 'Lifts' },
];

export default function Nav({ current }: { current: '/' | '/trends' | '/lifts' | '/settings' }) {
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-inner">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={current === t.href ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
