'use client';

import { useEffect, useState, useTransition } from 'react';
import { useT } from '@/components/i18n-provider';
import { Modal } from '@/components/modal';
import { formatInstant } from '@/lib/time';
import { advanceOffers, dismissFreedSlots, sendFreedSlot } from './actions';

export interface FreedItem {
  id: string;
  label: string;
  startsAt: string;
  source: 'patient' | 'cabinet' | 'avance';
  reason: string | null;
}

const SOURCE: Record<FreedItem['source'], string> = {
  patient: 'Annulée par le patient',
  cabinet: 'Annulée par le cabinet',
  avance: 'Libérée (séance avancée)',
};

/**
 * À l'ouverture du planning : récapitulatif des séances libérées pas encore traitées.
 * « Envoyer » propose le créneau aux patients (vagues de 3) ; fermer sans tout envoyer
 * demande confirmation, puis les créneaux restants sont ignorés.
 * Lance aussi les vagues en attente (12 h écoulées, fin de nuit).
 */
export function FreedRecap({ items }: { items: FreedItem[] }) {
  const t = useT();
  const [open, setOpen] = useState(items.length > 0);
  const [round, setRound] = useState(0);
  const [warn, setWarn] = useState(false);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const unsent = items.filter((i) => !sent[i.id]);

  useEffect(() => {
    void advanceOffers();
  }, []);

  if (!open) return null;

  const requestClose = () => {
    if (unsent.length > 0) setWarn(true);
    else setOpen(false);
  };

  return (
    <>
      {!warn && (
        <Modal key={round} onClose={requestClose}>
          <div className="stack">
            <h2>{t('Séances libérées')}</h2>
            <p className="sub">{t('Proposez chaque créneau aux patients suivis (d’abord ceux sans prochain rendez-vous). Le premier qui accepte l’obtient.')}</p>
            <div>
              {items.map((i) => (
                <div key={i.id} className="request">
                  <div>
                    <b style={{ textTransform: 'capitalize' }}>{formatInstant(i.startsAt, t.locale)}</b>
                    <div className="hint">
                      {i.label} · {t(SOURCE[i.source])}
                      {i.reason ? ` · « ${i.reason} »` : ''}
                    </div>
                  </div>
                  {sent[i.id] ? (
                    <span className="badge rdv">{t(sent[i.id]!)}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn small primary"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await sendFreedSlot(i.id);
                          setSent((s) => ({ ...s, [i.id]: res.ok ? 'Envoyé' : res.message }));
                        })
                      }
                    >
                      {t('Envoyer')}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div>
              <button type="button" className="btn" onClick={requestClose}>
                {t('Fermer')}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {warn && (
        <Modal onClose={() => setWarn(false)}>
          <div className="stack">
            <h2>{t('Tous les créneaux n’ont pas été proposés')}</h2>
            <p>
              {t(
                unsent.length > 1
                  ? 'Le remplissage n’a pas été envoyé pour {n} créneaux libérés. Ils ne vous seront plus proposés ici. Fermer quand même ?'
                  : 'Le remplissage n’a pas été envoyé pour {n} créneau libéré. Il ne vous sera plus proposé ici. Fermer quand même ?',
                { n: unsent.length },
              )}
            </p>
            <div className="row">
              <button
                type="button"
                className="btn danger"
                onClick={() =>
                  startTransition(async () => {
                    await dismissFreedSlots(unsent.map((i) => i.id));
                    setWarn(false);
                    setOpen(false);
                  })
                }
              >
                {t('Fermer quand même')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setWarn(false);
                  setRound((r) => r + 1);
                }}
              >
                {t('Revenir')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
