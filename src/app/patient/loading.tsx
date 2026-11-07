import { getT } from '@/lib/i18n';

/** Affiché immédiatement pendant le chargement d'une page (le menu reste en place). */
export default async function Loading() {
  const t = await getT();
  return (
    <div className="stack" aria-busy="true" aria-label={t('Chargement')}>
      <div className="skeleton" style={{ height: 34, width: '40%' }} />
      <div className="skeleton" style={{ height: 160 }} />
      <div className="skeleton" style={{ height: 90 }} />
    </div>
  );
}
