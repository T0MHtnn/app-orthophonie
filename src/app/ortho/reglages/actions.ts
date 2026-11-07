'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/components/form';
import { requireOrtho } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, practiceSettingsSchema } from '@/lib/validation';

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
