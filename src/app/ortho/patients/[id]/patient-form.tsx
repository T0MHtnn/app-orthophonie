'use client';

import { useActionState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import type { PatientRow } from '@/lib/database.types';
import { savePatient } from '../actions';

interface Option {
  code: string;
  label: string;
}

interface Props {
  patient: PatientRow;
  acts: (Option & { sessions: number | null })[];
  pathologies: Option[];
  requestTypes: Option[];
}

/** Informations modifiables de la fiche. L'email est celui du compte du patient (modifiable par lui seul). */
export function PatientForm({ patient, acts, pathologies, requestTypes }: Props) {
  const [state, action] = useActionState<FormState, FormData>(savePatient, {});
  const t = useT();
  const today = new Date().toISOString().slice(0, 10);
  // Valeurs renvoyées après un enregistrement : React 19 réinitialise le formulaire, on le recrée avec elles.
  const v = state.values ?? {
    firstName: patient.first_name,
    lastName: patient.last_name,
    birthDate: patient.birth_date ?? '',
    patientAge: patient.patient_age ?? '',
    caregiverFirstName: patient.caregiver_first_name ?? '',
    caregiverLastName: patient.caregiver_last_name ?? '',
    phone: patient.phone ?? '',
    pathology: patient.pathology_code ?? '',
    requestType: patient.request_type ?? '',
    prescriberName: patient.prescriber_name ?? '',
    prescriptionDate: patient.prescription_date ?? '',
    amoAct: patient.amo_act_code ?? '',
    sessionsPrescribed: patient.sessions_prescribed ? String(patient.sessions_prescribed) : '',
  };
  const e = state.errors ?? {};

  return (
    <form key={JSON.stringify(v)} action={action} className="stack" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="id" value={patient.id} />

      <h3>{t('Identité')}</h3>
      <div className="form-grid">
        <Field label="Prénom" name="firstName" required maxLength={80} defaultValue={v.firstName} error={e.firstName} />
        <Field label="Nom" name="lastName" required maxLength={80} defaultValue={v.lastName} error={e.lastName} />
        <Field label="Date de naissance" name="birthDate" type="date" min="1900-01-01" max={today} defaultValue={v.birthDate} error={e.birthDate} />
        <Field label="Âge indiqué à l’inscription" name="patientAge" maxLength={30} defaultValue={v.patientAge} error={e.patientAge} />
      </div>
      <p className="hint">{t('Avec la date de naissance, l’âge se met à jour tout seul.')}</p>

      <h3>{t('Parent / aidant et contact')}</h3>
      <div className="form-grid">
        <Field label="Prénom du parent / aidant" name="caregiverFirstName" maxLength={80} defaultValue={v.caregiverFirstName} error={e.caregiverFirstName} />
        <Field label="Nom du parent / aidant" name="caregiverLastName" maxLength={80} defaultValue={v.caregiverLastName} error={e.caregiverLastName} />
        <Field label="Téléphone" name="phone" type="tel" autoComplete="off" maxLength={30} defaultValue={v.phone} error={e.phone} />
        <label className="field">
          <span>{t('Email')}</span>
          <input value={patient.email ?? ''} disabled readOnly />
        </label>
      </div>
      <p className="hint">{t('L’email est celui du compte du patient : lui seul peut le changer, depuis son espace.')}</p>

      <h3>{t('Prise en charge')}</h3>
      <div className="form-grid">
        <label className="field">
          <span>{t('Motif')}</span>
          <select name="pathology" defaultValue={v.pathology}>
            <option value="">—</option>
            {pathologies.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('Type de demande')}</span>
          <select name="requestType" defaultValue={v.requestType}>
            <option value="">—</option>
            {requestTypes.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3>{t('Prescription')}</h3>
      <div className="form-grid">
        <Field label="Médecin prescripteur" name="prescriberName" maxLength={120} placeholder="Ex. : Dr Martin" defaultValue={v.prescriberName} error={e.prescriberName} />
        <Field label="Date de prescription" name="prescriptionDate" type="date" min="2000-01-01" max={today} defaultValue={v.prescriptionDate} error={e.prescriptionDate} />
        <label className={`field ${e.amoAct ? 'invalid' : ''}`}>
          <span>{t('Acte AMO')}</span>
          <select name="amoAct" defaultValue={v.amoAct} aria-invalid={e.amoAct ? true : undefined}>
            <option value="">{t('À choisir')}</option>
            {acts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>
          {e.amoAct && <span className="error">{t(e.amoAct)}</span>}
        </label>
        <Field label="Nombre de séances prescrites" name="sessionsPrescribed" type="number" inputMode="numeric" min={1} max={200} defaultValue={v.sessionsPrescribed} error={e.sessionsPrescribed} />
      </div>
      <p className="hint">{t('Les séances sont comptées à partir de la date de prescription : une nouvelle prescription démarre une nouvelle série.')}</p>

      <div>
        <SubmitButton pendingText="Enregistrement…">Enregistrer la fiche</SubmitButton>
      </div>
    </form>
  );
}
