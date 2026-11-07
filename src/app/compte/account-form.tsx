'use client';

import { useActionState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { saveProfile } from './actions';

type Labels = { firstName: string; lastName: string; save: string; saving: string };

export function AccountForm({ firstName, lastName, labels }: { firstName: string; lastName: string; labels: Labels }) {
  const [state, action] = useActionState<FormState, FormData>(saveProfile, {});
  const v = state.values ?? { firstName, lastName };
  return (
    <form key={JSON.stringify(v)} action={action} className="stack" noValidate>
      <FormAlert state={state} />
      <Field label={labels.firstName} name="firstName" autoComplete="given-name" required maxLength={80} defaultValue={v.firstName} error={state.errors?.firstName} />
      <Field label={labels.lastName} name="lastName" autoComplete="family-name" required maxLength={80} defaultValue={v.lastName} error={state.errors?.lastName} />
      <SubmitButton pendingText={labels.saving}>{labels.save}</SubmitButton>
    </form>
  );
}
