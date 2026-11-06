import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Nouveau mot de passe' };

/**
 * Avec la double authentification activée, Supabase n'accepte un nouveau mot
 * de passe que depuis une session aal2. Le lien « mot de passe oublié » ne
 * connecte qu'en aal1 : on demande donc d'abord le code à 6 chiffres.
 */
export default async function NouveauMotDePassePage() {
  const ctx = await requireUser();
  if (ctx.hasMfa && ctx.aal !== 'aal2') redirect('/mfa/verifier?suivant=%2Fcompte%2Fmot-de-passe');
  return <PasswordForm />;
}
