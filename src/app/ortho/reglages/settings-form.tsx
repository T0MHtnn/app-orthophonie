'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { AddressFields } from '@/components/address-fields';
import { useT } from '@/components/i18n-provider';
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
  const t = useT();
  // Modifications pas encore enregistrées : on compare le formulaire à son état enregistré.
  // Revenir soi-même à la valeur d'origine (cocher puis décocher) efface donc la mention.
  const form = useRef<HTMLFormElement>(null);
  const saved = useRef('');
  const [dirty, setDirty] = useState(false);
  const snapshot = () => (form.current ? JSON.stringify([...new FormData(form.current).entries()]) : '');
  const check = () => setDirty(snapshot() !== saved.current);
  useEffect(() => {
    // Au chargement, puis après chaque enregistrement (le formulaire repart des valeurs enregistrées).
    const id = requestAnimationFrame(() => {
      if (state.ok || !saved.current) {
        saved.current = snapshot();
        setDirty(false);
      }
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return (
    <form ref={form} action={action} className="stack" noValidate onChange={check} onInput={check}>
      <FormAlert state={state} />

      <section className="card stack">
        <h2>{t('Cabinet')}</h2>
        <Field label="Nom du cabinet" name="name" required defaultValue={initial.name} error={state.errors?.name} />
        <AddressFields initial={initial} errors={state.errors} />
        <label className="check">
          <input type="checkbox" name="listed" defaultChecked={initial.listed} />
          <span>
            <b>{t('Apparaître dans l’annuaire')}</b>
            <span className="hint" style={{ display: 'block' }}>
              {t('Votre cabinet est trouvable dans « Trouver un orthophoniste ». Décoché : les inscriptions restent possibles, mais seulement avec votre lien direct.')}
            </span>
          </span>
        </label>
      </section>

      <section className="card stack">
        <h2>{t('Liste d’attente')}</h2>
        <label className="check">
          <input type="checkbox" name="waitlistOpen" defaultChecked={initial.waitlistOpen} />
          <span>
            <b>{t('Inscriptions ouvertes')}</b>
            <span className="hint" style={{ display: 'block' }}>
              {t('Décoché : plus personne ne peut s’inscrire, même avec votre lien (et le cabinet disparaît de l’annuaire).')}
            </span>
          </span>
        </label>
        <label className="field">
          <span>{t('Texte affiché avant l’inscription')}</span>
          <textarea name="waitlistInfo" rows={14} defaultValue={initial.waitlistInfo} aria-invalid={state.errors?.waitlistInfo ? true : undefined} />
          {state.errors?.waitlistInfo && <span className="error">{t(state.errors.waitlistInfo)}</span>}
        </label>
        <p className="hint">{t('La première ligne sert de titre. « ## » en début de ligne pour un sous-titre, « * » pour une puce.')}</p>
      </section>

      <section className="card stack">
        <h2>{t('Email type « une place s’est libérée »')}</h2>
        <label className="field">
          <span>{t('Modèle d’email')}</span>
          <textarea name="emailTemplate" rows={16} defaultValue={initial.emailTemplate} aria-invalid={state.errors?.emailTemplate ? true : undefined} />
          {state.errors?.emailTemplate && <span className="error">{t(state.errors.emailTemplate)}</span>}
        </label>
        <p className="hint">
          {t('La première ligne « Objet : … » devient l’objet de l’email. Champs remplis automatiquement : {champs}.', { champs: TEMPLATE_FIELDS.join(', ') })}
        </p>
      </section>

      <div className={`save-bar ${dirty ? 'dirty' : ''}`}>
        <span className="sub">{t(dirty ? 'Modifications non enregistrées' : 'Les modifications ne sont prises en compte qu’après « Enregistrer ».')}</span>
        <SubmitButton pendingText="Enregistrement…">Enregistrer les réglages</SubmitButton>
      </div>
    </form>
  );
}
