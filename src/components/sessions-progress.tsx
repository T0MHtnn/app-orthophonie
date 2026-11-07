'use client';

import { useT } from '@/components/i18n-provider';
import { seriesState } from '@/lib/patient';

/** Avancement de la série de séances (couleur du thème) + alerte de fin de série. */
export function SessionsProgress({ done, total }: { done: number; total: number | null }) {
  const t = useT();
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const { state, left } = seriesState(done, total);
  return (
    <div className="progress-block">
      <div
        className={`progress ${total ? '' : 'unknown'} ${state}`}
        role="progressbar"
        aria-label={t('Séances réalisées')}
        aria-valuemin={0}
        aria-valuemax={total ?? undefined}
        aria-valuenow={total ? done : undefined}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="hint">
        {total
          ? t('{fait} séance(s) sur {total}', { fait: done, total })
          : t('{fait} séance(s) réalisée(s) · nombre de séances prescrites à renseigner sur la fiche', { fait: done })}
      </p>
      {state === 'fin-proche' && (
        <p className="series-alert warn">{t(left === 1 ? 'Fin de série : plus qu’une séance.' : 'Fin de série : plus que {n} séances.', { n: left ?? 0 })}</p>
      )}
      {state === 'terminee' && <p className="series-alert done">{t('Série terminée : pensez au renouvellement de la prescription.')}</p>}
    </div>
  );
}
