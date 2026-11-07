'use client';

import { useEffect, useRef } from 'react';
import { useT } from './i18n-provider';

/** Durée de l'animation de fermeture (globals.css : .modal.closing). */
const CLOSE_MS = 140;

/** Pop-up modale (<dialog>) : Échap, croix ou clic sur le fond pour fermer, avec une courte animation. */
export function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const close = () => {
    const el = ref.current;
    if (!el || el.classList.contains('closing')) return;
    el.classList.add('closing');
    setTimeout(() => el.close(), CLOSE_MS);
  };

  return (
    <dialog
      ref={ref}
      className="modal card"
      onClose={onClose}
      onCancel={(e) => {
        // Échap : on anime avant de fermer.
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        // Clic sur le fond (hors de la boîte) : on ferme.
        const r = e.currentTarget.getBoundingClientRect();
        const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (e.target === e.currentTarget && outside) close();
      }}
    >
      <button type="button" className="modal-x" aria-label={t('Fermer')} onClick={close}>
        ×
      </button>
      {children}
    </dialog>
  );
}
