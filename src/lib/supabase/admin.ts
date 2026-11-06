import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';
import { serverEnv } from '@/lib/server-env';
import type { Database } from '@/lib/database.types';

/**
 * Client avec la clé secrète : contourne la RLS. Réservé à un seul usage :
 * appeler submit_waitlist_entry() depuis le formulaire public, après validation.
 * Ne jamais l'utiliser pour lire des données à afficher.
 */
export function createAdminClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
