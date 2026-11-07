'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Field, FormAlert, PasswordField, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import { login } from '../actions';

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(login, {});
  const t = useT();
  return (
    <>
      <form action={action} className="stack" noValidate>
        <FormAlert state={state} />
        <input type="hidden" name="suivant" value={next} />
        <Field label="Email" name="email" type="email" autoComplete="username" required defaultValue={state.values?.email} error={state.errors?.email} />
        <PasswordField label="Mot de passe" name="password" autoComplete="current-password" required error={state.errors?.password} />
        <SubmitButton pendingText="Connexion…">Se connecter</SubmitButton>
        <Link href="/mot-de-passe-oublie" className="hint">
          {t('Mot de passe oublié ?')}
        </Link>
      </form>
    </>
  );
}
