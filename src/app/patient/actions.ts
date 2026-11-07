'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import type { FormState } from '@/components/form';
import { DOCUMENTS_BUCKET, documentsConfigured, encryptDocument, readUpload, storagePath } from '@/lib/documents';
import { createClient } from '@/lib/supabase/server';

/** La famille retire sa propre demande (la base vérifie qu'elle en est l'auteur). */
export async function withdrawRequest(formData: FormData): Promise<void> {
  await requireUser();
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc('withdraw_waitlist_entry', { p_id: id.data });
  revalidatePath('/patient');
}

/** Réservation d'une séance. La base revérifie tout (mode du cabinet, autonome, délai, créneau libre). */
export async function bookSlot(formData: FormData): Promise<void> {
  await requireUser();
  const patientId = z.uuid().safeParse(formData.get('patientId'));
  const startsAt = z.iso.datetime({ offset: true }).safeParse(formData.get('startsAt'));
  const week = String(formData.get('semaine') ?? '');
  const back = `/patient/reserver?patient=${patientId.success ? patientId.data : ''}${/^\d{4}-\d{2}-\d{2}$/.test(week) ? `&semaine=${week}` : ''}`;
  if (!patientId.success || !startsAt.success) redirect(`${back}&erreur=invalide`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('book_appointment', { p_patient_id: patientId.data, p_starts_at: startsAt.data });
  if (error) {
    const reason = error.code === 'P0409' ? 'pris' : error.code === 'P0411' ? 'delai' : error.code === 'P0412' ? 'attente' : error.code === 'P0429' ? 'limite' : 'autre';
    if (reason === 'autre') console.error('book_appointment', error.code);
    redirect(`${back}&erreur=${reason}`);
  }
  revalidatePath('/patient');
  redirect(`/patient?ok=${data === 'confirme' ? 'reserve' : 'demande'}`);
}

/** Annulation par la famille (demande en attente, ou RDV confirmé avant le délai minimum). */
export async function cancelMyAppointment(formData: FormData): Promise<void> {
  await requireUser();
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 500);
  const { data, error } = await supabase.rpc('family_cancel_appointment', { p_id: id.data, p_reason: reason });
  if (error) console.error('family_cancel_appointment', error.code);
  revalidatePath('/patient');
  redirect(`/patient?${!error && data ? 'ok=annule' : 'erreur=annulation'}`);
}

/** La famille supprime définitivement une de ses demandes retirées. */
export async function deleteMyRequest(formData: FormData): Promise<void> {
  await requireUser();
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_my_waitlist_entry', { p_id: id.data });
  if (error) console.error('delete_my_waitlist_entry', error.code);
  revalidatePath('/patient');
}

/** La famille a vu la nouvelle séance signalée par l'ortho (« Lu »). */
export async function ackAppointment(formData: FormData): Promise<void> {
  await requireUser();
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc('ack_appointment', { p_id: id.data });
  if (error) console.error('ack_appointment', error.code);
  revalidatePath('/patient');
}

/** Devoir fait / pas fait (coché par la famille). */
export async function setHomeworkDone(formData: FormData): Promise<void> {
  await requireUser();
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_homework_done', { p_id: id.data, p_done: formData.get('done') === 'oui' });
  if (error) console.error('set_homework_done', error.code);
  revalidatePath('/patient');
}

/** Dépôt d'un document par la famille (ex. bilan existant), visible par l'orthophoniste. */
export async function uploadMyDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const patientId = z.uuid().safeParse(formData.get('patientId'));
  if (!patientId.success) return { message: 'Choisissez le patient concerné.' };
  if (!documentsConfigured()) return { message: 'Le dépôt de documents n’est pas encore disponible.' };
  const file = await readUpload(formData.get('file'));
  if (!file.ok) return { errors: { file: file.message } };

  const supabase = await createClient();
  const { data: patients } = await supabase.rpc('my_patients');
  const patient = patients?.find((p) => p.id === patientId.data);
  if (!patient) return { message: 'Choisissez le patient concerné.' };
  const path = storagePath(patient.practice_id, patient.id);
  const { error: upError } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, encryptDocument(file.data), { contentType: 'application/octet-stream' });
  if (upError) {
    console.error('family_upload', upError.name);
    return { message: 'Le document n’a pas pu être envoyé. Réessayez.' };
  }
  const { error } = await supabase.rpc('family_add_document', {
    p_patient_id: patient.id,
    p_name: file.name,
    p_mime_type: file.mime,
    p_size_bytes: file.data.length,
    p_storage_path: path,
  });
  if (error) {
    console.error('family_add_document', error.code);
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
    return { message: error.code === 'P0429' ? 'Trop de documents envoyés aujourd’hui. Réessayez demain.' : 'Le document n’a pas pu être envoyé. Réessayez.' };
  }
  revalidatePath('/patient');
  return { ok: true, message: 'Document envoyé à l’orthophoniste.' };
}

/** La famille retire un document qu'elle a déposé. */
export async function deleteMyDocument(formData: FormData): Promise<void> {
  await requireUser();
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc('family_delete_document', { p_id: id.data });
  if (error || !path) {
    console.error('family_delete_document', error?.code ?? 'no_row');
    return;
  }
  const { error: rmError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
  if (rmError) console.error('family_remove_document', rmError.name);
  revalidatePath('/patient');
}
