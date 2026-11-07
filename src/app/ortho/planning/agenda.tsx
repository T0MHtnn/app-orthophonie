'use client';

import Link from 'next/link';
import { useActionState, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import { Modal } from '@/components/modal';
import { Notice } from '@/components/notice';
import { SessionsProgress } from '@/components/sessions-progress';
import { RECURRENCES, isFree, layoutPieces, type AgendaDay, type BlockInput, type Interval, type Piece } from '@/lib/agenda';
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
  /** Séances prescrites (ou celles de l'acte AMO) ; null tant que ce n'est pas renseigné. */
  sessionsTotal: number | null;
  /** Acte AMO choisi sur la fiche. */
  act: string | null;
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
  | { kind: 'move'; id: string; patientId: string; label: string; date: string; start: number; duration: number; title: string }
  /** Dépôt sur une zone déjà occupée : refusé, avec explication. */
  | { kind: 'refused' };

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
    endDrag();
    const raw = e.dataTransfer.getData('application/x-agenda');
    if (!raw) return;
    const data = JSON.parse(raw) as { patientId: string; appointmentId?: string; duration?: number; title?: string };
    const start = minuteAt(e);
    if (data.appointmentId) {
      const duration = data.duration ?? sessionMinutes;
      if (!isFree(day, { start, end: start + duration }, data.appointmentId)) {
        setDialog({ kind: 'refused' });
        return;
      }
      const label = day.appointments.find((a) => a.id === data.appointmentId)?.label ?? days.flatMap((d) => d.appointments).find((a) => a.id === data.appointmentId)?.label ?? '';
      setDialog({ kind: 'move', id: data.appointmentId, patientId: data.patientId, label, date: day.date, start, duration, title: data.title ?? '' });
    }
    // Nouveau RDV : refusé sur une zone occupée, sinon la pop-up s'ouvre pré-remplie (pour choisir de prévenir le patient).
    else if (!isFree(day, { start, end: start + sessionMinutes })) setDialog({ kind: 'refused' });
    else setDialog({ kind: 'slot', date: day.date, start, end: Math.min(range.end, start + sessionMinutes), patientId: data.patientId, tab: 'rdv' });
  };

  // Glisser-déposer : on garde ce qu'on tient (le navigateur ne lit pas les données pendant le survol)
  // et la zone survolée, affichée en aperçu pour viser juste.
  const dragging = useRef<{ duration: number; appointmentId?: string } | null>(null);
  const [preview, setPreview] = useState<{ date: string; start: number; end: number; free: boolean } | null>(null);
  const onDragOver = (day: AgendaDay, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const held = dragging.current;
    if (!held) return;
    const start = minuteAt(e);
    if (preview?.date === day.date && preview.start === start) return;
    const end = start + held.duration;
    setPreview({ date: day.date, start, end, free: isFree(day, { start, end }, held.appointmentId) });
  };
  const endDrag = () => {
    dragging.current = null;
    setPreview(null);
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
                onDragOver={(e) => onDragOver(d, e)}
                onDragLeave={(e) => {
                  // Sortie de la colonne (pas d'un élément à l'intérieur).
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null) && preview?.date === d.date) setPreview(null);
                }}
                onDrop={(e) => onDrop(d, e)}
              >
                {preview?.date === d.date && (
                  <div className={`agenda-drop ${preview.free ? '' : 'busy'}`} style={pos(preview, range.start)} aria-hidden="true">
                    {preview.free ? '✓' : '✕'} {minutesToTime(preview.start)} – {minutesToTime(preview.end)}
                  </div>
                )}
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
                {(() => {
                  // RDV puis séances annulées : là où ils se chevauchent, ils se partagent la largeur.
                  const appts = d.appointments.filter((a) => !focus || a.patientId === focus.id);
                  const ghosts = d.cancelled.filter((c) => !focus || c.patientId === focus.id);
                  const layout = layoutPieces([...appts, ...ghosts]);
                  return (
                    <>
                      {ghosts.map((c) =>
                        (layout.get(c.id) ?? []).map((piece) => (
                          <button
                            type="button"
                            key={`${c.id}-${piece.start}`}
                            className={`agenda-cancelled ${pieceClass(piece)}`}
                            style={piecePos(piece, range.start)}
                            onClick={() => setDialog({ kind: 'cancelled', id: c.id, label: c.label, date: d.date, start: c.start, reason: c.reason })}
                            aria-label={piece.first ? undefined : `${t('Annulé')} ${c.label}`}
                          >
                            {piece.first && (
                              <>
                                <b>{t('Annulé')}</b> {c.label}
                              </>
                            )}
                          </button>
                        )),
                      )}
                      {appts.map((a) => {
                        const duration = a.end - a.start;
                        // Prévu (à venir) → réalisé (heure passée) automatiquement, sauf si « non honoré ».
                        const past = d.date < today || (d.date === today && a.start <= nowMinutes);
                        const realised = past && a.status === 'confirme' && a.attendance !== 'absent';
                        const open = () =>
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
                          });
                        return (layout.get(a.id) ?? []).map((piece) => (
                          <button
                            type="button"
                            key={`${a.id}-${piece.start}`}
                            className={`agenda-appt ${a.status} ${a.attendance ?? ''} ${realised ? 'done' : ''} ${pieceClass(piece)}`}
                            style={piecePos(piece, range.start)}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/x-agenda', JSON.stringify({ patientId: a.patientId, appointmentId: a.id, duration, title: a.title }));
                              dragging.current = { duration, appointmentId: a.id };
                            }}
                            onDragEnd={endDrag}
                            onClick={open}
                            aria-label={piece.first ? undefined : a.label}
                          >
                            {piece.first && (
                              <>
                                <b>{minutesToTime(a.start)}</b> {a.label}
                                {a.title && <small className="appt-title">{a.title}</small>}
                                {a.status === 'a_valider' && <small className="appt-flag">{t('À valider')}</small>}
                                {realised && <small className="appt-flag done">✓ {t('Réalisé')}</small>}
                                {a.attendance === 'absent' && <small className="appt-flag absent">{t('Non honoré')}</small>}
                              </>
                            )}
                          </button>
                        ));
                      })}
                    </>
                  );
                })()}
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
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-agenda', JSON.stringify({ patientId: p.id }));
                dragging.current = { duration: sessionMinutes };
              }}
              onDragEnd={endDrag}
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
          ) : dialog.kind === 'refused' ? (
            <div className="stack">
              <h2>{t('Impossible de placer le rendez-vous ici')}</h2>
              <p>{t('Cette plage horaire est déjà occupée par un autre rendez-vous ou par un blocage. Choisissez une zone libre.')}</p>
              <div>
                <button type="button" className="btn primary" onClick={() => setDialog(null)}>
                  {t('Compris')}
                </button>
              </div>
            </div>
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

/** Position d'un morceau (RDV ou séance annulée) : sa tranche horaire et sa colonne. */
const piecePos = (p: Piece, rangeStart: number) => ({
  top: Math.max(0, p.start - rangeStart) * PX,
  height: Math.max(8, (p.end - Math.max(p.start, rangeStart)) * PX),
  left: `calc(3px + (100% - 6px) * ${p.col} / ${p.cols})`,
  width: `calc((100% - 6px) / ${p.cols} - ${p.cols > 1 ? 2 : 0}px)`,
  right: 'auto',
});
const pieceClass = (p: Piece) => `${p.first ? '' : 'cont-top'} ${p.last ? '' : 'cont-bottom'}`;

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
            <b>{t('Réservation en ligne en attente de votre validation.')}</b> {t('Le patient sera prévenu par email.')}
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
          deleteAction={cancelAction}
        />
      )}
      <FormAlert state={cancelState} />
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
    ['Acte AMO', detail.act ?? <span key="amo" className="hint">{t('à renseigner sur la fiche')}</span>],
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
      <div>
        <Link className="btn small" href={`/ortho/patients/${patientId}`}>
          {t('Ouvrir la fiche complète')}
        </Link>
      </div>
    </section>
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
  deleteAction,
}: {
  patients: PatientItem[];
  values: AppointmentValues;
  notifyDefault: boolean;
  onDone: (text: string) => void;
  /** Action « Supprimer » affichée à côté d'« Enregistrer » (RDV existant). */
  deleteAction?: (formData: FormData) => void;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveAppointment, {});
  useOnSuccess(state, onDone);
  const t = useT();
  const v = { ...values, ...state.values } as AppointmentValues & { notify?: string };
  const [patientId, setPatientId] = useState(v.patientId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // RDV existant : « prévenir le patient » se choisit dans la pop-up de confirmation.
  const [confirmSave, setConfirmSave] = useState(false);
  const [notify, setNotify] = useState(state.values ? v.notify === 'on' : notifyDefault || !!values.id);
  const formId = useId();
  const editing = !!values.id;
  // Vérification avant d'ouvrir la pop-up « Prévenir le patient » (la base revérifie ensuite).
  const [localErr, setLocalErr] = useState<Record<string, string>>({});
  const err = { ...(state.errors ?? {}), ...localErr };
  const validateThenConfirm = (form: HTMLFormElement | null) => {
    const get = (name: string) => (form?.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
    const date = get('date');
    const start = get('time');
    const end = get('end');
    const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
    const errors: Record<string, string> = {};
    if (!patientId) errors.patientId = 'Choisissez un patient';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = 'Date invalide';
    if (!/^\d{2}:\d{2}/.test(start)) errors.time = 'Heure invalide';
    if (!/^\d{2}:\d{2}/.test(end)) errors.end = 'Heure invalide';
    else if (/^\d{2}:\d{2}/.test(start)) {
      const minutes = toMin(end) - toMin(start);
      if (minutes <= 0) errors.end = 'L’heure de fin doit être après le début';
      else if (minutes < 10) errors.end = 'Durée minimale : 10 min';
      else if (minutes > 240) errors.end = 'Durée maximale : 4 h';
    }
    setLocalErr(errors);
    if (Object.keys(errors).length === 0) setConfirmSave(true);
  };
  return (
    <>
      <form id={formId} action={action} className="stack" noValidate onSubmit={() => setConfirmSave(false)}>
        <FormAlert state={state} />
        <input type="hidden" name="id" value={values.id} />
        <input type="hidden" name="notify" value={notify ? 'on' : ''} />
        <PatientPicker
          patients={patients}
          value={patientId}
          onChange={(id) => {
            setPatientId(id);
            setLocalErr(({ patientId: _, ...rest }) => rest);
          }}
          error={err.patientId}
        />
        <div className="form-grid">
          <Field label="Date" name="date" type="date" required defaultValue={v.date} error={err.date} />
          <Field label="Début" name="time" type="time" step={300} required defaultValue={v.time} error={err.time} />
          <Field label="Fin" name="end" type="time" step={300} required defaultValue={v.end} error={err.end} />
        </div>
        <Field label="Titre (facultatif, visible par vous seul)" name="title" maxLength={120} defaultValue={v.title} error={err.title} />
        <div className="row">
          {/* « Prévenir le patient » se choisit dans la pop-up de confirmation. */}
          <button type="button" className="btn primary" onClick={(e) => validateThenConfirm(e.currentTarget.form)}>
            {t(editing ? 'Enregistrer' : 'Planifier le rendez-vous')}
          </button>
          {deleteAction && (
            <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
              {t('Supprimer ce rendez-vous')}
            </button>
          )}
        </div>
      </form>
      {/* Pop-ups de confirmation (hors du formulaire : pas de formulaire imbriqué). */}
      {confirmSave && (
        <Modal onClose={() => setConfirmSave(false)}>
          <div className="stack">
            <h2>{t(editing ? 'Enregistrer les modifications ?' : 'Planifier ce rendez-vous ?')}</h2>
            <NotifyCheck checked={notify} onChange={setNotify} label={editing ? 'Prévenir le patient du changement' : 'Prévenir le patient'} />
            <div className="row">
              {/* Envoie le formulaire de la fiche (attribut form). */}
              <button type="submit" form={formId} className="btn primary">
                {t(editing ? 'Enregistrer' : 'Planifier le rendez-vous')}
              </button>
              <button type="button" className="btn" onClick={() => setConfirmSave(false)}>
                {t('Annuler')}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {confirmDelete && deleteAction && (
        <Modal onClose={() => setConfirmDelete(false)}>
          <form action={deleteAction} className="stack">
            <h2>{t('Supprimer ce rendez-vous ?')}</h2>
            <p className="sub">{t('Il disparaîtra de l’agenda. La raison reste visible par le patient dans son espace.')}</p>
            <input type="hidden" name="id" value={values.id} />
            <label className="field">
              <span>{t('Raison (visible par le patient)')}</span>
              <textarea name="reason" rows={2} maxLength={500} placeholder={t('Ex. : orthophoniste malade, formation…')} />
            </label>
            <input type="hidden" name="notify" value={notify ? 'on' : ''} />
            <NotifyCheck checked={notify} onChange={setNotify} label="Prévenir le patient de l’annulation" />
            <div className="row">
              <SubmitButton className="btn danger">Supprimer</SubmitButton>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                {t('Annuler')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
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
          {t('Séance du {jour} à {heure} annulée par le patient.', { jour: formatDay(dialog.date, false, t.locale), heure: formatTime(minutesToTime(dialog.start), t.locale) })}
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

function NotifyCheck({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const t = useT();
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <b>{t(label)}</b>
      </span>
    </label>
  );
}
