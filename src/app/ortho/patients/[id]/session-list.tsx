'use client';

import { useMemo, useState } from 'react';
import { useT } from '@/components/i18n-provider';
import { formatInstant } from '@/lib/time';

export interface SessionItem {
  id: string;
  startsAt: string;
  endsAt: string;
  cancelled: boolean;
  label: string;
  kind: string;
}

type Filter = 'toutes' | 'prevues' | 'passees' | 'annulees';

// Mêmes filtres que « Mes séances » côté patient, « Toutes » par défaut (annulées comprises).
const FILTERS: { code: Filter; label: string }[] = [
  { code: 'toutes', label: 'Toutes' },
  { code: 'prevues', label: 'Prévues' },
  { code: 'passees', label: 'Passées' },
  { code: 'annulees', label: 'Annulées' },
];

/** Historique des séances d'un patient, filtrable. */
export function SessionList({ sessions }: { sessions: SessionItem[] }) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>('toutes');
  const now = useMemo(() => Date.now(), [sessions]);
  const shown = sessions.filter((s) => {
    if (filter === 'toutes') return true;
    if (filter === 'annulees') return s.cancelled;
    const future = new Date(s.endsAt).getTime() > now;
    return !s.cancelled && (filter === 'prevues' ? future : !future);
  });

  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="row sub">
        {t('Afficher')}
        <select className="field-inline" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          {FILTERS.map((f) => (
            <option key={f.code} value={f.code}>
              {t(f.label)}
            </option>
          ))}
        </select>
      </label>
      <div className="session-list">
        {shown.length === 0 && <p className="hint">{t('Aucune séance à afficher.')}</p>}
        {shown.map((s) => (
          <div key={s.id} className="request">
            <span style={{ textTransform: 'capitalize' }}>{formatInstant(s.startsAt, t.locale)}</span>
            <span className={`badge ${s.kind}`}>{t(s.label)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
