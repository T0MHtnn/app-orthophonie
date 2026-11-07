'use client';

import { useActionState, useState, useTransition } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { matchesSearch } from '@/lib/search';
import { saveBookingSettings, setPatientAutonomous } from './actions';

const MODES = [
  { code: 'ortho', label: 'Moi seul·e', hint: 'Les familles voient leurs rendez-vous mais ne réservent pas en ligne.' },
  { code: 'autonomes', label: 'Les patients autonomes', hint: 'Seuls les patients cochés dans la liste ci-dessous réservent en ligne.' },
  { code: 'tous', label: 'Tous mes patients suivis', hint: 'Votre liste d’autonomes est gardée : vous la retrouvez en revenant à « autonomes ».' },
] as const;

const VALIDATIONS = [
  { code: 'manuelle', label: 'Je valide chaque réservation', hint: 'Le créneau est réservé « à valider » jusqu’à votre accord.' },
  { code: 'auto', label: 'Confirmation automatique', hint: 'Le rendez-vous est confirmé dès la réservation.' },
] as const;

export function BookingForm({ mode, validation, minNoticeHours }: { mode: string; validation: string; minNoticeHours: number }) {
  const [state, action] = useActionState<FormState, FormData>(saveBookingSettings, {});
  const v = state.values ?? { mode, validation, minNoticeHours: String(minNoticeHours) };
  const [m, setM] = useState(v.mode);
  const [val, setVal] = useState(v.validation);
  return (
    <form action={action} className="stack" noValidate>
      <FormAlert state={state} />
      <fieldset className="field plain">
        <legend>
          <b>Qui peut réserver en ligne ?</b>
        </legend>
        <div className="choice choice-3">
          {MODES.map((o) => (
            <label key={o.code}>
              <input type="radio" name="mode" value={o.code} checked={m === o.code} onChange={() => setM(o.code)} />
              <span>
                {o.label}
                <small className="hint" style={{ display: 'block', fontWeight: 400 }}>
                  {o.hint}
                </small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {m !== 'ortho' && (
        <>
          <fieldset className="field plain">
            <legend>
              <b>Validation des réservations</b>
            </legend>
            <div className="choice">
              {VALIDATIONS.map((o) => (
                <label key={o.code}>
                  <input type="radio" name="validation" value={o.code} checked={val === o.code} onChange={() => setVal(o.code)} />
                  <span>
                    {o.label}
                    <small className="hint" style={{ display: 'block', fontWeight: 400 }}>
                      {o.hint}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            label="Délai minimum avant un rendez-vous réservé en ligne (heures)"
            name="minNoticeHours"
            type="number"
            min={0}
            max={720}
            required
            defaultValue={v.minNoticeHours}
            error={state.errors?.minNoticeHours}
          />
        </>
      )}
      {m === 'ortho' && (
        <>
          <input type="hidden" name="validation" value={val} />
          <input type="hidden" name="minNoticeHours" value={v.minNoticeHours} />
        </>
      )}
      <div>
        <SubmitButton pendingText="Enregistrement…">Enregistrer</SubmitButton>
      </div>
    </form>
  );
}

/** Liste des patients autonomes : chaque case s'enregistre tout de suite. */
export function AutonomousList({ patients, mode }: { patients: { id: string; name: string; autonomous: boolean }[]; mode: string }) {
  const [checked, setChecked] = useState(() => new Map(patients.map((p) => [p.id, p.autonomous])));
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [, startTransition] = useTransition();
  const count = [...checked.values()].filter(Boolean).length;

  const toggle = (id: string, value: boolean) => {
    setChecked((prev) => new Map(prev).set(id, value));
    startTransition(async () => {
      const res = await setPatientAutonomous(id, value);
      if (!res.ok) {
        setError(true);
        setChecked((prev) => new Map(prev).set(id, !value));
      }
    });
  };

  if (patients.length === 0) return <p className="hint">Aucun patient suivi pour l’instant.</p>;
  return (
    <div className="stack">
      <p className="sub">
        {count} patient{count > 1 ? 's' : ''} autonome{count > 1 ? 's' : ''}
        {mode === 'tous' && ' · en mode « tous », cette liste est conservée mais tout le monde peut réserver'}
        {mode === 'ortho' && ' · en mode « moi seul·e », personne ne réserve en ligne'}
      </p>
      {error && <p className="alert error">Une modification n’a pas pu être enregistrée. Rechargez la page.</p>}
      {patients.length > 8 && (
        <input type="search" className="field-inline" placeholder="Rechercher" aria-label="Rechercher un patient" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      <div className="autonomous-list">
        {patients
          .filter((p) => matchesSearch(query, [p.name]))
          .map((p) => (
            <label key={p.id} className="check">
              <input type="checkbox" checked={checked.get(p.id) ?? false} onChange={(e) => toggle(p.id, e.target.checked)} /> {p.name}
            </label>
          ))}
      </div>
    </div>
  );
}
