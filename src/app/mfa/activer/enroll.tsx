'use client';

import { useActionState, useState, useTransition } from 'react';
import { Field, FormAlert, SubmitButton } from '@/components/form';
import { confirmEnrollment, startEnrollment, type EnrollState } from '../actions';

export function Enroll() {
  const [started, setStarted] = useState<EnrollState | null>(null);
  const [pending, startTransition] = useTransition();

  if (!started?.factorId) {
    return (
      <div className="stack">
        {started?.message && <FormAlert state={started} />}
        <ol className="stack" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Installez une application d’authentification sur votre téléphone (Google Authenticator, Microsoft Authenticator, Aegis…).</li>
          <li>Scannez le QR code qui va s’afficher.</li>
          <li>Saisissez le code à 6 chiffres donné par l’application.</li>
        </ol>
        <button className="btn primary" disabled={pending} onClick={() => startTransition(async () => setStarted(await startEnrollment()))}>
          {pending ? 'Préparation…' : 'Afficher le QR code'}
        </button>
      </div>
    );
  }
  return <ConfirmStep initial={started} />;
}

function ConfirmStep({ initial }: { initial: EnrollState }) {
  const [state, action] = useActionState<EnrollState, FormData>(confirmEnrollment, initial);
  return (
    <form action={action} className="stack" noValidate>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="qr" src={state.qr} alt="QR code à scanner avec votre application d’authentification" />
      <p className="hint">Impossible de scanner ? Saisissez cette clé dans l’application :</p>
      <p className="secret">{state.secret}</p>
      <Field label="Code à 6 chiffres" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required error={state.errors?.code} />
      <SubmitButton pendingText="Vérification…">Activer la double authentification</SubmitButton>
    </form>
  );
}
