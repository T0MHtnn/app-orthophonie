'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { isAdultAge } from '@/lib/age';
import { REQUEST_TYPES } from '@/lib/request-type';
import { submitWaitlist } from './actions';

interface Props {
  slug: string;
  practiceName: string;
  accountEmail: string;
  pathologies: { code: string; label: string }[];
}

export function WaitlistForm(props: Props) {
  const [state, action] = useActionState<FormState, FormData>(submitWaitlist.bind(null, props.slug), {});

  if (state.ok) {
    return (
      <div className="stack">
        <FormAlert state={state} persistent />
        <Link href="/patient" className="btn primary" style={{ width: 'fit-content' }}>
          Voir mes demandes
        </Link>
      </div>
    );
  }
  // Après chaque envoi, React réinitialise le formulaire : on le recrée avec les
  // valeurs renvoyées par le serveur pour ne rien perdre (listes et cases comprises).
  return <FormFields key={JSON.stringify(state.values ?? {})} {...props} state={state} action={action} />;
}

function FormFields({ state, action, practiceName, accountEmail, pathologies }: Props & { state: FormState; action: (fd: FormData) => void }) {
  const v = state.values ?? {};
  const err = state.errors ?? {};
  const [acknowledged, setAcknowledged] = useState(v.acknowledged === 'on');
  const [ageValue, setAgeValue] = useState(v.ageValue ?? '');
  const [ageUnit, setAgeUnit] = useState(v.ageUnit ?? 'ans');
  // Listes et cases contrôlées : leur valeur survit à la réinitialisation du formulaire par React.
  const [pathology, setPathology] = useState(v.pathology ?? '');
  const [requestType, setRequestType] = useState(v.requestType ?? '');
  const [consent, setConsent] = useState(v.consent === 'on');
  const adult = isAdultAge(ageValue, ageUnit);

  return (
    <form action={action} className="stack" noValidate>
      <label className={`check ack ${err.acknowledged ? 'invalid' : ''}`}>
        <input type="checkbox" name="acknowledged" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} aria-invalid={err.acknowledged ? true : undefined} />
        J’ai pris connaissance de ces informations
      </label>
      {err.acknowledged && <p className="error-text">{err.acknowledged}</p>}

      <fieldset disabled={!acknowledged} className="stack plain">
        <FormAlert state={state} />
        <fieldset className={`field plain ${err.requestType ? 'invalid' : ''}`} aria-describedby={err.requestType ? 'requestType-error' : undefined}>
          <legend>
            <b>Votre demande</b>
          </legend>
          <div className="choice choice-3">
            {REQUEST_TYPES.map((t) => (
              <label key={t.code}>
                <input type="radio" name="requestType" value={t.code} checked={requestType === t.code} onChange={() => setRequestType(t.code)} />
                <span>
                  {t.label}
                  {'hint' in t && <small className="hint"> ({t.hint})</small>}
                </span>
              </label>
            ))}
          </div>
          {err.requestType && (
            <span className="error" id="requestType-error">
              {err.requestType}
            </span>
          )}
        </fieldset>
        <div className="form-grid">
          <Field label="Nom du patient" name="patientLastName" autoComplete="family-name" required defaultValue={v.patientLastName} error={err.patientLastName} />
          <Field label="Prénom du patient" name="patientFirstName" autoComplete="given-name" required defaultValue={v.patientFirstName} error={err.patientFirstName} />

          <div className="field">
            <span>Âge du patient</span>
            <div className="age-row">
              <input
                name="ageValue"
                id="ageValue"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                value={ageValue}
                onChange={(e) => setAgeValue(e.target.value.replace(/[^0-9]/g, ''))}
                aria-label="Âge"
                aria-invalid={err.ageValue ? true : undefined}
              />
              <select name="ageUnit" value={ageUnit} onChange={(e) => setAgeUnit(e.target.value)} aria-label="Unité">
                <option value="ans">ans</option>
                <option value="mois">mois</option>
              </select>
            </div>
            {err.ageValue && <span className="error">{err.ageValue}</span>}
          </div>

          <label className="field">
            <span>Motif</span>
            <select name="pathology" value={pathology} onChange={(e) => setPathology(e.target.value)} required aria-invalid={err.pathology ? true : undefined}>
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

          <Field
            label="Nom du parent ou de l’aidant"
            name="caregiverLastName"
            disabled={adult}
            placeholder={adult ? 'Non nécessaire (patient majeur)' : ''}
            defaultValue={v.caregiverLastName}
            error={adult ? undefined : err.caregiverLastName}
          />
          <Field
            label="Prénom du parent ou de l’aidant"
            name="caregiverFirstName"
            disabled={adult}
            placeholder={adult ? 'Non nécessaire (patient majeur)' : ''}
            defaultValue={v.caregiverFirstName}
            error={adult ? undefined : err.caregiverFirstName}
          />
          <Field label="Email de contact" name="email" type="email" autoComplete="email" defaultValue={v.email ?? accountEmail} error={err.email} />
          <Field label="Téléphone (facultatif)" name="phone" type="tel" autoComplete="tel" placeholder="06 12 34 56 78" maxLength={30} defaultValue={v.phone} error={err.phone} />
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

        <label className={`check ${err.consent ? 'invalid' : ''}`}>
          <input type="checkbox" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={err.consent ? true : undefined} />
          <span>
            J’accepte que ces informations soient transmises à {practiceName} pour organiser la prise en charge. Elles ne sont utilisées pour rien d’autre et
            peuvent être supprimées sur simple demande au cabinet.
          </span>
        </label>
        {err.consent && <p className="error-text">{err.consent}</p>}

        <div>
          <SubmitButton pendingText="Envoi…">M’inscrire sur la liste d’attente</SubmitButton>
        </div>
      </fieldset>
    </form>
  );
}
