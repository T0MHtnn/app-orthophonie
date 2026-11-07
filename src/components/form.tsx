'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useT } from './i18n-provider';
import { Notice } from './notice';

/** État renvoyé par les server actions des formulaires. */
export interface FormState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

export function SubmitButton({
  children,
  pendingText,
  className = 'btn primary',
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  /** Pour un formulaire à plusieurs boutons (la valeur du bouton cliqué est envoyée). */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending} name={name} value={value}>
      {pending ? t(pendingText ?? 'Envoi…') : typeof children === 'string' ? t(children) : children}
    </button>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
}

export function Field({ label, name, error, className, placeholder, ...input }: FieldProps) {
  const t = useT();
  const errorId = error ? `${name}-error` : undefined;
  return (
    <label className={`field ${className ?? ''}`}>
      <span>{t(label)}</span>
      <input name={name} id={name} aria-invalid={error ? true : undefined} aria-describedby={errorId} placeholder={placeholder && t(placeholder)} {...input} />
      {error && (
        <span className="error" id={errorId}>
          {t(error)}
        </span>
      )}
    </label>
  );
}

/*
 * Les composants ci-dessous traduisent eux-mêmes leurs textes (libellé, aide, erreur,
 * message) : un texte français connu de en.ts s'affiche en anglais si besoin.
 */

/**
 * Message renvoyé par une action. Croix pour le fermer ; une confirmation disparaît
 * seule après quelques secondes, sauf `persistent` (ex. « vérifiez votre boîte mail »).
 */
export function FormAlert({ state, persistent = false }: { state: FormState; persistent?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Fait défiler la page jusqu'au message : on voit tout de suite si c'est enregistré ou s'il y a une erreur.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [state]);
  // Nouvel identifiant à chaque nouvel envoi (et seulement là) : le message réapparaît même s'il est identique.
  const id = useMemo(() => Math.random(), [state]);
  const t = useT();
  if (!state.message) return null;
  return (
    <Notice key={id} ref={ref} kind={state.ok ? 'ok' : 'error'} autoHide={state.ok && !persistent}>
      {t(state.message)}
    </Notice>
  );
}

/** Champ mot de passe avec un bouton « œil » pour afficher ou masquer la saisie. */
export function PasswordField({ label, name, error, ...input }: Omit<FieldProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  const t = useT();
  const errorId = error ? `${name}-error` : undefined;
  return (
    <label className="field">
      <span>{t(label)}</span>
      <span className="password-wrap">
        <input
          name={name}
          id={name}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          autoCapitalize="off"
          spellCheck={false}
          {...input}
        />
        <button
          type="button"
          className="eye"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={t(visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe')}
          title={t(visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe')}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </span>
      {error && (
        <span className="error" id={errorId}>
          {t(error)}
        </span>
      )}
    </label>
  );
}
