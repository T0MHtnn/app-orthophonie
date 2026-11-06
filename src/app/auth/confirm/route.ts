import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { siteUrl } from '@/lib/env';
import { safeRedirectPath } from '@/lib/security';
import { createClient } from '@/lib/supabase/server';

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'email_change', 'magiclink'];

/**
 * Lien reçu par email (confirmation d'inscription, mot de passe oublié).
 * Accepte le format token_hash (recommandé, fonctionne même dans un autre
 * navigateur) et le format code (PKCE).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeRedirectPath(params.get('next'), '/');
  const supabase = await createClient();

  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  const code = params.get('code');

  let ok = false;
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  // Toujours rediriger vers NOTRE site, jamais vers l'hôte de la requête.
  return NextResponse.redirect(ok ? `${siteUrl}${next}` : `${siteUrl}/connexion?erreur=lien`);
}
