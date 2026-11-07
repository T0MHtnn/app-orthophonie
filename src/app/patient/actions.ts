'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
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
  const { data, error } = await supabase.rpc('family_cancel_appointment', { p_id: id.data });
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
