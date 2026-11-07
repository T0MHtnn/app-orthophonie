'use client';

import { useActionState, useState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import { slugify } from '@/lib/slug';
import { createPractice } from './actions';

export function PracticeForm({ siteUrl, suggestedName }: { siteUrl: string; suggestedName: string }) {
  const [state, action] = useActionState<FormState, FormData>(createPractice, {});
  const [slug, setSlug] = useState(state.values?.slug ?? slugify(suggestedName));
  const [touched, setTouched] = useState(false);
  const t = useT();

  return (
    <form action={action} className="stack" noValidate>
      <FormAlert state={state} />
      <Field
        label="Nom du cabinet"
        name="name"
        required
        defaultValue={state.values?.name ?? suggestedName}
        error={state.errors?.name}
        onChange={(e) => !touched && setSlug(slugify(e.target.value))}
      />
      <Field
        label="Adresse de votre page publique"
        name="slug"
        required
        value={slug}
        onChange={(e) => {
          setTouched(true);
          setSlug(e.target.value.toLowerCase());
        }}
        error={state.errors?.slug}
      />
      <p className="hint">
        {t('Les familles s’inscriront sur')} {siteUrl}/c/<b>{slug || '…'}</b>
      </p>
      <Field label="Adresse du cabinet (facultatif)" name="addressLine" autoComplete="street-address" maxLength={200} defaultValue={state.values?.addressLine} error={state.errors?.addressLine} />
      <div className="form-grid">
        <Field label="Code postal" name="postalCode" inputMode="numeric" autoComplete="postal-code" required maxLength={5} defaultValue={state.values?.postalCode} error={state.errors?.postalCode} />
        <Field label="Ville" name="city" autoComplete="address-level2" required maxLength={100} defaultValue={state.values?.city} error={state.errors?.city} />
      </div>
      <p className="hint">{t('Les familles trouvent votre cabinet par sa ville ou son code postal dans « Trouver un orthophoniste ».')}</p>
      <Field label="Numéro RPPS" name="rpps" inputMode="numeric" required maxLength={14} defaultValue={state.values?.rpps} error={state.errors?.rpps} />
      <p className="hint">{t('Il sert à vérifier que vous êtes bien orthophoniste. Votre page publique s’ouvre après cette vérification.')}</p>
      <SubmitButton pendingText="Création…">Créer mon cabinet</SubmitButton>
    </form>
  );
}
