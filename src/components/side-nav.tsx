'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavLink {
  href: string;
  label: string;
}

export function SideNav({ links, label = 'Sections' }: { links: NavLink[]; label?: string }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label={label}>
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
