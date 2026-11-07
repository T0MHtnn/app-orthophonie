'use client';

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import { Modal } from '@/components/modal';
import { Notice } from '@/components/notice';
import { RECURRENCES, isFree, type AgendaDay, type BlockInput, type Interval } from '@/lib/agenda';
import { matchesSearch } from '@/lib/search';
import { WEEKDAYS, formatDay, formatTime, minutesToTime } from '@/lib/time';
import { setPatientAutonomous } from '../reglages/actions';
import { deleteAppointment, deleteBlock, markAttendance, reviewAppointment, saveAppointment, saveBlock } from './actions';

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
  /** Séances réalisées (passées, non « non honoré »). */
  sessionsDone: number;
  /** Rendez-vous non honorés (lapins). */
  absences: number;
  /** Séances prévues par l'acte AMO (null tant que l'acte n'est pas renseigné). */
  sessionsTotal: number | null;
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
  /** Clic sur un créneau vide (ou dépôt d'un patient) : bloquer OU planifier un RDV. */
  | { kind: 'slot'; date: string; start: number; end: number; patientId?: string; tab: 'block' | 'rdv' }
  | { kind: 'block'; date: string; start: number; end: number; block?: BlockInput; occurrence?: string }
  | {
      kind: 'appointment';
      id: string;
      patientId: string;
      date: string;
      start: number;
      duration: number;
      label: string;
      status: string;
      attendance: 'absent' | null;
      past: boolean;
      title: string;
    }
  | { kind: 'cancelled'; id: string; label: string; date: string; start: number; reason: string | null }
  /** RDV glissé ailleurs : confirmation + choix de prévenir le patient. */
  | { kind: 'move'; id: string; patientId: string; label: string; date: string; start: number; duration: number; title: string };

export function Agenda({ days, range, today, nowMinutes, blocks, patients, sessionMinutes, details, bookingMode }: Props) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // Patient sélectionné dans la liste : l'agenda n'affiche que ses rendez-vous (les blocages restent).
  const [focus, setFocus] = useState<PatientItem | null>(null);
  const [notice, setNoticeState] = useState<{ id: number; kind: 'ok' | 'error'; text: string } | null>(null);
  const setNotice = (n: { kind: 'ok' | 'error'; text: string } | null) => setNoticeState(n && { ...n, id: Date.now() });
  const [pending, startTransition] = useTransition();
  const t = useT();
  const L = t.locale;
  const height = (range.end - range.start) * PX;
  const blockById = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);

  // Minute (arrondie) sous le pointeur dans une colonne.
  const minuteAt = (e: { clientY: number; currentTarget: HTMLElement }) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    return Math.min(range.end - SNAP, Math.max(range.start, range.start + Math.floor(y / PX / SNAP) * SNAP));
  };

  /** Déplacement d'un RDV existant par glisser-déposer (immédiat). */
  const move = (target: { date: string; patientId: string; start: number; duration: number; id: string; title: string }, notify: boolean) => {
    const { date, patientId, start, duration, id: appointmentId, title } = target;
    const fd = new FormData();
    fd.set('id', appointmentId);
    fd.set('patientId', patientId);
    fd.set('date', date);
    fd.set('time', minutesToTime(start));
    fd.set('duration', String(duration));
    fd.set('title', title);
    if (notify) fd.set('notify', 'on');
    setDialog(null);
    startTransition(async () => {
      const res = await saveAppointment({}, fd);
      setNotice({ kind: res.ok ? 'ok' : 'error', text: res.message ?? (res.ok ? 'Enregistré.' : 'Enregistrement impossible.') });
    });
  };

  const onColumnClick = (day: AgendaDay, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // clic sur un rendez-vous ou un blocage
    const start = minuteAt(e);
    // Patient sélectionné : on propose directement de lui planifier un RDV.
    setDialog({
      kind: 'slot',
      date: day.date,
      start,
      end: Math.min(range.end, start + (focus ? sessionMinutes : 60)),
      patientId: focus?.id,
      tab: focus ? 'rdv' : 'block',
    });
  };

  const onDrop = (day: AgendaDay, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-agenda');
    if (!raw) return;
    const data = JSON.parse(raw) as { patientId: string; appointmentId?: string; duration?: number; title?: string };
    const start = minuteAt(e);
    if (data.appointmentId) {
      const duration = data.duration ?? sessionMinutes;
      if (!isFree(day, { start, end: start + duration }, data.appointmentId)) {
        setNotice({ kind: 'error', text: 'Ce créneau est déjà pris ou bloqué.' });
        return;
      }
      const label = day.appointments.find((a) => a.id === data.appointmentId)?.label ?? days.flatMap((d) => d.appointments).find((a) => a.id === data.appointmentId)?.label ?? '';
      setDialog({ kind: 'move', id: data.appointmentId, patientId: data.patientId, label, date: day.date, start, duration, title: data.title ?? '' });
    }
    // Nouveau RDV : la pop-up s'ouvre pré-remplie (pour choisir de prévenir le patient).
    else setDialog({ kind: 'slot', date: day.date, start, end: Math.min(range.end, start + sessionMinutes), patientId: data.patientId, tab: 'rdv' });
  };

  const [query, setQuery] = useState('');
  const shownPatients = patients.filter((p) => matchesSearch(query, [p.name]));
  const done = (text: string) => {
    setDialog(null);
    setNotice({ kind: 'ok', text });
  };

  return (
    <div className="planning-layout">
      <div className="stack">
        {notice && (
          <Notice key={notice.id} kind={notice.kind} onClose={() => setNotice(null)}>
            {notice.text}
          </Notice>
        )}
        {focus && (
          <div className="alert info row spread">
            <span>{t('Seuls les rendez-vous de {nom} sont affichés.', { nom: focus.name })}</span>
            <button type="button" className="btn small" onClick={() => setFocus(null)}>
              {t('Voir tous les rendez-vous')}
            </button>
          </div>
        )}
        <div className="card agenda-wrap" aria-busy={pending}>
          <div className="agenda" style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(96px, 1fr))` }}>
            <div />
            {days.map((d) => (
              <div key={d.date} className={`agenda-head ${d.date === today ? 'today' : ''}`}>
                {formatDay(d.date, true, L)}
              </div>
            ))}
            <div className="agenda-hours" style={{ height }}>
              {Array.from({ length: (range.end - range.start) / 60 }, (_, i) => (
                <span key={i} style={{ top: i * 60 * PX }}>
                  {t.lang === 'en' ? `${range.start / 60 + i}:00` : `${range.start / 60 + i} h`}
                </span>
              ))}
            </div>
            {days.map((d) => (
              <div
                key={d.date}
                className={`agenda-col ${d.date < today ? 'past' : ''}`}
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
                    {b.recurring && <span aria-label={t('répété')}>↻ </span>}
                    {b.title || t('Bloqué')}
                  </button>
                ))}
                {d.cancelled
                  .filter((c) => !focus || c.patientId === focus.id)
                  .map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className="agenda-cancelled"
                      style={pos(c, range.start)}
                      onClick={() => setDialog({ kind: 'cancelled', id: c.id, label: c.label, date: d.date, start: c.start, reason: c.reason })}
                    >
                      <b>{t('Annulé')}</b> {c.label}
                    </button>
                  ))}
                {d.appointments
                  .filter((a) => !focus || a.patientId === focus.id)
                  .map((a) => {
                    const duration = a.end - a.start;
                    // Prévu (à venir) → réalisé (heure passée) automatiquement, sauf si « non honoré ».
                    const past = d.date < today || (d.date === today && a.start <= nowMinutes);
                    const realised = past && a.status === 'confirme' && a.attendance !== 'absent';
                    return (
                      <button
                        type="button"
                        key={a.id}
                        className={`agenda-appt ${a.status} ${a.attendance ?? ''} ${realised ? 'done' : ''}`}
                        style={pos(a, range.start)}
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData(
                            'application/x-agenda',
                            JSON.stringify({ patientId: a.patientId, appointmentId: a.id, duration, title: a.title }),
                          )
                        }
                        onClick={() =>
                          setDialog({
                            kind: 'appointment',
                            id: a.id,
                            patientId: a.patientId,
                            date: d.date,
                            start: a.start,
                            duration,
                            label: a.label,
                            status: a.status,
                            attendance: a.attendance,
                            past,
                            title: a.title,
                          })
                        }
                      >
                        <b>{minutesToTime(a.start)}</b> {a.label}
                        {a.title && <small className="appt-title">{a.title}</small>}
                        {a.status === 'a_valider' && <small className="appt-flag">{t('À valider')}</small>}
                        {realised && <small className="appt-flag done">✓ {t('Réalisé')}</small>}
                        {a.attendance === 'absent' && <small className="appt-flag absent">{t('Non honoré')}</small>}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
        <p className="hint">
          {t(
            'Cliquez sur un créneau vide pour bloquer ce moment ou y planifier un rendez-vous. Glissez un patient depuis la liste, ou un rendez-vous pour le déplacer.',
          )}
        </p>
      </div>

      <aside className="card stack patients-panel" aria-label={t('Patients à placer')}>
        <h2>{t('Patients')}</h2>
        <input
          type="search"
          className="field-inline"
          placeholder={t('Rechercher')}
          aria-label={t('Rechercher un patient')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {patients.length === 0 && <p className="hint">{t('Aucun patient suivi. Confirmez une prise en charge depuis la liste d’attente.')}</p>}
        <ul className="patient-list">
          {shownPatients.map((p) => (
            <li
              key={p.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-agenda', JSON.stringify({ patientId: p.id }))}
              className={focus?.id === p.id ? 'picked' : ''}
            >
              <button type="button" onClick={() => setFocus(focus?.id === p.id ? null : p)} aria-pressed={focus?.id === p.id}>
                <b>{p.name}</b>
                <small>{p.next ? t('Prochain RDV : {jour}', { jour: formatDay(p.next, true, L) }) : t('Pas de RDV prévu')}</small>
              </button>
            </li>
          ))}
        </ul>
        <p className="hint">{t('Cliquez sur un patient pour n’afficher que ses rendez-vous. Glissez-le sur l’agenda pour lui en planifier un.')}</p>
      </aside>

      {dialog && (
        <Modal onClose={() => setDialog(null)}>
          {dialog.kind === 'slot' ? (
            <SlotDialog key={`${dialog.date}-${dialog.start}-${dialog.patientId ?? ''}`} dialog={dialog} patients={patients} onDone={done} />
          ) : dialog.kind === 'block' ? (
            <BlockDialog key={`${dialog.block?.id ?? 'new'}-${dialog.date}-${dialog.start}`} dialog={dialog} onDone={done} />
          ) : dialog.kind === 'move' ? (
            <MoveDialog dialog={dialog} pending={pending} onConfirm={(notify) => move(dialog, notify)} onCancel={() => setDialog(null)} />
          ) : dialog.kind === 'cancelled' ? (
            <CancelledDialog key={dialog.id} dialog={dialog} onDone={done} />
          ) : (
            <AppointmentDialog
              key={dialog.id}
              dialog={dialog}
              patients={patients}
              detail={details[dialog.patientId]}
              bookingMode={bookingMode}
              onDone={done}
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
  const t = useT();

  return (
    <div className="stack">
      <h2>{t(b ? 'Modifier le blocage' : 'Bloquer un créneau')}</h2>
      <form action={action} className="stack" noValidate>
        <FormAlert state={state} />
        <input type="hidden" name="id" value={b?.id ?? ''} />
        <input type="hidden" name="occurrence" value={dialog.occurrence ?? ''} />
        {recurring && (
          <fieldset className="choice plain">
            <label>
              <input type="radio" name="scope" value="serie" checked={scope === 'serie'} onChange={() => setScope('serie')} /> {t('Toute la série')}
            </label>
            <label>
              <input type="radio" name="scope" value="jour" checked={scope === 'jour'} onChange={() => setScope('jour')} /> {t('Ce jour seulement')}
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
              <span>{t('Répétition')}</span>
              <select name="recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value as typeof recurrence)}>
                {RECURRENCES.map((r) => (
                  <option key={r.code} value={r.code}>
                    {t(r.label)}
                  </option>
                ))}
              </select>
            </label>
            {recurrence === 'weekdays' && (
              <fieldset className={`field plain ${err.weekdays ? 'invalid' : ''}`}>
                <legend>
                  <b>{t('Jours')}</b>
                </legend>
                <div className="row">
                  {WEEKDAYS.map((label, i) => (
                    <label key={label} className="check">
                      <input type="checkbox" name="weekdays" value={i + 1} defaultChecked={weekdays.includes(i + 1)} /> {t(label)}
                    </label>
                  ))}
                </div>
                {err.weekdays && <span className="error">{t(err.weekdays)}</span>}
              </fieldset>
            )}
            {recurrence !== 'none' && (
              <Field label="Jusqu’au (facultatif)" name="until" type="date" defaultValue={v?.until ?? b?.until ?? ''} error={err.until} />
            )}
          </>
        )}
        {recurring && scope === 'jour' && <input type="hidden" name="recurrence" value="none" />}
        <div className="row">
          <SubmitButton pendingText="Enregistrement…">{t(b ? 'Enregistrer' : 'Bloquer ce créneau')}</SubmitButton>
        </div>
      </form>
      {b && (
        <div className="stack">
          <FormAlert state={delState} />
          {/* Un formulaire par bouton : le choix part dans un champ caché, pas dans le bouton cliqué. */}
          <div className="row">
            {(recurring ? (['jour', 'serie'] as const) : (['serie'] as const)).map((scope) => (
              <form key={scope} action={delAction}>
                <input type="hidden" name="id" value={b.id} />
                <input type="hidden" name="occurrence" value={dialog.occurrence ?? ''} />
                <input type="hidden" name="scope" value={scope} />
                <SubmitButton className="btn danger small">{t(!recurring ? 'Supprimer' : scope === 'jour' ? 'Supprimer ce jour' : 'Supprimer toute la série')}</SubmitButton>
              </form>
            ))}
          </div>
        </div>
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
  const [cancelState, cancelAction] = useActionState<FormState, FormData>(deleteAppointment, {});
  const [reviewState, reviewAction] = useActionState<FormState, FormData>(reviewAppointment, {});
  const [attState, attAction] = useActionState<FormState, FormData>(markAttendance, {});
  useOnSuccess(attState, onDone);
  useOnSuccess(cancelState, onDone);
  useOnSuccess(reviewState, onDone);
  const pendingReview = dialog.status === 'a_valider';
  const t = useT();
  const options = patients.some((p) => p.id === dialog.patientId) ? patients : [{ id: dialog.patientId, name: dialog.label, next: null }, ...patients];

  return (
    <div className="stack">
      <div>
        <h2>{dialog.label}</h2>
        <p className="sub">
          {t('Rendez-vous le {jour} à {heure} · {min} min', { jour: formatDay(dialog.date, false, t.locale), heure: formatTime(minutesToTime(dialog.start), t.locale), min: dialog.duration })}
        </p>
      </div>
      {detail && <PatientCard patientId={dialog.patientId} detail={detail} bookingMode={bookingMode} />}
      {pendingReview && (
        <div className="stack review">
          <p>
            <b>{t('Réservation en ligne en attente de votre validation.')}</b> {t('La famille sera prévenue par email.')}
          </p>
          <FormAlert state={reviewState} />
          {/* Un formulaire par bouton : la décision part dans un champ caché, pas dans le bouton cliqué. */}
          <div className="row">
            <form action={reviewAction}>
              <input type="hidden" name="id" value={dialog.id} />
              <input type="hidden" name="decision" value="accepter" />
              <SubmitButton>Accepter</SubmitButton>
            </form>
            <form action={reviewAction}>
              <input type="hidden" name="id" value={dialog.id} />
              <input type="hidden" name="decision" value="refuser" />
              <SubmitButton className="btn danger">Refuser</SubmitButton>
            </form>
          </div>
        </div>
      )}
      {dialog.status === 'confirme' && (
        <div className={`row spread attendance ${dialog.attendance === 'absent' ? 'absent' : dialog.past ? 'done' : 'planned'}`}>
          <p>
            <b>{t('État')}</b> · {t(dialog.attendance === 'absent' ? 'Non honoré' : dialog.past ? 'Réalisé' : 'Prévu')}
          </p>
          {/* Modifiable même après la date ; un rendez-vous à venir ne peut pas encore être « non honoré ». */}
          {dialog.past && (
            <form action={attAction}>
              <input type="hidden" name="id" value={dialog.id} />
              <input type="hidden" name="attendance" value={dialog.attendance === 'absent' ? 'realise' : 'absent'} />
              <SubmitButton className={`btn small ${dialog.attendance === 'absent' ? '' : 'danger'}`}>
                {dialog.attendance === 'absent' ? 'Marquer comme réalisé' : 'Marquer comme non honoré'}
              </SubmitButton>
            </form>
          )}
        </div>
      )}
      <FormAlert state={attState} />
      {!pendingReview && <h3>{t('Rendez-vous')}</h3>}
      {!pendingReview && (
        <AppointmentForm
          patients={options}
          values={{
            id: dialog.id,
            patientId: dialog.patientId,
            date: dialog.date,
            time: minutesToTime(dialog.start),
            end: minutesToTime(dialog.start + dialog.duration),
            title: dialog.title,
          }}
          notifyDefault={false}
          onDone={onDone}
        />
      )}
      {!pendingReview && (
        <form action={cancelAction} className="row">
          <FormAlert state={cancelState} />
          <input type="hidden" name="id" value={dialog.id} />
          <SubmitButton className="btn danger small">Supprimer ce rendez-vous</SubmitButton>
        </form>
      )}
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
  const t = useT();
  const rows: [string, React.ReactNode][] = [
    ['Âge', detail.age],
    ['Parent / aidant', detail.caregiver],
    ['Email', detail.email && <a href={`mailto:${detail.email}`}>{detail.email}</a>],
    ['Téléphone', detail.phone && <a href={`tel:${detail.phone.replace(/\s/g, '')}`}>{detail.phone}</a>],
    ['Motif', detail.pathology],
    ['Demande', detail.requestType],
    ['Acte AMO', <span key="amo" className="hint">{t('à renseigner (bientôt : cotation, prix, durée des séances)')}</span>],
  ];
  return (
    <section className="patient-card stack" aria-label={t('Fiche patient')}>
      <SessionsProgress done={detail.sessionsDone} total={detail.sessionsTotal} />
      {detail.absences > 0 && (
        <p className="absences">{t(detail.absences > 1 ? '{n} rendez-vous non honorés' : '{n} rendez-vous non honoré', { n: detail.absences })}</p>
      )}
      <dl className="facts">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{t(label)}</dt>
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
          <b>{t('Patient autonome')}</b>
          <span className="hint" style={{ display: 'block' }}>
            {t(BOOKING_HINT[bookingMode])}
          </span>
        </span>
      </label>
      {error && <p className="alert error">{t('La modification n’a pas pu être enregistrée.')}</p>}
    </section>
  );
}

/** Avancement de la série de séances (couleur du thème). */
function SessionsProgress({ done, total }: { done: number; total: number | null }) {
  const t = useT();
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="progress-block">
      <div
        className={`progress ${total ? '' : 'unknown'}`}
        role="progressbar"
        aria-label={t('Séances réalisées')}
        aria-valuemin={0}
        aria-valuemax={total ?? undefined}
        aria-valuenow={total ? done : undefined}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="hint">
        {total
          ? t('{fait} séance(s) sur {total}', { fait: done, total })
          : t('{fait} séance(s) réalisée(s) · nombre total à définir avec l’acte AMO', { fait: done })}
      </p>
    </div>
  );
}

/** Créneau vide : deux onglets, bloquer le moment ou y planifier un rendez-vous. */
function SlotDialog({ dialog, patients, onDone }: { dialog: Extract<Dialog, { kind: 'slot' }>; patients: PatientItem[]; onDone: (text: string) => void }) {
  const [tab, setTab] = useState(dialog.tab);
  const t = useT();
  return (
    <div className="stack">
      <div className="tabs" role="tablist" aria-label={t('Que faire de ce créneau ?')}>
        <button type="button" role="tab" aria-selected={tab === 'rdv'} aria-current={tab === 'rdv' ? 'page' : undefined} onClick={() => setTab('rdv')}>
          {t('Planifier un rendez-vous')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'block'} aria-current={tab === 'block' ? 'page' : undefined} onClick={() => setTab('block')}>
          {t('Bloquer le créneau')}
        </button>
      </div>
      {tab === 'rdv' ? (
        <AppointmentForm
          patients={patients}
          values={{ id: '', patientId: dialog.patientId ?? '', date: dialog.date, time: minutesToTime(dialog.start), end: minutesToTime(dialog.end), title: '' }}
          notifyDefault
          onDone={onDone}
        />
      ) : (
        <BlockDialog dialog={{ kind: 'block', date: dialog.date, start: dialog.start, end: dialog.end }} onDone={onDone} />
      )}
    </div>
  );
}

/** Choix du patient avec recherche (fonctionne aussi au doigt sur téléphone). */
function PatientPicker({ patients, value, onChange, error }: { patients: PatientItem[]; value: string; onChange: (id: string) => void; error?: string }) {
  const t = useT();
  const selected = patients.find((p) => p.id === value);
  const [query, setQuery] = useState('');
  const matches = query ? patients.filter((p) => matchesSearch(query, [p.name])).slice(0, 6) : [];
  return (
    <div className="field">
      <span>{t('Patient')}</span>
      <input type="hidden" name="patientId" value={value} />
      {selected ? (
        <div className="row picked-patient">
          <b>{selected.name}</b>
          <button type="button" className="btn small" onClick={() => onChange('')}>
            {t('Changer')}
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            placeholder={t('Tapez un nom ou un prénom')}
            aria-label={t('Rechercher un patient')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
          />
          {matches.length > 0 && (
            <ul className="picker-list" role="listbox">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      onChange(p.id);
                      setQuery('');
                    }}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query && matches.length === 0 && <p className="hint">{t('Aucun patient trouvé.')}</p>}
        </>
      )}
      {error && <span className="error">{t(error)}</span>}
    </div>
  );
}

interface AppointmentValues {
  id: string;
  patientId: string;
  date: string;
  time: string;
  end: string;
  title: string;
}

/** Formulaire d'un RDV : patient, date, heures de début et de fin, titre, prévenir le patient. */
function AppointmentForm({
  patients,
  values,
  notifyDefault,
  onDone,
}: {
  patients: PatientItem[];
  values: AppointmentValues;
  notifyDefault: boolean;
  onDone: (text: string) => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveAppointment, {});
  useOnSuccess(state, onDone);
  const t = useT();
  const v = { ...values, ...state.values } as AppointmentValues & { notify?: string };
  const [patientId, setPatientId] = useState(v.patientId);
  const err = state.errors ?? {};
  return (
    <form action={action} className="stack" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="id" value={values.id} />
      <PatientPicker patients={patients} value={patientId} onChange={setPatientId} error={err.patientId} />
      <div className="form-grid">
        <Field label="Date" name="date" type="date" required defaultValue={v.date} error={err.date} />
        <Field label="Début" name="time" type="time" step={300} required defaultValue={v.time} error={err.time} />
        <Field label="Fin" name="end" type="time" step={300} required defaultValue={v.end} error={err.end} />
      </div>
      <Field label="Titre (facultatif, visible par vous seul)" name="title" maxLength={120} defaultValue={v.title} error={err.title} />
      <label className="check">
        <input type="checkbox" name="notify" defaultChecked={state.values ? v.notify === 'on' : notifyDefault} />
        <span>
          <b>{t(values.id ? 'Prévenir le patient du changement' : 'Prévenir le patient')}</b>
          <span className="hint" style={{ display: 'block' }}>
            {t('Email + pastille « Nouveau » dans son espace jusqu’à ce qu’il clique « Lu ».')}
          </span>
        </span>
      </label>
      <div>
        <SubmitButton pendingText="Enregistrement…">{values.id ? 'Enregistrer' : 'Planifier le rendez-vous'}</SubmitButton>
      </div>
    </form>
  );
}

/** Séance annulée par la famille : raison, et retrait de l'agenda. */
function CancelledDialog({ dialog, onDone }: { dialog: Extract<Dialog, { kind: 'cancelled' }>; onDone: (text: string) => void }) {
  const [state, action] = useActionState<FormState, FormData>(deleteAppointment, {});
  useOnSuccess(state, onDone);
  const t = useT();
  return (
    <div className="stack">
      <div>
        <h2>{dialog.label}</h2>
        <p className="sub">
          {t('Séance du {jour} à {heure} annulée par la famille.', { jour: formatDay(dialog.date, false, t.locale), heure: formatTime(minutesToTime(dialog.start), t.locale) })}
        </p>
      </div>
      <div className="patient-card">
        <p>
          <b>{t('Raison donnée')}</b>
        </p>
        <p>{dialog.reason ?? t('Aucune raison donnée.')}</p>
      </div>
      <form action={action} className="stack">
        <FormAlert state={state} />
        <input type="hidden" name="id" value={dialog.id} />
        <p className="hint">{t('Le créneau est déjà libre. Vous pouvez retirer cette annulation de l’agenda.')}</p>
        <div>
          <SubmitButton className="btn small">Retirer de l’agenda</SubmitButton>
        </div>
      </form>
    </div>
  );
}

/** Confirmation d'un déplacement par glisser-déposer, avec le choix de prévenir le patient. */
function MoveDialog({
  dialog,
  pending,
  onConfirm,
  onCancel,
}: {
  dialog: Extract<Dialog, { kind: 'move' }>;
  pending: boolean;
  onConfirm: (notify: boolean) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [notify, setNotify] = useState(true);
  return (
    <div className="stack">
      <h2>{t('Déplacer le rendez-vous ?')}</h2>
      <p>
        {t('{nom} : {jour} à {heure} ({min} min).', {
          nom: dialog.label,
          jour: formatDay(dialog.date, false, t.locale),
          heure: formatTime(minutesToTime(dialog.start), t.locale),
          min: dialog.duration,
        })}
      </p>
      <label className="check">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        <span>
          <b>{t('Prévenir le patient du changement')}</b>
          <span className="hint" style={{ display: 'block' }}>
            {t('Email + pastille « Nouveau » dans son espace jusqu’à ce qu’il clique « Lu ».')}
          </span>
        </span>
      </label>
      <div className="row">
        <button type="button" className="btn primary" disabled={pending} onClick={() => onConfirm(notify)}>
          {t('Déplacer')}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {t('Annuler')}
        </button>
      </div>
    </div>
  );
}
