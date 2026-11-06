'use client';

import { useActionState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { TEMPLATE_FIELDS } from '@/lib/defaults';
import { saveSettings } from './actions';

interface Props {
  name: string;
  waitlistOpen: boolean;
  waitlistInfo: string;
  emailTemplate: string;
}

export function SettingsForm(initial: Props) {
  const [state, action] = useActionState<FormState, FormData>(saveSettings, {});
  return (
    <form action={action} className="stack" noValidate>
      <FormAlert state={state} />

      <section className="card stack">
        <h2>Cabinet</h2>
        <Field label="Nom du cabinet" name="name" required defaultValue={initial.name} error={state.errors?.name} />
      </section>

      <section className="card stack">
        <h2>Liste d’attente</h2>
        <label className="check">
          <input type="checkbox" name="waitlistOpen" defaultChecked={initial.waitlistOpen} />
          <span>
            <b>Inscriptions ouvertes</b>
            <span className="hint" style={{ display: 'block' }}>
              Décochez pour fermer temporairement votre page publique.
            </span>
          </span>
        </label>
        <label className="field">
          <span>Texte affiché avant l’inscription</span>
          <textarea name="waitlistInfo" rows={14} defaultValue={initial.waitlistInfo} aria-invalid={state.errors?.waitlistInfo ? true : undefined} />
          {state.errors?.waitlistInfo && <span className="error">{state.errors.waitlistInfo}</span>}
        </label>
        <p className="hint">La première ligne sert de titre. « ## » en début de ligne pour un sous-titre, « * » pour une puce.</p>
      </section>

      <section className="card stack">
        <h2>Email type « une place s’est libérée »</h2>
        <label className="field">
          <span>Modèle d’email</span>
          <textarea name="emailTemplate" rows={16} defaultValue={initial.emailTemplate} aria-invalid={state.errors?.emailTemplate ? true : undefined} />
          {state.errors?.emailTemplate && <span className="error">{state.errors.emailTemplate}</span>}
        </label>
        <p className="hint">
          La première ligne « Objet : … » devient l’objet de l’email. Champs remplis automatiquement : {TEMPLATE_FIELDS.join(', ')}.
        </p>
      </section>

      <div>
        <SubmitButton pendingText="Enregistrement…">Enregistrer les réglages</SubmitButton>
      </div>
    </form>
  );
}
