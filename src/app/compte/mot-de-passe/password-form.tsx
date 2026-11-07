'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormAlert, PasswordField, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import { updatePassword } from '../../(auth)/actions';

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(updatePassword, {});
  const t = useT();
  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>{t('Nouveau mot de passe')}</h1>
        <FormAlert state={state} persistent />
        {state.ok ? (
          <Link href="/" className="btn primary">
            {t('Continuer')}
          </Link>
        ) : (
          <form action={action} className="stack" noValidate>
            <PasswordField label="Nouveau mot de passe" name="password" autoComplete="new-password" required minLength={12} error={state.errors?.password} />
            <PasswordField label="Confirmer" name="confirm" autoComplete="new-password" required error={state.errors?.confirm} />
            <SubmitButton>Enregistrer</SubmitButton>
          </form>
        )}
      </div>
    </main>
  );
}
