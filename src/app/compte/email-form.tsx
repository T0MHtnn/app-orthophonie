'use client';

import { useActionState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import { changeEmail } from './actions';

/** Nouvelle adresse email : confirmation par lien, puis déconnexion de tous les appareils. */
export function EmailForm({ current }: { current: string }) {
  const [state, action] = useActionState<FormState, FormData>(changeEmail, {});
  const t = useT();
  if (state.ok) return <FormAlert state={state} persistent />;
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="stack" noValidate>
      <FormAlert state={state} />
      <p className="sub">
        {t('Adresse actuelle :')} <b>{current}</b>
      </p>
      <Field label="Nouvelle adresse email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.errors?.email} />
      <p className="hint">{t('Vous recevrez un lien de confirmation. Une fois le changement confirmé, vous serez déconnecté de tous vos appareils.')}</p>
      <div>
        <SubmitButton pendingText="Envoi…">Changer d’adresse email</SubmitButton>
      </div>
    </form>
  );
}
