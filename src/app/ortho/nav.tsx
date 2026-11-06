'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/ortho/liste-attente', label: 'Liste d’attente' },
  { href: '/ortho/reglages', label: 'Réglages' },
];

export function OrthoNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Sections">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
