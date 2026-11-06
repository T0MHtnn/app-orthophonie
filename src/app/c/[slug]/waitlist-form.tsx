'use client';

import { useActionState, useState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { submitWaitlist } from './actions';

interface Props {
  slug: string;
  practiceName: string;
  pathologies: { code: string; label: string }[];
}

export function WaitlistForm({ slug, practiceName, pathologies }: Props) {
  const [state, action] = useActionState<FormState, FormData>(submitWaitlist.bind(null, slug), {});
  const [acknowledged, setAcknowledged] = useState(state.values?.acknowledged === 'on');
  const v = state.values ?? {};
  const err = state.errors ?? {};

  if (state.ok) return <FormAlert state={state} />;

  return (
    <form action={action} className="stack" noValidate>
      <label className="check ack">
        <input type="checkbox" name="acknowledged" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
        J’ai pris connaissance de ces informations
      </label>
      {err.acknowledged && <p className="alert error">{err.acknowledged}</p>}

      <fieldset disabled={!acknowledged} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <FormAlert state={state} />
        <div className="form-grid">
          <Field label="Nom du patient" name="patientLastName" autoComplete="family-name" required defaultValue={v.patientLastName} error={err.patientLastName} />
          <Field label="Prénom du patient" name="patientFirstName" autoComplete="given-name" required defaultValue={v.patientFirstName} error={err.patientFirstName} />
          <Field label="Âge du patient" name="patientAge" placeholder="ex. 7 ans" required defaultValue={v.patientAge} error={err.patientAge} />
          <label className="field">
            <span>Motif</span>
            <select name="pathology" defaultValue={v.pathology ?? ''} required aria-invalid={err.pathology ? true : undefined}>
              <option value="" disabled>
                Choisir…
              </option>
              {pathologies.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
            {err.pathology && <span className="error">{err.pathology}</span>}
          </label>
          <Field label="Nom du parent ou de l’aidant" name="caregiverLastName" placeholder="si le patient est mineur" defaultValue={v.caregiverLastName} error={err.caregiverLastName} />
          <Field label="Prénom du parent ou de l’aidant" name="caregiverFirstName" defaultValue={v.caregiverFirstName} error={err.caregiverFirstName} />
          <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={v.email} error={err.email} />
          <Field label="Téléphone" name="phone" type="tel" autoComplete="tel" defaultValue={v.phone} error={err.phone} />
          <label className="field wide">
            <span>Informations complémentaires (facultatif)</span>
            <textarea name="notes" rows={3} maxLength={2000} defaultValue={v.notes} />
          </label>
        </div>

        {/* Champ piège : invisible pour un humain, rempli par les robots. */}
        <div className="honeypot" aria-hidden="true">
          <label>
            Site web <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <label className="check">
          <input type="checkbox" name="consent" defaultChecked={v.consent === 'on'} />
          <span>
            J’accepte que ces informations soient transmises à {practiceName} pour organiser la prise en charge. Elles ne sont utilisées pour rien d’autre et
            peuvent être supprimées sur simple demande au cabinet.
          </span>
        </label>
        {err.consent && <p className="alert error">{err.consent}</p>}

        <div>
          <SubmitButton pendingText="Envoi…">M’inscrire sur la liste d’attente</SubmitButton>
        </div>
      </fieldset>
    </form>
  );
}
