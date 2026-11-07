'use client';

import { useMemo, useState } from 'react';
import { SubmitButton } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import type { Database } from '@/lib/database.types';
import { formatInstant } from '@/lib/time';
import { ackAppointment, cancelMyAppointment } from './actions';

type Session = Database['public']['Functions']['my_appointments']['Returns'][number];
type Filter = 'prevues' | 'passees' | 'toutes' | 'annulees';

const FILTERS: { code: Filter; label: string }[] = [
  { code: 'prevues', label: 'Prévues' },
  { code: 'passees', label: 'Passées' },
  { code: 'toutes', label: 'Toutes' },
  { code: 'annulees', label: 'Annulées' },
];

/** « Mes séances » : filtre (prévues / passées / toutes / annulées) et case pour afficher les annulées. */
export function Sessions({ sessions }: { sessions: Session[] }) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>('prevues');
  const [showCancelled, setShowCancelled] = useState(false);
  // Calculé une fois par rendu de la liste (pas besoin d'une horloge qui tourne).
  const now = useMemo(() => Date.now(), [sessions]);

  const shown = sessions.filter((a) => {
    const cancelled = a.status === 'annule';
    if (filter === 'annulees') return cancelled;
    if (cancelled && !showCancelled) return false;
    const future = new Date(a.ends_at).getTime() > now;
    if (filter === 'prevues') return future;
    if (filter === 'passees') return !future;
    return true;
  });

  return (
    <div className="stack">
      <div className="row">
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
        {filter !== 'annulees' && (
          <label className="check">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            <span>{t('Afficher les rendez-vous annulés')}</span>
          </label>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="hint">{t('Aucune séance à afficher.')}</p>
      ) : (
        <div>
          {shown.map((a) => (
            <div key={a.id} className="request">
              <div>
                <b style={{ textTransform: 'capitalize' }}>{formatInstant(a.starts_at, t.locale)}</b>
                {a.is_new && <span className="badge-new">{t('Nouveau')}</span>}
                <div className="hint">
                  {a.patient_first_name} {a.patient_last_name} · {a.practice_name}
                </div>
                {a.status === 'annule' && (
                  <div className="cancel-note">
                    {t(a.cancelled_by === 'ortho' ? 'Annulée par le cabinet' : 'Annulée par vous')}
                    {a.cancel_reason ? ` : « ${a.cancel_reason} »` : ''}
                  </div>
                )}
              </div>
              <div className="row">
                {a.status === 'annule' ? (
                  <span className="badge retire">{t('Annulée')}</span>
                ) : new Date(a.ends_at).getTime() <= now ? (
                  <span className="badge">{t('Passée')}</span>
                ) : (
                  <span className={`badge ${a.status === 'confirme' ? 'rdv' : 'attente'}`}>{t(a.status === 'confirme' ? 'Confirmée' : 'En attente de validation')}</span>
                )}
                {/* Nouvelle séance signalée par l'ortho : la pastille part au clic sur « Lu ». */}
                {a.is_new && (
                  <form action={ackAppointment}>
                    <input type="hidden" name="id" value={a.id} />
                    <SubmitButton className="btn small primary">Lu</SubmitButton>
                  </form>
                )}
                {a.can_cancel && (
                  <details className="cancel-box">
                    <summary className="btn small">{t(a.status === 'confirme' ? 'Annuler' : 'Retirer la demande')}</summary>
                    <form action={cancelMyAppointment} className="stack">
                      <input type="hidden" name="id" value={a.id} />
                      <label className="field">
                        <span>{t('Raison (facultatif, transmise à l’orthophoniste)')}</span>
                        <textarea name="reason" rows={2} maxLength={500} placeholder={t('Ex. : enfant malade, empêchement…')} />
                      </label>
                      <div>
                        <SubmitButton className="btn danger small">{a.status === 'confirme' ? 'Confirmer l’annulation' : 'Confirmer le retrait'}</SubmitButton>
                      </div>
                    </form>
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
