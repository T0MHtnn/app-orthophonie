import { NextResponse, type NextRequest } from 'next/server';
import { siteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

/** Retour de la connexion Google (flux OAuth PKCE). */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${siteUrl}/`);
  }
  return NextResponse.redirect(`${siteUrl}/connexion?erreur=google`);
}
