'use client';

import { useActionState } from 'react';
import { Field, SubmitButton, type FormState } from '@/components/form';
import { verifyMfa } from '../actions';

export function VerifyForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(verifyMfa, {});
  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="suivant" value={next} />
      <Field label="Code de votre application" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus error={state.errors?.code} />
      <SubmitButton pendingText="Vérification…">Valider</SubmitButton>
    </form>
  );
}
