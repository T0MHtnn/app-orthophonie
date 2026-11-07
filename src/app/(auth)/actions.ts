'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/form';
import { siteUrl } from '@/lib/env';
import { safeRedirectPath } from '@/lib/security';
import { createClient } from '@/lib/supabase/server';
import { emailSchema, fieldErrors, loginSchema, passwordSchema, signupSchema } from '@/lib/validation';

/** Messages clairs pour les erreurs Supabase Auth les plus courantes. */
function authErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'email_not_confirmed':
      return 'Confirmez d’abord votre adresse email (lien reçu à l’inscription).';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Trop de tentatives en peu de temps. Réessayez dans une heure.';
    case 'email_address_invalid':
      return 'Cette adresse email n’est pas acceptée. Utilisez une autre adresse.';
    case 'signup_disabled':
      return 'Les inscriptions sont fermées pour le moment.';
    case 'unexpected_failure':
      return 'L’email de confirmation n’a pas pu être envoyé. Réessayez dans quelques minutes.';
    case 'same_password':
      return 'Le nouveau mot de passe doit être différent de l’ancien.';
    case 'weak_password':
      return 'Mot de passe trop faible ou déjà apparu dans une fuite de données.';
    case 'insufficient_aal':
      return 'Pour des raisons de sécurité, saisissez d’abord le code de votre application d’authentification.';
    case 'reauthentication_needed':
      return 'Pour des raisons de sécurité, reconnectez-vous puis réessayez.';
    case 'session_expired':
    case 'session_not_found':
      return 'Votre session a expiré. Reconnectez-vous puis réessayez.';
    default:
      return fallback;
  }
}

const values = (formData: FormData, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? '')]));

/** Connexion email + mot de passe. Message volontairement vague : on ne révèle pas si le compte existe. */
export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(values(formData, ['email', 'password']));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: { email: String(formData.get('email') ?? '') } };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Code d'erreur seulement : jamais l'email ni le mot de passe dans les logs.
    if (error.code !== 'invalid_credentials') console.error('login', error.code);
    return { message: authErrorMessage(error.code, 'Email ou mot de passe incorrect.'), values: { email: parsed.data.email } };
  }
  // Compte supprimé en partie (profil absent) : on refuse proprement au lieu de boucler.
  const { data: profile } = await supabase.from('profiles').select('id').eq('id', data.user.id).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut({ scope: 'local' });
    return { message: 'Ce compte n’est plus valide : il a été supprimé ou est incomplet. Créez un nouveau compte.', values: { email: parsed.data.email } };
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
  const raw = values(formData, ['firstName', 'lastName', 'email', 'password', 'accountType', 'suivant']);
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: { ...raw, password: '' } };

  const { firstName, lastName, email, password, accountType } = parsed.data;
  // Famille sans lien de cabinet : on l'envoie sur l'annuaire pour choisir son orthophoniste.
  const next = accountType === 'ortho' ? '/cabinet/creer' : safeRedirectPath(formData.get('suivant'), '/trouver');
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Seuls prénom et nom sont transmis : le rôle n'est jamais pris dans ces métadonnées côté base.
      data: { first_name: firstName, last_name: lastName },
      emailRedirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error && error.code === 'weak_password') return { errors: { password: 'Mot de passe trop faible ou déjà apparu dans une fuite de données.' }, values: { ...raw, password: '' } };
  if (error && error.code !== 'user_already_exists') {
    console.error('signup', error.code, error.status);
    return { message: authErrorMessage(error.code, 'Inscription impossible pour le moment. Réessayez dans quelques minutes.'), values: { ...raw, password: '' } };
  }

  // Même réponse que le compte existe ou non (pas d'énumération des comptes).
  return { ok: true, message: `Si l’adresse ${email} est valide, vous allez recevoir un email pour confirmer votre compte.` };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) return { errors: { email: 'Adresse email invalide' } };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent('/compte/mot-de-passe')}`,
  });
  // Code seulement (ex. SMTP en panne) ; la réponse reste identique pour ne pas révéler si le compte existe.
  if (error) console.error('password_reset', error.code, error.status);
  return { ok: true, message: 'Si un compte existe pour cette adresse, un email de réinitialisation vient d’être envoyé.' };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get('password') ?? '');
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { errors: { password: parsed.error.issues[0]?.message ?? 'Mot de passe invalide' } };
  if (password !== formData.get('confirm')) return { errors: { confirm: 'Les deux mots de passe sont différents' } };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    console.error('update_password', error.code, error.status);
    return { message: authErrorMessage(error.code, 'Modification impossible. Reconnectez-vous puis réessayez.') };
  }
  return { ok: true, message: 'Mot de passe modifié.' };
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete('derniere_activite');
  redirect('/connexion');
}
