'use server';

import { redirect } from 'next/navigation';
import type { FormState } from '@/components/form';
import { requireUser } from '@/lib/auth';
import { safeRedirectPath } from '@/lib/security';
import { createClient } from '@/lib/supabase/server';
import { totpCodeSchema } from '@/lib/validation';

export interface EnrollState extends FormState {
  factorId?: string;
  qr?: string;
  secret?: string;
}

/** Démarre l'ajout d'une application d'authentification (TOTP). */
export async function startEnrollment(): Promise<EnrollState> {
  await requireUser();
  const supabase = await createClient();

  // Nettoie un éventuel essai précédent non terminé.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Application ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { message: 'Impossible de démarrer l’activation. Réessayez.' };
  const qr = data.totp.qr_code.startsWith('data:') ? data.totp.qr_code : `data:image/svg+xml;utf8,${encodeURIComponent(data.totp.qr_code)}`;
  return { factorId: data.id, qr, secret: data.totp.secret };
}

/** Vérifie le premier code : la session passe en double authentification (aal2). */
export async function confirmEnrollment(prev: EnrollState, formData: FormData): Promise<EnrollState> {
  await requireUser();
  const code = totpCodeSchema.safeParse(formData.get('code'));
  if (!code.success || !prev.factorId) return { ...prev, errors: { code: 'Saisissez le code à 6 chiffres affiché par l’application.' } };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: prev.factorId, code: code.data });
  if (error) return { ...prev, errors: { code: 'Code incorrect ou expiré. Réessayez avec le code suivant.' } };
  redirect('/ortho');
}

/** Connexion : demande le code de l'application d'authentification. */
export async function verifyMfa(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const code = totpCodeSchema.safeParse(formData.get('code'));
  if (!code.success) return { errors: { code: 'Code à 6 chiffres' } };

  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp?.[0];
  if (!factor) redirect('/mfa/activer');

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.data });
  if (error) return { errors: { code: 'Code incorrect ou expiré.' } };
  redirect(safeRedirectPath(formData.get('suivant'), '/ortho'));
}
