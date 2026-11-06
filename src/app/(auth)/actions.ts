'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/form';
import { siteUrl } from '@/lib/env';
import { safeRedirectPath } from '@/lib/security';
import { createClient } from '@/lib/supabase/server';
import { emailSchema, fieldErrors, loginSchema, passwordSchema, signupSchema } from '@/lib/validation';

const values = (formData: FormData, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? '')]));

/** Connexion email + mot de passe. Message volontairement vague : on ne révèle pas si le compte existe. */
export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(values(formData, ['email', 'password']));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: { email: String(formData.get('email') ?? '') } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const unconfirmed = error.code === 'email_not_confirmed';
    return {
      message: unconfirmed ? 'Confirmez d’abord votre adresse email (lien reçu à l’inscription).' : 'Email ou mot de passe incorrect.',
      values: { email: parsed.data.email },
    };
  }
  redirect(safeRedirectPath(formData.get('suivant'), '/'));
}

export async function loginWithGoogle(): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });
  if (error || !data.url) redirect('/connexion?erreur=google');
  redirect(data.url);
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = values(formData, ['fullName', 'email', 'password', 'accountType', 'suivant']);
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: { ...raw, password: '' } };

  const { fullName, email, password, accountType } = parsed.data;
  const next = accountType === 'ortho' ? '/cabinet/creer' : safeRedirectPath(formData.get('suivant'), '/patient');
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Seul le nom est transmis : le rôle n'est jamais pris dans ces métadonnées côté base.
      data: { full_name: fullName },
      emailRedirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error && error.code === 'weak_password') return { errors: { password: 'Mot de passe trop faible ou déjà apparu dans une fuite de données.' }, values: { ...raw, password: '' } };
  if (error && error.code !== 'user_already_exists') return { message: 'Inscription impossible pour le moment. Réessayez dans quelques minutes.', values: { ...raw, password: '' } };

  // Même réponse que le compte existe ou non (pas d'énumération des comptes).
  return { ok: true, message: `Si l’adresse ${email} est valide, vous allez recevoir un email pour confirmer votre compte.` };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) return { errors: { email: 'Adresse email invalide' } };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent('/compte/mot-de-passe')}`,
  });
  return { ok: true, message: 'Si un compte existe pour cette adresse, un email de réinitialisation vient d’être envoyé.' };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get('password') ?? '');
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { errors: { password: parsed.error.issues[0]?.message ?? 'Mot de passe invalide' } };
  if (password !== formData.get('confirm')) return { errors: { confirm: 'Les deux mots de passe sont différents' } };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { message: error.code === 'weak_password' ? 'Mot de passe trop faible.' : 'Modification impossible. Reconnectez-vous puis réessayez.' };
  return { ok: true, message: 'Mot de passe modifié.' };
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete('derniere_activite');
  redirect('/connexion');
}
