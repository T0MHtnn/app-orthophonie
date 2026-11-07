'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavLink {
  href: string;
  label: string;
  /** Autres adresses qui allument ce lien (ex. Mon compte → Réglages). */
  also?: string[];
}

export function SideNav({ links, label = 'Sections' }: { links: NavLink[]; label?: string }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label={label}>
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={[l.href, ...(l.also ?? [])].some((h) => path.startsWith(h)) ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
