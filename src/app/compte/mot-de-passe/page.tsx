'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { updatePassword } from '../../(auth)/actions';

export default function NouveauMotDePassePage() {
  const [state, action] = useActionState<FormState, FormData>(updatePassword, {});
  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>Nouveau mot de passe</h1>
        <FormAlert state={state} />
        {state.ok ? (
          <Link href="/" className="btn primary">
            Continuer
          </Link>
        ) : (
          <form action={action} className="stack" noValidate>
            <Field label="Nouveau mot de passe" name="password" type="password" autoComplete="new-password" required minLength={12} error={state.errors?.password} />
            <Field label="Confirmer" name="confirm" type="password" autoComplete="new-password" required error={state.errors?.confirm} />
            <SubmitButton>Enregistrer</SubmitButton>
          </form>
        )}
      </div>
    </main>
  );
}
