'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

/** État renvoyé par les server actions des formulaires. */
export interface FormState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

export function SubmitButton({ children, pendingText, className = 'btn primary' }: { children: React.ReactNode; pendingText?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? (pendingText ?? 'Envoi…') : children}
    </button>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
}

export function Field({ label, name, error, className, ...input }: FieldProps) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <label className={`field ${className ?? ''}`}>
      <span>{label}</span>
      <input name={name} id={name} aria-invalid={error ? true : undefined} aria-describedby={errorId} {...input} />
      {error && (
        <span className="error" id={errorId}>
          {error}
        </span>
      )}
    </label>
  );
}

export function FormAlert({ state }: { state: FormState }) {
  const ref = useRef<HTMLParagraphElement>(null);
  // Fait défiler la page jusqu'au message : on voit tout de suite si c'est enregistré ou s'il y a une erreur.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [state]);
  if (!state.message) return null;
  return (
    <p ref={ref} tabIndex={-1} className={`alert ${state.ok ? 'ok' : 'error'}`} role={state.ok ? 'status' : 'alert'}>
      {state.message}
    </p>
  );
}

/** Champ mot de passe avec un bouton « œil » pour afficher ou masquer la saisie. */
export function PasswordField({ label, name, error, ...input }: Omit<FieldProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  const errorId = error ? `${name}-error` : undefined;
  return (
    <label className="field">
      <span>{label}</span>
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
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
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
          {error}
        </span>
      )}
    </label>
  );
}
