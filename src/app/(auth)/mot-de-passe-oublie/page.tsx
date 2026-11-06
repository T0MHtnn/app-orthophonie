'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { requestPasswordReset } from '../actions';

export default function MotDePasseOubliePage() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, {});
  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>Mot de passe oublié</h1>
        <FormAlert state={state} />
        {!state.ok && (
          <form action={action} className="stack" noValidate>
            <Field label="Email du compte" name="email" type="email" autoComplete="email" required error={state.errors?.email} />
            <SubmitButton>Recevoir un lien</SubmitButton>
          </form>
        )}
        <Link href="/connexion" className="hint">
          Retour à la connexion
        </Link>
      </div>
    </main>
  );
}
