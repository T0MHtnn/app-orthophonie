'use client';

import { useActionState, useState } from 'react';
import { FormAlert, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import type { Database } from '@/lib/database.types';
import { formatDay, formatShortDate } from '@/lib/time';
import { deleteMyDocument, setHomeworkDone, uploadMyDocument } from './actions';

type HomeworkItem = Database['public']['Functions']['my_homework']['Returns'][number];
type DocumentItem = Database['public']['Functions']['my_documents']['Returns'][number];

/** Devoirs donnés par l'orthophoniste : à cocher quand c'est fait. */
export function MyHomework({ items, showPatient }: { items: HomeworkItem[]; showPatient: boolean }) {
  const t = useT();
  if (items.length === 0) return <p className="hint">{t('Aucun exercice pour l’instant.')}</p>;
  return (
    <div>
      {items.map((h) => (
        <article key={h.id} className={`note ${h.done_at ? 'done' : ''}`}>
          <header className="row spread">
            <span>
              <b>{h.title}</b>
              {showPatient && <span className="hint"> · {h.patient_first_name}</span>}
            </span>
            <form action={setHomeworkDone}>
              <input type="hidden" name="id" value={h.id} />
              <input type="hidden" name="done" value={h.done_at ? 'non' : 'oui'} />
              <SubmitButton className={`btn small ${h.done_at ? '' : 'primary'}`}>{h.done_at ? 'Pas encore fait' : 'C’est fait'}</SubmitButton>
            </form>
          </header>
          <p className="hint">
            {h.done_at ? t('Fait le {date}', { date: formatShortDate(h.done_at, t.locale) }) : t('À faire')}
            {h.due_date && ` · ${t('pour le {date}', { date: formatDay(h.due_date, false, t.locale) })}`}
          </p>
          {h.instructions && <p className="note-body">{h.instructions}</p>}
          {h.document_id && (
            <p>
              📎{' '}
              <a href={`/api/documents/${h.document_id}`} download>
                {h.document_name ?? t('Document')}
              </a>
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

/**
 * Onglet Documents : à gauche les documents (partagés par le cabinet ou envoyés par la famille),
 * à droite une carte à part pour en envoyer un, avec une zone de dépôt.
 */
export function MyDocuments({ items, patients, accept }: { items: DocumentItem[]; patients: { id: string; label: string }[]; accept: string }) {
  const [state, action] = useActionState<FormState, FormData>(uploadMyDocument, {});
  const [fileName, setFileName] = useState('');
  const t = useT();
  return (
    <div className="docs-layout">
      <section className="card stack">
        <h2>{t('Mes documents')}</h2>
        {items.length === 0 ? (
          <p className="hint">{t('Aucun document pour l’instant. Ceux que le cabinet partage avec vous apparaîtront ici.')}</p>
        ) : (
          <ul className="doc-list">
            {items.map((d) => (
              <li key={d.id}>
                <span className="doc-icon" aria-hidden="true">
                  {d.mime_type === 'application/pdf' ? 'PDF' : d.mime_type.startsWith('image/') ? 'IMG' : d.mime_type.startsWith('audio/') ? '♪' : 'DOC'}
                </span>
                <div className="doc-main">
                  <a href={`/api/documents/${d.id}`} download>
                    {d.name}
                  </a>
                  <span className="hint">
                    {patients.length > 1 && `${d.patient_first_name} · `}
                    {formatShortDate(d.created_at, t.locale)} · {t(d.uploaded_by === 'famille' ? 'Envoyé par vous' : 'Partagé par le cabinet')}
                  </span>
                </div>
                <a className="btn small" href={`/api/documents/${d.id}`} download>
                  {t('Télécharger')}
                </a>
                {d.uploaded_by === 'famille' && (
                  <form action={deleteMyDocument}>
                    <input type="hidden" name="id" value={d.id} />
                    <SubmitButton className="linkbtn danger">Retirer</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack upload-card">
        <h2>{t('Envoyer un document')}</h2>
        <p className="hint">{t('Par exemple un bilan déjà réalisé, une ordonnance ou un compte rendu. Il est chiffré et seul le cabinet peut le lire.')}</p>
        <form key={JSON.stringify(state)} action={action} className="stack" noValidate onSubmit={() => setFileName('')}>
          <FormAlert state={state} />
          {patients.length > 1 ? (
            <label className="field">
              <span>{t('Patient concerné')}</span>
              <select name="patientId" required defaultValue="">
                <option value="" disabled>
                  {t('Choisir')}
                </option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="patientId" value={patients[0]?.id ?? ''} />
          )}
          <label className={`dropzone ${state.errors?.file ? 'invalid' : ''}`}>
            <input type="file" name="file" accept={accept} required className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />
            <span className="dropzone-icon" aria-hidden="true">
              ⬆
            </span>
            <b>{fileName || t('Choisir un fichier')}</b>
            <span className="hint">{t('PDF, image, Word, texte ou audio · 4 Mo maximum')}</span>
          </label>
          {state.errors?.file && <span className="error">{t(state.errors.file)}</span>}
          <div>
            <SubmitButton className="btn primary" pendingText="Envoi…">
              Envoyer à l’orthophoniste
            </SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
