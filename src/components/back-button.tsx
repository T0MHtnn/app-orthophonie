'use client';

import { useRouter } from 'next/navigation';
import { useT } from './i18n-provider';
import { NAV_KEY } from './nav-tracker';

/**
 * « ← Retour » : page précédente si on vient du site, sinon une page de secours.
 * Règle de Tom : on ne doit jamais être bloqué sur une page.
 */
export function BackButton({ fallback, label = 'Retour' }: { fallback: string; label?: string }) {
  const router = useRouter();
  const t = useT();
  return (
    <button
      type="button"
      className="btn small back-btn"
      onClick={() => {
        let seen = 0;
        try {
          seen = Number(sessionStorage.getItem(NAV_KEY) ?? '0');
        } catch {
          seen = 0;
        }
        // Une page du site avant celle-ci : on y revient ; sinon (lien d'un email…), page de secours.
        if (seen > 1) router.back();
        else router.push(fallback);
      }}
    >
      ← {t(label)}
    </button>
  );
}
