'use client';

import { useActionState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { saveAppointment } from './actions';

export interface AppointmentDefaults {
  id: string;
  patientId: string;
  date: string;
  time: string;
  duration: string;
}

/** Ajout ou déplacement d'un rendez-vous (heures de Paris). */
export function AppointmentForm({ patients, defaults }: { patients: { id: string; name: string }[]; defaults: AppointmentDefaults }) {
  const [state, action] = useActionState<FormState, FormData>(saveAppointment, {});
  const v = { ...defaults, ...state.values };
  const err = state.errors ?? {};
  return (
    // key : React vide le formulaire après l'action, on le recrée avec les valeurs renvoyées.
    <form key={JSON.stringify(v)} action={action} className="stack" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="id" value={v.id} />
      <div className="form-grid">
        <label className="field">
          <span>Patient</span>
          <select name="patientId" defaultValue={v.patientId} required aria-invalid={err.patientId ? true : undefined}>
            <option value="" disabled>
              Choisir…
            </option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {err.patientId && <span className="error">{err.patientId}</span>}
        </label>
        <Field label="Date" name="date" type="date" required defaultValue={v.date} error={err.date} />
        <Field label="Heure" name="time" type="time" step={300} required defaultValue={v.time} error={err.time} />
        <Field label="Durée (minutes)" name="duration" type="number" min={10} max={240} step={5} required defaultValue={v.duration} error={err.duration} />
      </div>
      <div>
        <SubmitButton pendingText="Enregistrement…">{v.id ? 'Déplacer le rendez-vous' : 'Ajouter le rendez-vous'}</SubmitButton>
      </div>
    </form>
  );
}
