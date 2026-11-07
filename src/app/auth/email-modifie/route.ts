import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { siteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

/**
 * Après le lien de confirmation du changement d'adresse email : déconnexion de
 * TOUS les appareils (les sessions ouvertes avec l'ancienne adresse), puis retour
 * à la connexion avec la nouvelle adresse.
 */
export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'global' });
  (await cookies()).delete('derniere_activite');
  return NextResponse.redirect(`${siteUrl}/connexion?raison=email`);
}
