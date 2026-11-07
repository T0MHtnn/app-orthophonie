'use client';

import { useActionState, useEffect, useState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { TEMPLATE_FIELDS } from '@/lib/defaults';
import { saveSettings } from './actions';

interface Props {
  name: string;
  addressLine: string;
  postalCode: string;
  city: string;
  listed: boolean;
  waitlistOpen: boolean;
  waitlistInfo: string;
  emailTemplate: string;
}

export function SettingsForm(initial: Props) {
  const [state, action] = useActionState<FormState, FormData>(saveSettings, {});
  // Modifications pas encore enregistrées : barre visible en bas + alerte si on quitte la page.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (state.ok) setDirty(false);
  }, [state]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return (
    <form action={action} className="stack" noValidate onChange={() => setDirty(true)}>
      <FormAlert state={state} />

      <section className="card stack">
        <h2>Cabinet</h2>
        <Field label="Nom du cabinet" name="name" required defaultValue={initial.name} error={state.errors?.name} />
        <Field label="Adresse (facultatif)" name="addressLine" autoComplete="street-address" maxLength={200} defaultValue={initial.addressLine} error={state.errors?.addressLine} />
        <div className="form-grid">
          <Field label="Code postal" name="postalCode" inputMode="numeric" autoComplete="postal-code" required maxLength={5} defaultValue={initial.postalCode} error={state.errors?.postalCode} />
          <Field label="Ville" name="city" autoComplete="address-level2" required maxLength={100} defaultValue={initial.city} error={state.errors?.city} />
        </div>
        <label className="check">
          <input type="checkbox" name="listed" defaultChecked={initial.listed} />
          <span>
            <b>Apparaître dans l’annuaire</b>
            <span className="hint" style={{ display: 'block' }}>
              Les familles trouvent votre cabinet dans « Trouver un orthophoniste » (nom, ville, adresse). Décoché : seul votre lien direct permet de s’inscrire.
            </span>
          </span>
        </label>
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

      <div className={`save-bar ${dirty ? 'dirty' : ''}`}>
        <span className="sub">{dirty ? 'Modifications non enregistrées' : 'Les modifications ne sont prises en compte qu’après « Enregistrer ».'}</span>
        <SubmitButton pendingText="Enregistrement…">Enregistrer les réglages</SubmitButton>
      </div>
    </form>
  );
}
