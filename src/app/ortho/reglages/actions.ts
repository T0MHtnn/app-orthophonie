'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/components/form';
import { requireOrtho } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { bookingSettingsSchema, fieldErrors, practiceSettingsSchema } from '@/lib/validation';

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const raw = {
    name: String(formData.get('name') ?? ''),
    addressLine: String(formData.get('addressLine') ?? ''),
    postalCode: String(formData.get('postalCode') ?? ''),
    city: String(formData.get('city') ?? ''),
    listed: formData.get('listed') ?? undefined,
    waitlistOpen: formData.get('waitlistOpen') ?? undefined,
    waitlistInfo: String(formData.get('waitlistInfo') ?? ''),
    emailTemplate: String(formData.get('emailTemplate') ?? ''),
  };
  const parsed = practiceSettingsSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from('practices')
    .update({
      name: parsed.data.name,
      address_line: parsed.data.addressLine || null,
      postal_code: parsed.data.postalCode,
      city: parsed.data.city,
      listed: parsed.data.listed === 'on',
      waitlist_open: parsed.data.waitlistOpen === 'on',
      waitlist_info: parsed.data.waitlistInfo,
      email_template: parsed.data.emailTemplate,
    })
    .eq('id', practice.id);
  if (error) return { message: 'Enregistrement impossible. Réessayez.' };

  revalidatePath('/ortho', 'layout');
  return { ok: true, message: 'Réglages enregistrés.' };
}

export async function saveBookingSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const raw = {
    mode: String(formData.get('mode') ?? ''),
    minNoticeHours: String(formData.get('minNoticeHours') ?? ''),
    linksRespectNotice: String(formData.get('linksRespectNotice') ?? ''),
  };
  const parsed = bookingSettingsSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Certains champs sont à corriger.', values: raw };
  const supabase = await createClient();
  const { error } = await supabase
    .from('practices')
    .update({ booking_mode: parsed.data.mode, booking_min_notice_hours: parsed.data.minNoticeHours, links_respect_notice: raw.linksRespectNotice === 'on' })
    .eq('id', practice.id);
  if (error) {
    console.error('booking_settings', error.code);
    return { message: 'Enregistrement impossible. Réessayez.', values: raw };
  }
  revalidatePath('/ortho', 'layout');
  return { ok: true, message: 'Réglages de prise de rendez-vous enregistrés.', values: raw };
}

/** Case « patient autonome » (fiche patient ou liste des réglages). La RLS limite au cabinet, en aal2. */
export async function setPatientAutonomous(patientId: string, autonomous: boolean): Promise<{ ok: boolean }> {
  await requireOrtho();
  const id = z.uuid().safeParse(patientId);
  if (!id.success) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.from('patients').update({ autonomous }).eq('id', id.data).select('id');
  if (error || !data?.length) {
    console.error('patient_autonomous', error?.code ?? 'no_row');
    return { ok: false };
  }
  revalidatePath('/ortho', 'layout');
  return { ok: true };
}
