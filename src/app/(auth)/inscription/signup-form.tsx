'use client';

import { useActionState } from 'react';
import { Field, FormAlert, PasswordField, SubmitButton, type FormState } from '@/components/form';
import { signup } from '../actions';

export function SignupForm({ defaultType = 'ortho', lockType = false, next = '' }: { defaultType?: 'ortho' | 'patient'; lockType?: boolean; next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(signup, {});
  if (state.ok) return <FormAlert state={state} persistent />;
  const type = state.values?.accountType ?? defaultType;
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="stack" noValidate>
      <input type="hidden" name="suivant" value={next} />
      <FormAlert state={state} />
      {lockType ? (
        <input type="hidden" name="accountType" value={type} />
      ) : (
        <fieldset className="choice" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sub" style={{ marginBottom: 6 }}>
            Je suis…
          </legend>
          <label>
            <input type="radio" name="accountType" value="ortho" defaultChecked={type === 'ortho'} /> Orthophoniste
          </label>
          <label>
            <input type="radio" name="accountType" value="patient" defaultChecked={type === 'patient'} /> Patient ou parent
          </label>
        </fieldset>
      )}
      <Field label="Prénom" name="firstName" autoComplete="given-name" required maxLength={80} defaultValue={state.values?.firstName} error={state.errors?.firstName} />
      <Field label="Nom" name="lastName" autoComplete="family-name" required maxLength={80} defaultValue={state.values?.lastName} error={state.errors?.lastName} />
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.errors?.email} />
      <PasswordField
        label="Mot de passe"
        name="password"
        autoComplete="new-password"
        required
        minLength={12}
        error={state.errors?.password}
      />
      <p className="hint">12 caractères minimum, avec majuscules, minuscules et chiffres.</p>
      <SubmitButton pendingText="Création…">Créer mon compte</SubmitButton>
    </form>
  );
}
