'use client';

import { useActionState, useState } from 'react';
import { FormAlert, SubmitButton, type FormState } from '@/components/form';
import { useT } from '@/components/i18n-provider';
import { Modal } from '@/components/modal';
import { formatShortDate } from '@/lib/time';
import { deleteDocument, setDocumentShared, uploadDocument } from '../actions';

export interface DocumentItem {
  id: string;
  name: string;
  sizeBytes: number;
  uploadedBy: 'ortho' | 'famille';
  shared: boolean;
  createdAt: string;
}

export const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`);

/** Documents du patient : dépôt (chiffré), téléchargement, partage avec le patient, suppression. */
export function Documents({ patientId, documents, accept }: { patientId: string; documents: DocumentItem[]; accept: string }) {
  const [state, action] = useActionState<FormState, FormData>(uploadDocument, {});
  const t = useT();
  return (
    <div className="stack">
      <form key={JSON.stringify(state)} action={action} className="stack note-form" noValidate>
        <FormAlert state={state} />
        <input type="hidden" name="patientId" value={patientId} />
        <label className="field">
          <span>{t('Fichier (4 Mo maximum)')}</span>
          <input type="file" name="file" accept={accept} required aria-invalid={state.errors?.file ? true : undefined} />
          {state.errors?.file && <span className="error">{t(state.errors.file)}</span>}
        </label>
        <label className="check">
          <input type="checkbox" name="shared" />
          <span>{t('Partager avec le patient (visible dans son espace)')}</span>
        </label>
        <div>
          <SubmitButton className="btn primary small" pendingText="Envoi…">
            Déposer le document
          </SubmitButton>
        </div>
      </form>
      {documents.length === 0 && <p className="hint">{t('Aucun document pour l’instant.')}</p>}
      {documents.map((d) => (
        <DocumentRow key={`${d.id}-${d.shared}`} doc={d} />
      ))}
    </div>
  );
}

function DocumentRow({ doc }: { doc: DocumentItem }) {
  const [confirm, setConfirm] = useState(false);
  const t = useT();
  return (
    <div className="request">
      <div>
        <a href={`/api/documents/${doc.id}`} download>
          <b>{doc.name}</b>
        </a>
        <div className="hint">
          {formatSize(doc.sizeBytes)} · {formatShortDate(doc.createdAt, t.locale)} · {t(doc.uploadedBy === 'famille' ? 'Déposé par le patient' : doc.shared ? 'Partagé avec le patient' : 'Privé')}
        </div>
      </div>
      <div className="row">
        {doc.uploadedBy === 'ortho' && (
          <form action={setDocumentShared}>
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="shared" value={doc.shared ? 'non' : 'oui'} />
            <SubmitButton className="btn small">{doc.shared ? 'Ne plus partager' : 'Partager'}</SubmitButton>
          </form>
        )}
        <button type="button" className="linkbtn danger" onClick={() => setConfirm(true)}>
          {t('Supprimer')}
        </button>
      </div>
      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <form
            action={async (fd) => {
              await deleteDocument(fd);
              setConfirm(false);
            }}
            className="stack"
          >
            <h2>{t('Supprimer ce document ?')}</h2>
            <p className="sub">{t('Il sera effacé définitivement, aussi de l’espace du patient.')}</p>
            <input type="hidden" name="id" value={doc.id} />
            <div className="row">
              <SubmitButton className="btn danger">Supprimer</SubmitButton>
              <button type="button" className="btn" onClick={() => setConfirm(false)}>
                {t('Annuler')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
