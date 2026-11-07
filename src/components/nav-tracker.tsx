'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export const NAV_KEY = 'pages_vues';

/** Compte les pages vues dans l'onglet : « Retour » sait s'il y a une page du site avant. */
export function NavTracker() {
  const path = usePathname();
  useEffect(() => {
    try {
      sessionStorage.setItem(NAV_KEY, String(Number(sessionStorage.getItem(NAV_KEY) ?? '0') + 1));
    } catch {
      // Stockage indisponible (navigation privée stricte) : « Retour » utilisera la page de secours.
    }
  }, [path]);
  return null;
}
