'use client';

import { useActionState } from 'react';
import { Field, FormAlert, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import { formatDay, formatShortDate } from '@/lib/time';
import { addHomework, deleteHomework } from '../actions';

export interface HomeworkItem {
  id: string;
  title: string;
  instructions: string | null;
  documentId: string | null;
  documentName: string | null;
  dueDate: string | null;
  doneAt: string | null;
  createdAt: string;
}

/** Devoirs donnés au patient : visibles dans son espace, cochés par lui quand c'est fait. */
export function Homework({ patientId, items, documents }: { patientId: string; items: HomeworkItem[]; documents: { id: string; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(addHomework, {});
  const t = useT();
  const v = state.ok ? {} : (state.values ?? {});
  const e = state.errors ?? {};
  return (
    <div className="stack">
      <form key={JSON.stringify(state)} action={action} className="stack note-form" noValidate>
        <FormAlert state={state} />
        <input type="hidden" name="patientId" value={patientId} />
        <Field label="Titre" name="title" required maxLength={120} placeholder="Ex. : Lire 10 minutes chaque soir" defaultValue={v.title} error={e.title} />
        <label className="field">
          <span>{t('Consignes (facultatif)')}</span>
          <textarea name="instructions" rows={3} maxLength={5000} defaultValue={v.instructions} />
        </label>
        <div className="form-grid">
          <label className="field">
            <span>{t('Document joint (facultatif)')}</span>
            <select name="documentId" defaultValue={v.documentId ?? ''}>
              <option value="">{t('Aucun')}</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="À faire pour le (facultatif)" name="dueDate" type="date" defaultValue={v.dueDate} error={e.dueDate} />
        </div>
        <p className="hint">{t('Un document joint devient visible par le patient. Déposez-le d’abord dans « Documents ».')}</p>
        <div>
          <SubmitButton className="btn primary small" pendingText="Envoi…">
            Donner ce devoir
          </SubmitButton>
        </div>
      </form>

      {items.length === 0 && <p className="hint">{t('Aucun devoir pour l’instant.')}</p>}
      {items.map((h) => (
        <article key={h.id} className="note">
          <header className="row spread">
            <span>
              <b>{h.title}</b>{' '}
              <span className={`badge ${h.doneAt ? 'rdv' : 'attente'}`}>
                {h.doneAt ? t('Fait le {date}', { date: formatShortDate(h.doneAt, t.locale) }) : t('À faire')}
              </span>
            </span>
            <form action={deleteHomework}>
              <input type="hidden" name="id" value={h.id} />
              <SubmitButton className="linkbtn danger">Retirer</SubmitButton>
            </form>
          </header>
          <p className="hint">
            {t('Donné le {date}', { date: formatShortDate(h.createdAt, t.locale) })}
            {h.dueDate && ` · ${t('pour le {date}', { date: formatDay(h.dueDate, false, t.locale) })}`}
          </p>
          {h.instructions && <p className="note-body">{h.instructions}</p>}
          {h.documentId && (
            <p>
              📎{' '}
              <a href={`/api/documents/${h.documentId}`} download>
                {h.documentName ?? t('Document')}
              </a>
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
