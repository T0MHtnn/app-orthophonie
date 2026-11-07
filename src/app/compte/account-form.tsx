'use client';

import { useActionState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { saveProfile } from './actions';

export function AccountForm({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveProfile, {});
  const v = state.values ?? { firstName, lastName };
  return (
    <form key={JSON.stringify(v)} action={action} className="stack" noValidate>
      <FormAlert state={state} />
      <Field label="Prénom" name="firstName" autoComplete="given-name" required maxLength={80} defaultValue={v.firstName} error={state.errors?.firstName} />
      <Field label="Nom" name="lastName" autoComplete="family-name" required maxLength={80} defaultValue={v.lastName} error={state.errors?.lastName} />
      <SubmitButton pendingText="Enregistrement…">Enregistrer</SubmitButton>
    </form>
  );
}
