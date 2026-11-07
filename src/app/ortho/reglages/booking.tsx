'use client';

import { useActionState, useState, useTransition } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import { matchesSearch } from '@/lib/search';
import { saveBookingSettings, setPatientAutonomous } from './actions';

const MODES = [
  { code: 'ortho', label: 'Moi seul·e', hint: 'Les patients voient leurs rendez-vous mais ne réservent pas en ligne.' },
  { code: 'autonomes', label: 'Les patients autonomes', hint: 'Seuls les patients cochés ci-dessous réservent, confirmés tout de suite.' },
  { code: 'tous', label: 'Tous mes patients suivis', hint: 'Les non-autonomes envoient une demande que vous validez. Votre liste d’autonomes est gardée.' },
] as const;

export function BookingForm({ mode, minNoticeHours, linksRespectNotice }: { mode: string; minNoticeHours: number; linksRespectNotice: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(saveBookingSettings, {});
  const v = state.values ?? { mode, minNoticeHours: String(minNoticeHours), linksRespectNotice: linksRespectNotice ? 'on' : '' };
  // React vide le formulaire après l'action : on le recrée avec les valeurs enregistrées (sinon l'ancien choix réapparaît).
  return <BookingFields key={JSON.stringify(v)} state={state} action={action} values={v} />;
}

function BookingFields({ state, action, values: v }: { state: FormState; action: (fd: FormData) => void; values: Record<string, string> }) {
  const [m, setM] = useState(v.mode);
  const t = useT();
  return (
    <form action={action} className="stack" noValidate>
      <FormAlert state={state} />
      <fieldset className="field plain">
        <legend>
          <b>{t('Qui peut réserver en ligne ?')}</b>
        </legend>
        <div className="choice choice-3">
          {MODES.map((o) => (
            <label key={o.code}>
              <input type="radio" name="mode" value={o.code} checked={m === o.code} onChange={() => setM(o.code)} />
              <span>
                {t(o.label)}
                <small className="hint" style={{ display: 'block', fontWeight: 400 }}>
                  {t(o.hint)}
                </small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {m !== 'ortho' && (
        <p className="hint">
          {t(
            'Un patient autonome qui réserve est confirmé tout de suite. En mode « tous », un patient non autonome envoie une demande : elle apparaît en orange dans votre planning, à accepter ou refuser.',
          )}
        </p>
      )}
      {/* Le délai sert aussi aux liens envoyés par email (place libérée), même en mode « moi seul·e ». */}
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
      <label className="check">
        <input type="checkbox" name="linksRespectNotice" defaultChecked={v.linksRespectNotice === 'on'} />
        <span>
          <b>{t('Appliquer aussi ce délai aux liens envoyés par email')}</b>
          <span className="hint" style={{ display: 'block' }}>
            {t('Séances libérées proposées par email à vos patients suivis. Décoché : le patient peut prendre la séance même si elle commence dans moins de ce délai.')}
          </span>
        </span>
      </label>
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
  const t = useT();
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

  if (patients.length === 0) return <p className="hint">{t('Aucun patient suivi pour l’instant.')}</p>;
  return (
    <div className="stack">
      <p className="sub">
        {t(count > 1 ? '{n} patients autonomes' : '{n} patient autonome', { n: count })}
        {mode === 'tous' && ` · ${t('en mode « tous », les autonomes sont confirmés tout de suite, les autres envoient une demande')}`}
        {mode === 'ortho' && ` · ${t('en mode « moi seul·e », personne ne réserve en ligne')}`}
      </p>
      {error && <p className="alert error">{t('Une modification n’a pas pu être enregistrée. Rechargez la page.')}</p>}
      {patients.length > 8 && (
        <input type="search" className="field-inline" placeholder={t('Rechercher')} aria-label={t('Rechercher un patient')} value={query} onChange={(e) => setQuery(e.target.value)} />
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
