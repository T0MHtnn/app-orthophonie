'use client';

import { useActionState, useState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import type { CaregiverRow } from '@/lib/database.types';
import { addCaregiver, deleteCaregiver, setCaregiverEmails } from '../actions';

/** Aidants supplémentaires (l'aidant principal, issu de l'inscription, est dans la fiche). */
export function Caregivers({ patientId, caregivers }: { patientId: string; caregivers: CaregiverRow[] }) {
  const [state, action] = useActionState<FormState, FormData>(addCaregiver, {});
  const [open, setOpen] = useState(false);
  const t = useT();
  const v = state.ok ? {} : (state.values ?? {});
  const e = state.errors ?? {};
  return (
    <div className="stack">
      {caregivers.length === 0 && <p className="hint">{t('Aucun autre aidant.')}</p>}
      {caregivers.map((c) => (
        <div key={c.id} className="request">
          <div>
            <b>
              {c.first_name} {c.last_name}
            </b>
            {c.relation && <span className="hint"> · {c.relation}</span>}
            <div className="hint">
              {c.phone && <a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a>}
              {c.phone && c.email && ' · '}
              {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
            </div>
            {c.receives_emails && <span className="badge rdv">{t('Reçoit les emails')}</span>}
          </div>
          <div className="row">
            {c.email && (
              <form action={setCaregiverEmails}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="receives" value={c.receives_emails ? 'non' : 'oui'} />
                <SubmitButton className="btn small">{c.receives_emails ? 'Ne plus envoyer les emails' : 'Lui envoyer les emails'}</SubmitButton>
              </form>
            )}
            <form action={deleteCaregiver}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton className="linkbtn danger">Retirer</SubmitButton>
            </form>
          </div>
        </div>
      ))}
      {open ? (
        <form key={JSON.stringify(state)} action={action} className="stack note-form" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="patientId" value={patientId} />
          <div className="form-grid">
            <Field label="Prénom" name="firstName" required maxLength={80} defaultValue={v.firstName} error={e.firstName} />
            <Field label="Nom" name="lastName" required maxLength={80} defaultValue={v.lastName} error={e.lastName} />
            <Field label="Lien avec le patient" name="relation" maxLength={60} placeholder="Ex. : père, grand-mère, éducatrice" defaultValue={v.relation} error={e.relation} />
            <Field label="Téléphone" name="phone" type="tel" maxLength={30} defaultValue={v.phone} error={e.phone} />
            <Field label="Email" name="email" type="email" maxLength={254} defaultValue={v.email} error={e.email} />
          </div>
          <label className="check">
            <input type="checkbox" name="receivesEmails" defaultChecked={v.receivesEmails === 'on'} />
            <span>{t('Reçoit aussi les emails du cabinet (rappels, séances, créneaux libérés)')}</span>
          </label>
          <div className="row">
            <SubmitButton className="btn primary small">Ajouter l’aidant</SubmitButton>
            <button type="button" className="btn small" onClick={() => setOpen(false)}>
              {t('Annuler')}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button type="button" className="btn small" onClick={() => setOpen(true)}>
            + {t('Ajouter un aidant')}
          </button>
        </div>
      )}
    </div>
  );
}
