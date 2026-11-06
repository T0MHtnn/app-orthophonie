import { NextResponse } from 'next/server';
import { siteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

/** Session sans profil (compte supprimé en partie) : on la ferme et on explique. */
export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  return NextResponse.redirect(`${siteUrl}/connexion?erreur=compte`);
}
