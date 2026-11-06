'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { login, loginWithGoogle } from '../actions';

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(login, {});
  return (
    <>
      <form action={action} className="stack" noValidate>
        <FormAlert state={state} />
        <input type="hidden" name="suivant" value={next} />
        <Field label="Email" name="email" type="email" autoComplete="username" required defaultValue={state.values?.email} error={state.errors?.email} />
        <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required error={state.errors?.password} />
        <SubmitButton pendingText="Connexion…">Se connecter</SubmitButton>
        <Link href="/mot-de-passe-oublie" className="hint">
          Mot de passe oublié ?
        </Link>
      </form>
      <div className="divider">ou</div>
      <form action={loginWithGoogle}>
        <SubmitButton className="btn full" pendingText="Redirection…">
          Continuer avec Google
        </SubmitButton>
      </form>
    </>
  );
}
