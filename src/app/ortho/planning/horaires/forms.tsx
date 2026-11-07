'use client';

import { useActionState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { WEEKDAYS } from '@/lib/time';
import { addOpeningHour, addScheduleException, saveSessionMinutes } from '../actions';

export function SessionForm({ sessionMinutes }: { sessionMinutes: number }) {
  const [state, action] = useActionState<FormState, FormData>(saveSessionMinutes, {});
  return (
    <form action={action} className="row" noValidate>
      <Field
        label="Durée d’une séance (minutes)"
        name="sessionMinutes"
        type="number"
        min={10}
        max={180}
        step={5}
        required
        defaultValue={String(sessionMinutes)}
        error={state.errors?.sessionMinutes}
      />
      <SubmitButton className="btn small">Enregistrer</SubmitButton>
      <FormAlert state={state} />
    </form>
  );
}

export function OpeningHourForm() {
  const [state, action] = useActionState<FormState, FormData>(addOpeningHour, {});
  const v = state.values ?? {};
  return (
    <form key={JSON.stringify(v)} action={action} className="stack" noValidate>
      <FormAlert state={state} />
      <div className="form-grid">
        <label className="field">
          <span>Jour</span>
          <select name="weekday" defaultValue={v.weekday ?? '1'}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <Field label="De" name="start" type="time" step={300} required defaultValue={v.start ?? '09:00'} error={state.errors?.start} />
        <Field label="À" name="end" type="time" step={300} required defaultValue={v.end ?? '12:00'} error={state.errors?.end} />
      </div>
      <div>
        <SubmitButton className="btn small">Ajouter la plage</SubmitButton>
      </div>
    </form>
  );
}

export function ExceptionForm({ today }: { today: string }) {
  const [state, action] = useActionState<FormState, FormData>(addScheduleException, {});
  const v = state.ok ? {} : (state.values ?? {});
  const err = state.errors ?? {};
  return (
    <form key={JSON.stringify(state)} action={action} className="stack" noValidate>
      <FormAlert state={state} />
      <div className="form-grid">
        <label className="field">
          <span>Type</span>
          <select name="kind" defaultValue={v.kind ?? 'ferme'}>
            <option value="ferme">Fermeture (congés, formation…)</option>
            <option value="ouvert">Ouverture exceptionnelle</option>
          </select>
        </label>
        <Field label="Libellé (facultatif, visible par vous seul)" name="label" maxLength={120} defaultValue={v.label} error={err.label} />
        <Field label="Du" name="startDate" type="date" required defaultValue={v.startDate ?? today} error={err.startDate} />
        <Field label="À partir de" name="startTime" type="time" step={300} required defaultValue={v.startTime ?? '00:00'} error={err.startTime} />
        <Field label="Au" name="endDate" type="date" required defaultValue={v.endDate ?? today} error={err.endDate} />
        <Field label="Jusqu’à" name="endTime" type="time" step={300} required defaultValue={v.endTime ?? '23:55'} error={err.endTime} />
      </div>
      <div>
        <SubmitButton className="btn small">Ajouter</SubmitButton>
      </div>
    </form>
  );
}
