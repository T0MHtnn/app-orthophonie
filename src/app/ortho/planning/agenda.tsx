'use client';

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { RECURRENCES, isFree, type AgendaDay, type BlockInput, type Interval } from '@/lib/agenda';
import { matchesSearch } from '@/lib/search';
import { WEEKDAYS, formatDay, formatTime, minutesToTime } from '@/lib/time';
import { setPatientAutonomous } from '../reglages/actions';
import { cancelAppointment, deleteBlock, saveAppointment, saveBlock } from './actions';

/** Hauteur d'une minute dans la grille, en pixels. */
const PX = 1.1;
/** Pas de placement quand on clique ou dépose sur la grille. */
const SNAP = 15;

export interface PatientItem {
  id: string;
  name: string;
  /** Prochain rendez-vous (AAAA-MM-JJ) ou null. */
  next: string | null;
}

/** Fiche patient (pop-up d'un rendez-vous). */
export interface PatientDetail {
  name: string;
  age: string | null;
  caregiver: string | null;
  email: string | null;
  phone: string | null;
  pathology: string | null;
  requestType: string | null;
  autonomous: boolean;
}

type BookingMode = 'ortho' | 'autonomes' | 'tous';

interface Props {
  details: Record<string, PatientDetail>;
  bookingMode: BookingMode;
  days: AgendaDay[];
  range: Interval;
  today: string;
  nowMinutes: number;
  blocks: BlockInput[];
  patients: PatientItem[];
  sessionMinutes: number;
}

type Dialog =
  | { kind: 'block'; date: string; start: number; end: number; block?: BlockInput; occurrence?: string }
  | { kind: 'appointment'; id: string; patientId: string; date: string; start: number; duration: number; label: string };

export function Agenda({ days, range, today, nowMinutes, blocks, patients, sessionMinutes, details, bookingMode }: Props) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [picked, setPicked] = useState<PatientItem | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const height = (range.end - range.start) * PX;
  const blockById = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);

  // Minute (arrondie) sous le pointeur dans une colonne.
  const minuteAt = (e: { clientY: number; currentTarget: HTMLElement }) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    return Math.min(range.end - SNAP, Math.max(range.start, range.start + Math.floor(y / PX / SNAP) * SNAP));
  };

  const place = (day: AgendaDay, patientId: string, start: number, duration: number, appointmentId = '') => {
    if (!isFree(day, { start, end: start + duration }, appointmentId || undefined)) {
      setNotice({ kind: 'error', text: 'Ce créneau est déjà pris ou bloqué.' });
      return;
    }
    const fd = new FormData();
    fd.set('id', appointmentId);
    fd.set('patientId', patientId);
    fd.set('date', day.date);
    fd.set('time', minutesToTime(start));
    fd.set('duration', String(duration));
    startTransition(async () => {
      const res = await saveAppointment({}, fd);
      setNotice({ kind: res.ok ? 'ok' : 'error', text: res.message ?? (res.ok ? 'Enregistré.' : 'Enregistrement impossible.') });
      if (res.ok) setPicked(null);
    });
  };

  const onColumnClick = (day: AgendaDay, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // clic sur un rendez-vous ou un blocage
    const start = minuteAt(e);
    if (picked) place(day, picked.id, start, sessionMinutes);
    else setDialog({ kind: 'block', date: day.date, start, end: Math.min(range.end, start + 60) });
  };

  const onDrop = (day: AgendaDay, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-agenda');
    if (!raw) return;
    const data = JSON.parse(raw) as { patientId: string; appointmentId?: string; duration?: number };
    place(day, data.patientId, minuteAt(e), data.duration ?? sessionMinutes, data.appointmentId);
  };

  const [query, setQuery] = useState('');
  const shownPatients = patients.filter((p) => matchesSearch(query, [p.name]));

  return (
    <div className="planning-layout">
      <div className="stack">
        {notice && (
          <p className={`alert ${notice.kind}`} role="status">
            {notice.text}
          </p>
        )}
        {picked && (
          <p className="alert warn row spread">
            <span>
              Cliquez sur l’agenda pour placer <b>{picked.name}</b>.
            </span>
            <button type="button" className="btn small" onClick={() => setPicked(null)}>
              Annuler
            </button>
          </p>
        )}
        <div className="card agenda-wrap" aria-busy={pending}>
          <div className="agenda" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(100px, 1fr))` }}>
            <div />
            {days.map((d) => (
              <div key={d.date} className={`agenda-head ${d.date === today ? 'today' : ''}`}>
                {formatDay(d.date, true)}
              </div>
            ))}
            <div className="agenda-hours" style={{ height }}>
              {Array.from({ length: (range.end - range.start) / 60 }, (_, i) => (
                <span key={i} style={{ top: i * 60 * PX }}>
                  {range.start / 60 + i} h
                </span>
              ))}
            </div>
            {days.map((d) => (
              <div
                key={d.date}
                className={`agenda-col ${d.date < today ? 'past' : ''} ${picked ? 'picking' : ''}`}
                style={{ height, backgroundSize: `100% ${60 * PX}px` }}
                onClick={(e) => onColumnClick(d, e)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(d, e)}
              >
                {d.date === today && nowMinutes >= range.start && nowMinutes <= range.end && (
                  <div className="agenda-now" style={{ top: (nowMinutes - range.start) * PX }} />
                )}
                {d.blocks.map((b) => (
                  <button
                    type="button"
                    key={`${b.blockId}-${b.date}-${b.start}`}
                    className="agenda-closed"
                    style={pos(b, range.start)}
                    onClick={() => {
                      const block = blockById.get(b.blockId);
                      if (block) setDialog({ kind: 'block', date: b.date, start: b.start, end: b.end, block, occurrence: b.date });
                    }}
                  >
                    {b.recurring && <span aria-label="répété">↻ </span>}
                    {b.title || 'Bloqué'}
                  </button>
                ))}
                {d.appointments.map((a) => {
                  const duration = a.end - a.start;
                  return (
                    <button
                      type="button"
                      key={a.id}
                      className={`agenda-appt ${a.status}`}
                      style={pos(a, range.start)}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData('application/x-agenda', JSON.stringify({ patientId: a.patientId, appointmentId: a.id, duration }))
                      }
                      onClick={() =>
                        setDialog({ kind: 'appointment', id: a.id, patientId: a.patientId, date: d.date, start: a.start, duration, label: a.label })
                      }
                    >
                      <b>{minutesToTime(a.start)}</b> {a.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="hint">
          Cliquez sur un créneau vide pour le <b>bloquer</b> (pause, congés…). Glissez un patient depuis la liste pour lui poser un rendez-vous, ou glissez un
          rendez-vous pour le déplacer.
        </p>
      </div>

      <aside className="card stack patients-panel" aria-label="Patients à placer">
        <h2>Patients</h2>
        <input
          type="search"
          className="field-inline"
          placeholder="Rechercher"
          aria-label="Rechercher un patient"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {patients.length === 0 && <p className="hint">Aucun patient suivi. Confirmez une prise en charge depuis la liste d’attente.</p>}
        <ul className="patient-list">
          {shownPatients.map((p) => (
            <li
              key={p.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-agenda', JSON.stringify({ patientId: p.id }))}
              className={picked?.id === p.id ? 'picked' : ''}
            >
              <button type="button" onClick={() => setPicked(picked?.id === p.id ? null : p)} aria-pressed={picked?.id === p.id}>
                <b>{p.name}</b>
                <small>{p.next ? `Prochain RDV : ${formatDay(p.next, true)}` : 'Pas de RDV prévu'}</small>
              </button>
            </li>
          ))}
        </ul>
        <p className="hint">Glissez un patient sur l’agenda, ou touchez-le puis touchez un créneau. Séance de {sessionMinutes} min.</p>
      </aside>

      {dialog && (
        <Modal onClose={() => setDialog(null)}>
          {dialog.kind === 'block' ? (
            <BlockDialog
              key={`${dialog.block?.id ?? 'new'}-${dialog.date}-${dialog.start}`}
              dialog={dialog}
              onDone={(text) => {
                setDialog(null);
                setNotice({ kind: 'ok', text });
              }}
            />
          ) : (
            <AppointmentDialog
              key={dialog.id}
              dialog={dialog}
              patients={patients}
              detail={details[dialog.patientId]}
              bookingMode={bookingMode}
              onDone={(text) => {
                setDialog(null);
                setNotice({ kind: 'ok', text });
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

const pos = (i: Interval, rangeStart: number) => ({
  top: Math.max(0, i.start - rangeStart) * PX,
  height: Math.max(16, (i.end - Math.max(i.start, rangeStart)) * PX),
});

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal card"
      onClose={onClose}
      onClick={(e) => {
        // Clic sur le fond (hors de la boîte) : on ferme.
        const r = e.currentTarget.getBoundingClientRect();
        const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (e.target === e.currentTarget && outside) ref.current?.close();
      }}
    >
      <button type="button" className="modal-x" aria-label="Fermer" onClick={() => ref.current?.close()}>
        ×
      </button>
      {children}
    </dialog>
  );
}

/** Appelle onDone une seule fois quand l'action réussit. */
function useOnSuccess(state: FormState, onDone: (text: string) => void) {
  const fired = useRef(false);
  useEffect(() => {
    if (state.ok && !fired.current) {
      fired.current = true;
      onDone(state.message ?? 'Enregistré.');
    }
  }, [state, onDone]);
}

function BlockDialog({ dialog, onDone }: { dialog: Extract<Dialog, { kind: 'block' }>; onDone: (text: string) => void }) {
  const [state, action] = useActionState<FormState, FormData>(saveBlock, {});
  const [delState, delAction] = useActionState<FormState, FormData>(deleteBlock, {});
  useOnSuccess(state, onDone);
  useOnSuccess(delState, onDone);

  const b = dialog.block;
  const v = state.values;
  const [recurrence, setRecurrence] = useState(v?.recurrence ?? b?.recurrence ?? 'none');
  const [scope, setScope] = useState(v?.scope ?? 'serie');
  const recurring = !!b && b.recurrence !== 'none';
  const weekdays = v?.weekdays !== undefined ? v.weekdays.split(',').filter(Boolean).map(Number) : (b?.weekdays ?? []);
  const err = state.errors ?? {};

  return (
    <div className="stack">
      <h2>{b ? 'Modifier le blocage' : 'Bloquer un créneau'}</h2>
      <form action={action} className="stack" noValidate>
        <FormAlert state={state} />
        <input type="hidden" name="id" value={b?.id ?? ''} />
        <input type="hidden" name="occurrence" value={dialog.occurrence ?? ''} />
        {recurring && (
          <fieldset className="choice plain">
            <label>
              <input type="radio" name="scope" value="serie" checked={scope === 'serie'} onChange={() => setScope('serie')} /> Toute la série
            </label>
            <label>
              <input type="radio" name="scope" value="jour" checked={scope === 'jour'} onChange={() => setScope('jour')} /> Ce jour seulement
            </label>
          </fieldset>
        )}
        <Field label="Titre" name="title" maxLength={120} placeholder="Pause déjeuner, congés, formation…" defaultValue={v?.title ?? b?.title ?? ''} error={err.title} />
        <div className="form-grid">
          <Field label="Date" name="date" type="date" required defaultValue={v?.date ?? dialog.date} error={err.date} />
          <Field label="De" name="start" type="time" step={300} required defaultValue={v?.start ?? minutesToTime(dialog.start)} error={err.start} />
          <Field label="À" name="end" type="time" step={300} required defaultValue={v?.end ?? minutesToTime(Math.min(dialog.end, 23 * 60 + 59))} error={err.end} />
        </div>
        {!(recurring && scope === 'jour') && (
          <>
            <label className="field">
              <span>Répétition</span>
              <select name="recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value as typeof recurrence)}>
                {RECURRENCES.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            {recurrence === 'weekdays' && (
              <fieldset className={`field plain ${err.weekdays ? 'invalid' : ''}`}>
                <legend>
                  <b>Jours</b>
                </legend>
                <div className="row">
                  {WEEKDAYS.map((label, i) => (
                    <label key={label} className="check">
                      <input type="checkbox" name="weekdays" value={i + 1} defaultChecked={weekdays.includes(i + 1)} /> {label}
                    </label>
                  ))}
                </div>
                {err.weekdays && <span className="error">{err.weekdays}</span>}
              </fieldset>
            )}
            {recurrence !== 'none' && (
              <Field label="Jusqu’au (facultatif)" name="until" type="date" defaultValue={v?.until ?? b?.until ?? ''} error={err.until} />
            )}
          </>
        )}
        {recurring && scope === 'jour' && <input type="hidden" name="recurrence" value="none" />}
        <div className="row">
          <SubmitButton pendingText="Enregistrement…">{b ? 'Enregistrer' : 'Bloquer ce créneau'}</SubmitButton>
        </div>
      </form>
      {b && (
        <form action={delAction} className="row">
          <FormAlert state={delState} />
          <input type="hidden" name="id" value={b.id} />
          <input type="hidden" name="occurrence" value={dialog.occurrence ?? ''} />
          {recurring ? (
            <>
              <SubmitButton className="btn danger small" name="scope" value="jour">
                Supprimer ce jour
              </SubmitButton>
              <SubmitButton className="btn danger small" name="scope" value="serie">
                Supprimer toute la série
              </SubmitButton>
            </>
          ) : (
            <SubmitButton className="btn danger small" name="scope" value="serie">
              Supprimer
            </SubmitButton>
          )}
        </form>
      )}
    </div>
  );
}

function AppointmentDialog({
  dialog,
  patients,
  detail,
  bookingMode,
  onDone,
}: {
  dialog: Extract<Dialog, { kind: 'appointment' }>;
  patients: PatientItem[];
  detail: PatientDetail | undefined;
  bookingMode: BookingMode;
  onDone: (text: string) => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveAppointment, {});
  const [cancelState, cancelAction] = useActionState<FormState, FormData>(cancelAppointment, {});
  useOnSuccess(state, onDone);
  useOnSuccess(cancelState, onDone);
  const v = state.values;
  const err = state.errors ?? {};
  const options = patients.some((p) => p.id === dialog.patientId) ? patients : [{ id: dialog.patientId, name: dialog.label, next: null }, ...patients];

  return (
    <div className="stack">
      <div>
        <h2>{dialog.label}</h2>
        <p className="sub">
          Rendez-vous le {formatDay(dialog.date)} à {formatTime(minutesToTime(dialog.start))} · {dialog.duration} min
        </p>
      </div>
      {detail && <PatientCard patientId={dialog.patientId} detail={detail} bookingMode={bookingMode} />}
      <h3>Rendez-vous</h3>
      <form action={action} className="stack" noValidate>
        <FormAlert state={state} />
        <input type="hidden" name="id" value={dialog.id} />
        <label className="field">
          <span>Patient</span>
          <select name="patientId" defaultValue={v?.patientId ?? dialog.patientId}>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <Field label="Date" name="date" type="date" required defaultValue={v?.date ?? dialog.date} error={err.date} />
          <Field label="Heure" name="time" type="time" step={300} required defaultValue={v?.time ?? minutesToTime(dialog.start)} error={err.time} />
          <Field label="Durée (min)" name="duration" type="number" min={10} max={240} step={5} required defaultValue={v?.duration ?? String(dialog.duration)} error={err.duration} />
        </div>
        <div>
          <SubmitButton pendingText="Enregistrement…">Enregistrer</SubmitButton>
        </div>
      </form>
      <form action={cancelAction} className="row">
        <FormAlert state={cancelState} />
        <input type="hidden" name="id" value={dialog.id} />
        <SubmitButton className="btn danger small">Annuler ce rendez-vous</SubmitButton>
      </form>
    </div>
  );
}

const BOOKING_HINT: Record<BookingMode, string> = {
  autonomes: 'Peut réserver ses séances en ligne.',
  tous: 'Mode « tous » actif : tout le monde réserve en ligne ; cette case compte quand vous revenez au mode « autonomes ».',
  ortho: 'Mode « moi seul·e » actif : personne ne réserve en ligne pour l’instant (Réglages).',
};

/** Fiche patient : identité, contact, motif, case « autonome », acte AMO (à venir). */
function PatientCard({ patientId, detail, bookingMode }: { patientId: string; detail: PatientDetail; bookingMode: BookingMode }) {
  const [autonomous, setAutonomous] = useState(detail.autonomous);
  const [error, setError] = useState(false);
  const [saving, startTransition] = useTransition();
  const rows: [string, React.ReactNode][] = [
    ['Âge', detail.age],
    ['Parent / aidant', detail.caregiver],
    ['Email', detail.email && <a href={`mailto:${detail.email}`}>{detail.email}</a>],
    ['Téléphone', detail.phone && <a href={`tel:${detail.phone.replace(/\s/g, '')}`}>{detail.phone}</a>],
    ['Motif', detail.pathology],
    ['Demande', detail.requestType],
    ['Acte AMO', <span className="hint">à renseigner (bientôt : cotation, prix, durée des séances)</span>],
  ];
  return (
    <section className="patient-card stack" aria-label="Fiche patient">
      <dl className="facts">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      <label className="check">
        <input
          type="checkbox"
          checked={autonomous}
          disabled={saving}
          onChange={(e) => {
            const value = e.target.checked;
            setAutonomous(value);
            setError(false);
            startTransition(async () => {
              const res = await setPatientAutonomous(patientId, value);
              if (!res.ok) {
                setAutonomous(!value);
                setError(true);
              }
            });
          }}
        />
        <span>
          <b>Patient autonome</b>
          <span className="hint" style={{ display: 'block' }}>
            {BOOKING_HINT[bookingMode]}
          </span>
        </span>
      </label>
      {error && <p className="alert error">La modification n’a pas pu être enregistrée.</p>}
    </section>
  );
}
