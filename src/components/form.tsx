'use client';

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
  if (!state.message) return null;
  return (
    <p className={`alert ${state.ok ? 'ok' : 'error'}`} role={state.ok ? 'status' : 'alert'}>
      {state.message}
    </p>
  );
}
