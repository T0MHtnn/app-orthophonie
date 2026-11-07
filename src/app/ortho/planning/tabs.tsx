import Link from 'next/link';

/** Sous-onglets du planning. */
export function PlanningTabs({ current }: { current: 'agenda' | 'horaires' }) {
  return (
    <nav className="tabs" aria-label="Planning">
      <Link href="/ortho/planning" aria-current={current === 'agenda' ? 'page' : undefined}>
        Agenda
      </Link>
      <Link href="/ortho/planning/horaires" aria-current={current === 'horaires' ? 'page' : undefined}>
        Horaires d’ouverture
      </Link>
    </nav>
  );
}
