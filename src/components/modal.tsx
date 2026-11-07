'use client';

import { useEffect, useRef } from 'react';

/** Pop-up modale (<dialog>) : Échap, croix ou clic sur le fond pour fermer. */
export function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal card"
      onClose={onClose}
      onClick={(e) => {
        // Clic sur le fond (hors de la boîte) : on ferme.
        const r = e.currentTarget.getBoundingClientRect();
        const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (e.target === e.currentTarget && outside) ref.current?.close();
      }}
    >
      <button type="button" className="modal-x" aria-label="Fermer" onClick={() => ref.current?.close()}>
        ×
      </button>
      {children}
    </dialog>
  );
}
