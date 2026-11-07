'use server';

import { redirect } from 'next/navigation';
import type { FormState } from '@/components/form';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, practiceSchema } from '@/lib/validation';

export async function createPractice(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const raw = Object.fromEntries(['name', 'slug', 'rpps', 'addressLine', 'postalCode', 'city'].map((k) => [k, String(formData.get(k) ?? '')]));
  const parsed = practiceSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase.rpc('register_practice', {
    p_name: d.name,
    p_slug: d.slug,
    p_rpps: d.rpps,
    p_address_line: d.addressLine,
    p_postal_code: d.postalCode,
    p_city: d.city,
  });
  if (error) {
    if (error.code === '23505' && error.message.includes('slug')) return { errors: { slug: 'Cette adresse est déjà prise.' }, values: raw };
    if (error.code === '23505') return { message: 'Un cabinet existe déjà pour ce compte.', values: raw };
    if (error.code === '42501') return { message: 'Confirmez votre adresse email avant de créer votre cabinet.', values: raw };
    return { message: 'Création impossible pour le moment. Réessayez.', values: raw };
  }
  redirect('/mfa/activer');
}
