'use client';

import { useActionState, useState } from 'react';
import { FormAlert, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import { Modal } from '@/components/modal';
import type { SessionNoteRow } from '@/lib/database.types';
import { formatInstant } from '@/lib/time';
import { addNote, deleteNote, updateNote } from '../actions';

interface SessionOption {
  id: string;
  label: string;
}

type Note = SessionNoteRow & { sessionLabel: string | null };

/** Notes de séance privées : ajout, modification, suppression (avec confirmation). */
export function Notes({ patientId, sessions, notes }: { patientId: string; sessions: SessionOption[]; notes: Note[] }) {
  const [state, action] = useActionState<FormState, FormData>(addNote, {});
  const t = useT();
  // Après un ajout réussi, le formulaire repart vide ; en cas d'erreur, il garde le texte.
  const v = state.ok ? { body: '', appointmentId: sessions[0]?.id ?? '' } : (state.values ?? { body: '', appointmentId: sessions[0]?.id ?? '' });

  return (
    <div className="stack">
      <form key={JSON.stringify(state)} action={action} className="stack note-form" noValidate>
        <FormAlert state={state} />
        <input type="hidden" name="patientId" value={patientId} />
        <SessionSelect sessions={sessions} defaultValue={v.appointmentId ?? ''} />
        <label className="field">
          <span className="sr-only">{t('Note')}</span>
          <textarea name="body" rows={4} maxLength={10000} required placeholder={t('Déroulé de la séance, observations, exercices travaillés…')} defaultValue={v.body} aria-invalid={state.errors?.body ? true : undefined} />
          {state.errors?.body && <span className="error">{t(state.errors.body)}</span>}
        </label>
        <div>
          <SubmitButton className="btn primary small" pendingText="Enregistrement…">
            Ajouter la note
          </SubmitButton>
        </div>
      </form>

      {notes.length === 0 && <p className="hint">{t('Aucune note pour l’instant.')}</p>}
      {notes.map((n) => (
        <NoteItem key={`${n.id}-${n.updated_at}`} note={n} sessions={sessions} />
      ))}
    </div>
  );
}

function SessionSelect({ sessions, defaultValue }: { sessions: SessionOption[]; defaultValue: string }) {
  const t = useT();
  return (
    <label className="field">
      <span>{t('Séance')}</span>
      <select name="appointmentId" defaultValue={defaultValue}>
        <option value="">{t('Note générale (sans séance)')}</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NoteItem({ note, sessions }: { note: Note; sessions: SessionOption[] }) {
  const [state, action] = useActionState<FormState, FormData>(updateNote, {});
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const t = useT();
  const edited = note.updated_at !== note.created_at;

  return (
    <article className="note">
      <header className="row spread">
        <span className="hint">
          {note.sessionLabel ? <span style={{ textTransform: 'capitalize' }}>{note.sessionLabel}</span> : t('Note générale')}
          {' · '}
          {t('écrite le {date}', { date: formatInstant(note.created_at, t.locale) })}
          {edited && ` · ${t('modifiée')}`}
        </span>
        {!editing && (
          <span className="row">
            <button type="button" className="linkbtn" onClick={() => setEditing(true)}>
              {t('Modifier')}
            </button>
            <button type="button" className="linkbtn danger" onClick={() => setConfirm(true)}>
              {t('Supprimer')}
            </button>
          </span>
        )}
      </header>
      {editing ? (
        <form key={JSON.stringify(state)} action={action} className="stack" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="id" value={note.id} />
          <SessionSelect sessions={sessions} defaultValue={state.values?.appointmentId ?? note.appointment_id ?? ''} />
          <label className="field">
            <span className="sr-only">{t('Note')}</span>
            <textarea name="body" rows={5} maxLength={10000} defaultValue={state.values?.body ?? note.body} aria-invalid={state.errors?.body ? true : undefined} />
            {state.errors?.body && <span className="error">{t(state.errors.body)}</span>}
          </label>
          <div className="row">
            <SubmitButton className="btn primary small">Enregistrer</SubmitButton>
            <button type="button" className="btn small" onClick={() => setEditing(false)}>
              {t('Annuler')}
            </button>
          </div>
        </form>
      ) : (
        <p className="note-body">{note.body}</p>
      )}
      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <form
            action={async (fd) => {
              await deleteNote(fd);
              setConfirm(false);
            }}
            className="stack"
          >
            <h2>{t('Supprimer cette note ?')}</h2>
            <p className="sub">{t('Elle sera effacée définitivement.')}</p>
            <input type="hidden" name="id" value={note.id} />
            <div className="row">
              <SubmitButton className="btn danger">Supprimer</SubmitButton>
              <button type="button" className="btn" onClick={() => setConfirm(false)}>
                {t('Annuler')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </article>
  );
}
