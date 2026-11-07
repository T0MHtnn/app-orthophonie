'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/form';
import { requireOrtho } from '@/lib/auth';
import type { RequestType } from '@/lib/request-type';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, patientFileSchema, sessionNoteSchema } from '@/lib/validation';

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
