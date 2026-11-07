'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { FormState } from '@/components/form';
import { requireOrtho } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { parisToInstant, startOfWeek } from '@/lib/time';
import { appointmentSchema, fieldErrors, openingHourSchema, scheduleExceptionSchema, sessionMinutesSchema } from '@/lib/validation';

const idSchema = z.uuid();
const str = (formData: FormData, k: string) => String(formData.get(k) ?? '');

/**
 * Chaque action revérifie l'accès (requireOrtho). La base revérifie le cabinet,
 * la double authentification et l'absence de chevauchement (save_appointment).
 */
export async function saveAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOrtho();
  const raw = Object.fromEntries(['id', 'patientId', 'date', 'time', 'duration'].map((k) => [k, str(formData, k)]));
  const parsed = appointmentSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  const d = parsed.data;
  const start = parisToInstant(d.date, d.time);
  const end = new Date(start.getTime() + d.duration * 60_000);
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_appointment', {
    p_id: d.id || null,
    p_patient_id: d.patientId,
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
  });
  if (error?.code === 'P0409') return { errors: { time: 'Ce créneau chevauche un autre rendez-vous.' }, values: raw };
  if (error) {
    console.error('save_appointment', error.code);
    return { message: 'Le rendez-vous n’a pas pu être enregistré. Rechargez la page puis réessayez.', values: raw };
  }
  redirect(`/ortho/planning?semaine=${startOfWeek(d.date)}&ok=${d.id ? 'deplace' : 'ajoute'}`);
}

export async function cancelAppointment(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  const week = str(formData, 'semaine');
  if (!id.success) return;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cancel_appointment', { p_id: id.data });
  if (error) console.error('cancel_appointment', error.code);
  const back = /^\d{4}-\d{2}-\d{2}$/.test(week) ? `semaine=${week}&` : '';
  redirect(`/ortho/planning?${back}${!error && data ? 'ok=annule' : 'erreur=annulation'}`);
}

export async function saveSessionMinutes(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const parsed = sessionMinutesSchema.safeParse(formData.get('sessionMinutes'));
  if (!parsed.success) return { errors: { sessionMinutes: parsed.error.issues[0]?.message ?? 'Durée invalide' } };
  const supabase = await createClient();
  const { error } = await supabase.from('practices').update({ session_minutes: parsed.data }).eq('id', practice.id);
  if (error) return { message: 'Enregistrement impossible. Réessayez.' };
  revalidatePath('/ortho/planning', 'layout');
  return { ok: true, message: 'Durée enregistrée.' };
}

export async function addOpeningHour(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const raw = Object.fromEntries(['weekday', 'start', 'end'].map((k) => [k, str(formData, k)]));
  const parsed = openingHourSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };
  const supabase = await createClient();
  const { error } = await supabase
    .from('opening_hours')
    .insert({ practice_id: practice.id, weekday: parsed.data.weekday, starts_at: parsed.data.start, ends_at: parsed.data.end });
  if (error) {
    console.error('opening_hours', error.code);
    return { message: 'Enregistrement impossible. Réessayez.', values: raw };
  }
  revalidatePath('/ortho/planning', 'layout');
  return { ok: true, message: 'Plage ajoutée.', values: { weekday: raw.weekday ?? '1', start: raw.start ?? '', end: raw.end ?? '' } };
}

export async function deleteOpeningHour(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from('opening_hours').delete().eq('id', id.data);
  revalidatePath('/ortho/planning', 'layout');
}

export async function addScheduleException(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const raw = Object.fromEntries(['kind', 'startDate', 'startTime', 'endDate', 'endTime', 'label'].map((k) => [k, str(formData, k)]));
  const parsed = scheduleExceptionSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from('schedule_exceptions').insert({
    practice_id: practice.id,
    kind: d.kind,
    starts_at: parisToInstant(d.startDate, d.startTime).toISOString(),
    ends_at: parisToInstant(d.endDate, d.endTime).toISOString(),
    label: d.label,
  });
  if (error) {
    console.error('schedule_exceptions', error.code);
    return { message: 'Enregistrement impossible. Réessayez.', values: raw };
  }
  revalidatePath('/ortho/planning', 'layout');
  return { ok: true, message: d.kind === 'ferme' ? 'Fermeture ajoutée.' : 'Ouverture exceptionnelle ajoutée.' };
}

export async function deleteScheduleException(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from('schedule_exceptions').delete().eq('id', id.data);
  revalidatePath('/ortho/planning', 'layout');
}
