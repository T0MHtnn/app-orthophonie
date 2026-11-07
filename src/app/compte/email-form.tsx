'use client';

import { useActionState, useId, useState } from 'react';
import { Field, FormAlert, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import { Modal } from '@/components/modal';
import { changeEmail } from './actions';

/**
 * Nouvelle adresse email. Une pop-up explique ce qui va se passer avant l'envoi du lien :
 * l'adresse ne change qu'au clic sur ce lien, puis tous les appareils sont déconnectés.
 */
export function EmailForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeEmail, {});
  const t = useT();
  const formId = useId();
  const [confirm, setConfirm] = useState<string | null>(null);
  if (state.ok) return <FormAlert state={state} persistent />;
  return (
    <>
      <form id={formId} key={JSON.stringify(state.values ?? {})} action={action} className="stack" noValidate onSubmit={() => setConfirm(null)}>
        <FormAlert state={state} />
        <p className="sub">
          {t('Adresse actuelle :')} <b>{current}</b>
        </p>
        <Field
          label="Nouvelle adresse email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          error={state.errors?.email}
        />
        <div>
          <button type="button" className="btn primary" disabled={pending} onClick={(e) => setConfirm(((e.currentTarget.form?.elements.namedItem('email') as HTMLInputElement | null)?.value ?? '').trim())}>
            {t(pending ? 'Envoi…' : 'Changer d’adresse email')}
          </button>
        </div>
      </form>
      {confirm !== null && (
        <Modal onClose={() => setConfirm(null)}>
          <div className="stack">
            <h2>{t('Changer d’adresse email ?')}</h2>
            <p>{t('Un lien de confirmation va être envoyé à {email}.', { email: confirm || '…' })}</p>
            <div className="alert info">
              {t(
                'Votre adresse ne changera qu’au clic sur ce lien. À ce moment-là, vous serez déconnecté de tous vos appareils et devrez vous reconnecter avec la nouvelle adresse email.',
              )}
            </div>
            <div className="row">
              <button type="submit" form={formId} className="btn primary">
                {t('Envoyer le lien')}
              </button>
              <button type="button" className="btn" onClick={() => setConfirm(null)}>
                {t('Annuler')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
