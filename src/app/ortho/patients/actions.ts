'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/form';
import { requireOrtho } from '@/lib/auth';
import type { RequestType } from '@/lib/request-type';
import { createClient } from '@/lib/supabase/server';
import { DOCUMENTS_BUCKET, documentsConfigured, encryptDocument, readUpload, storageError, storagePath } from '@/lib/documents';
import { caregiverSchema, fieldErrors, homeworkSchema, patientFileSchema, sessionNoteSchema } from '@/lib/validation';

const idSchema = z.uuid();
const FIELDS = [
  'firstName',
  'lastName',
  'birthDate',
  'caregiverFirstName',
  'caregiverLastName',
  'phone',
  'pathology',
  'requestType',
  'prescriberName',
  'prescriptionDate',
  'amoAct',
  'sessionsPrescribed',
] as const;

/** Fiche patient : identité, aidant, contact, motif, prescription et acte AMO. */
export async function savePatient(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOrtho();
  const raw = Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? '')]));
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return { message: 'Patient introuvable.', values: raw };
  const parsed = patientFileSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Certains champs sont à corriger.', values: raw };
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('patients')
    .update({
      first_name: d.firstName,
      last_name: d.lastName,
      birth_date: d.birthDate || null,
      caregiver_first_name: d.caregiverFirstName || null,
      caregiver_last_name: d.caregiverLastName || null,
      phone: d.phone || null,
      pathology_code: d.pathology || null,
      request_type: (d.requestType || null) as RequestType | null,
      prescriber_name: d.prescriberName || null,
      prescription_date: d.prescriptionDate || null,
      amo_act_code: d.amoAct || null,
      sessions_prescribed: d.sessionsPrescribed === '' ? null : d.sessionsPrescribed,
    })
    .eq('id', id.data)
    .select('id');
  if (error || !data?.length) {
    console.error('save_patient', error?.code ?? 'no_row');
    if (error?.code === '23514') return { errors: { phone: 'Numéro invalide : 10 chiffres (06 12 34 56 78) ou format international (+32…)' }, values: raw };
    return { message: 'Enregistrement impossible. Réessayez.', values: raw };
  }
  revalidatePath('/ortho', 'layout');
  return { ok: true, message: 'Fiche enregistrée.', values: raw };
}

/** Nouvelle note de séance (privée, jamais visible par le patient). */
export async function addNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const patientId = idSchema.safeParse(formData.get('patientId'));
  const raw = { body: String(formData.get('body') ?? ''), appointmentId: String(formData.get('appointmentId') ?? '') };
  if (!patientId.success) return { message: 'Patient introuvable.' };
  const parsed = sessionNoteSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  const supabase = await createClient();
  const { error } = await supabase.from('session_notes').insert({
    practice_id: practice.id,
    patient_id: patientId.data,
    appointment_id: parsed.data.appointmentId || null,
    body: parsed.data.body,
  });
  if (error) {
    console.error('add_note', error.code);
    return { message: 'La note n’a pas pu être enregistrée.', values: raw };
  }
  revalidatePath(`/ortho/patients/${patientId.data}`);
  return { ok: true, message: 'Note enregistrée.' };
}

export async function updateNote(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  const raw = { body: String(formData.get('body') ?? ''), appointmentId: String(formData.get('appointmentId') ?? '') };
  if (!id.success) return { message: 'Note introuvable.' };
  const parsed = sessionNoteSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('session_notes')
    .update({ body: parsed.data.body, appointment_id: parsed.data.appointmentId || null })
    .eq('id', id.data)
    .select('patient_id');
  if (error || !data?.length) {
    console.error('update_note', error?.code ?? 'no_row');
    return { message: 'La note n’a pas pu être enregistrée.', values: raw };
  }
  revalidatePath(`/ortho/patients/${data[0]!.patient_id}`);
  return { ok: true, message: 'Note enregistrée.', values: raw };
}

export async function deleteNote(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from('session_notes').delete().eq('id', id.data).select('patient_id');
  if (error || !data?.length) console.error('delete_note', error?.code ?? 'no_row');
  if (data?.[0]) revalidatePath(`/ortho/patients/${data[0].patient_id}`);
}

// ---------------------------------------------------------------------------
// Aidants supplémentaires
// ---------------------------------------------------------------------------
export async function addCaregiver(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const patientId = idSchema.safeParse(formData.get('patientId'));
  const raw = Object.fromEntries(['firstName', 'lastName', 'relation', 'phone', 'email'].map((k) => [k, String(formData.get(k) ?? '')]));
  if (!patientId.success) return { message: 'Patient introuvable.' };
  const parsed = caregiverSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from('patient_caregivers').insert({
    practice_id: practice.id,
    patient_id: patientId.data,
    first_name: d.firstName,
    last_name: d.lastName,
    relation: d.relation || null,
    phone: d.phone || null,
    email: d.email || null,
  });
  if (error) {
    console.error('add_caregiver', error.code);
    return { message: 'L’aidant n’a pas pu être ajouté.', values: raw };
  }
  revalidatePath(`/ortho/patients/${patientId.data}`);
  return { ok: true, message: 'Aidant ajouté.' };
}

export async function deleteCaregiver(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from('patient_caregivers').delete().eq('id', id.data).select('patient_id');
  if (error || !data?.length) console.error('delete_caregiver', error?.code ?? 'no_row');
  if (data?.[0]) revalidatePath(`/ortho/patients/${data[0].patient_id}`);
}

// ---------------------------------------------------------------------------
// Documents (chiffrés avant stockage, voir lib/documents.ts)
// ---------------------------------------------------------------------------
export async function uploadDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const patientId = idSchema.safeParse(formData.get('patientId'));
  if (!patientId.success) return { message: 'Patient introuvable.' };
  if (!documentsConfigured()) return { message: 'Le dépôt de documents n’est pas encore configuré (clé de chiffrement manquante).' };
  const file = await readUpload(formData.get('file'));
  if (!file.ok) return { errors: { file: file.message } };

  const supabase = await createClient();
  const path = storagePath(practice.id, patientId.data);
  const { error: upError } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, encryptDocument(file.data), { contentType: 'application/octet-stream' });
  if (upError) {
    console.error('upload_document', storageError(upError));
    return { message: 'Le document n’a pas pu être déposé. Réessayez.' };
  }
  const { error } = await supabase.from('patient_documents').insert({
    practice_id: practice.id,
    patient_id: patientId.data,
    name: file.name,
    mime_type: file.mime,
    size_bytes: file.data.length,
    storage_path: path,
    shared: formData.get('shared') === 'on',
  });
  if (error) {
    console.error('insert_document', error.code);
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
    return { message: 'Le document n’a pas pu être déposé. Réessayez.' };
  }
  revalidatePath(`/ortho/patients/${patientId.data}`);
  return { ok: true, message: 'Document déposé.' };
}

/** Partager (ou non) un document avec le patient. */
export async function setDocumentShared(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from('patient_documents').update({ shared: formData.get('shared') === 'oui' }).eq('id', id.data).select('patient_id');
  if (error || !data?.length) console.error('share_document', error?.code ?? 'no_row');
  if (data?.[0]) revalidatePath(`/ortho/patients/${data[0].patient_id}`);
}

export async function deleteDocument(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from('patient_documents').delete().eq('id', id.data).select('patient_id, storage_path');
  if (error || !data?.length) {
    console.error('delete_document', error?.code ?? 'no_row');
    return;
  }
  const { error: rmError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([data[0]!.storage_path]);
  if (rmError) console.error('remove_document', rmError.name);
  revalidatePath(`/ortho/patients/${data[0]!.patient_id}`);
}

// ---------------------------------------------------------------------------
// Devoirs (visibles dans l'espace du patient)
// ---------------------------------------------------------------------------
export async function addHomework(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const patientId = idSchema.safeParse(formData.get('patientId'));
  const raw = Object.fromEntries(['title', 'instructions', 'documentId', 'dueDate'].map((k) => [k, String(formData.get(k) ?? '')]));
  if (!patientId.success) return { message: 'Patient introuvable.' };
  const parsed = homeworkSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from('homework').insert({
    practice_id: practice.id,
    patient_id: patientId.data,
    title: d.title,
    instructions: d.instructions || null,
    document_id: d.documentId || null,
    due_date: d.dueDate || null,
  });
  if (error) {
    console.error('add_homework', error.code);
    return { message: 'Le devoir n’a pas pu être enregistré.', values: raw };
  }
  revalidatePath(`/ortho/patients/${patientId.data}`);
  return { ok: true, message: 'Devoir envoyé : le patient le voit dans son espace.' };
}

export async function deleteHomework(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from('homework').delete().eq('id', id.data).select('patient_id');
  if (error || !data?.length) console.error('delete_homework', error?.code ?? 'no_row');
  if (data?.[0]) revalidatePath(`/ortho/patients/${data[0].patient_id}`);
}
