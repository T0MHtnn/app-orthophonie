'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/components/form';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/env';
import { getT } from '@/lib/i18n';
import { emailSchema, fieldErrors, profileNameSchema } from '@/lib/validation';

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

/**
 * Changement d'adresse email : Supabase envoie un lien de confirmation (aux deux adresses
 * si « Secure email change » est actif). Le lien ramène sur /auth/email-modifie, qui
 * déconnecte tous les appareils.
 */
export async function changeEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const raw = { email: String(formData.get('email') ?? '') };
  if (ctx.hasMfa && ctx.aal !== 'aal2') return { message: 'Votre session a expiré. Reconnectez-vous puis réessayez.', values: raw };
  const parsed = emailSchema.safeParse(raw.email);
  if (!parsed.success) return { errors: { email: 'Adresse email invalide' }, values: raw };
  if (parsed.data === ctx.email.toLowerCase()) return { errors: { email: 'C’est déjà votre adresse actuelle.' }, values: raw };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent('/auth/email-modifie')}` },
  );
  if (error) {
    console.error('change_email', error.code, error.status);
    if (error.code === 'email_exists') return { errors: { email: 'Cette adresse est déjà utilisée par un autre compte.' }, values: raw };
    if (error.code === 'over_email_send_rate_limit') return { message: 'Trop de tentatives en peu de temps. Réessayez dans une heure.', values: raw };
    return { message: 'Le changement n’a pas pu être demandé. Réessayez dans quelques minutes.', values: raw };
  }
  const t = await getT();
  return {
    ok: true,
    message: t('Un email de confirmation a été envoyé à {email} (et peut-être aussi à votre adresse actuelle). Le changement sera fait après avoir cliqué sur le lien ; vous serez alors déconnecté de tous vos appareils.', { email: parsed.data }),
  };
}
