'use client';

import { forwardRef, useEffect, useState } from 'react';
import { useT } from './i18n-provider';

/** Durée d'affichage d'un message de confirmation avant qu'il disparaisse seul. */
export const NOTICE_MS = 5000;

interface Props {
  kind: 'ok' | 'warn' | 'error';
  children: React.ReactNode;
  /**
   * Disparaît seul après 5 s (par défaut : oui pour « ok » / « warn », jamais pour une erreur).
   * false pour un message qu'il faut pouvoir relire (ex. « vérifiez votre boîte mail »).
   */
  autoHide?: boolean;
  onClose?: () => void;
}

/** Message d'information avec une croix pour le fermer. */
export const Notice = forwardRef<HTMLDivElement, Props>(function Notice({ kind, children, autoHide, onClose }, ref) {
  const [phase, setPhase] = useState<'open' | 'leaving' | 'closed'>('open');
  const t = useT();
  const hides = autoHide ?? kind !== 'error';
  // Courte animation de sortie avant de retirer le message.
  const close = () => {
    setPhase((p) => (p === 'open' ? 'leaving' : p));
    setTimeout(() => {
      setPhase('closed');
      onClose?.();
    }, 160);
  };
  useEffect(() => {
    if (!hides) return;
    const t = setTimeout(close, NOTICE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hides]);
  if (phase === 'closed') return null;
  return (
    <div ref={ref} tabIndex={-1} className={`alert ${kind} notice ${phase === 'leaving' ? 'leaving' : ''}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{typeof children === 'string' ? t(children) : children}</span>
      <button type="button" className="notice-x" aria-label={t('Fermer le message')} onClick={close}>
        ×
      </button>
    </div>
  );
});
