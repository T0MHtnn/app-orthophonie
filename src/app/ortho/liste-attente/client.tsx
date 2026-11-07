'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/i18n-provider';

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const t = useT();
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          setDone(false);
        }
      }}
    >
      {t(done ? 'Copié' : 'Copier le texte')}
    </button>
  );
}

/**
 * Recherche et filtres appliqués tout de suite (URL mise à jour, la page
 * serveur refiltre). La recherche attend une courte pause dans la frappe.
 */
type Option = { code: string; label: string };

export function FilterBar({ pathologies, requestTypes, showRemovedToggle }: { pathologies: Option[]; requestTypes: Option[]; showRemovedToggle: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = useT();

  const apply = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    // Les messages et panneaux ouverts (email, suppression) ne survivent pas à un nouveau filtrage.
    for (const k of ['email', 'supprimer', 'ok', 'erreur']) next.delete(k);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <form className="row filters" method="get" role="search" onSubmit={(e) => e.preventDefault()}>
      {params.get('onglet') && <input type="hidden" name="onglet" value={params.get('onglet') ?? ''} />}
      <input
        type="search"
        name="q"
        className="field-inline search"
        placeholder={t('Rechercher un nom ou un prénom')}
        aria-label={t('Rechercher un nom ou un prénom')}
        value={query}
        maxLength={80}
        onChange={(e) => {
          const value = e.target.value;
          setQuery(value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => apply({ q: value.trim() }), 300);
        }}
      />
      <label className="row sub">
        {t('Motif')}
        <select name="motif" className="field-inline" value={params.get('motif') ?? ''} onChange={(e) => apply({ motif: e.target.value })}>
          <option value="">{t('Tous')}</option>
          {pathologies.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="row sub">
        {t('Demande')}
        <select name="type" className="field-inline" value={params.get('type') ?? ''} onChange={(e) => apply({ type: e.target.value })}>
          <option value="">{t('Toutes')}</option>
          {requestTypes.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {showRemovedToggle && (
        <label className="check">
          <input type="checkbox" name="retires" value="1" checked={params.get('retires') === '1'} onChange={(e) => apply({ retires: e.target.checked ? '1' : '' })} /> {t('Afficher les demandes retirées')}
        </label>
      )}
      <noscript>
        <button className="btn small" type="submit">
          {t('Filtrer')}
        </button>
      </noscript>
    </form>
  );
}
