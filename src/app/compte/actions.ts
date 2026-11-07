'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/components/form';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, profileNameSchema } from '@/lib/validation';

export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const raw = { firstName: String(formData.get('firstName') ?? ''), lastName: String(formData.get('lastName') ?? '') };
  // Même exigence que l'espace ortho : un compte avec double authentification doit l'avoir validée.
  if (ctx.hasMfa && ctx.aal !== 'aal2') return { message: 'Votre session a expiré. Reconnectez-vous puis réessayez.', values: raw };
  const parsed = profileNameSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName })
    .eq('id', ctx.userId);
  if (error) {
    console.error('save_profile', error.code);
    return { message: 'Enregistrement impossible. Réessayez.', values: raw };
  }

  revalidatePath('/', 'layout');
  return { ok: true, message: 'Informations enregistrées.', values: parsed.data };
}
