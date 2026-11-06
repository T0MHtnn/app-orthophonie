import { z } from 'zod';

/**
 * Variables d'environnement publiques, validées au démarrage.
 * Une valeur manquante fait échouer tout de suite, avec un message clair.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

// Next.js remplace ces accès littéraux au moment du build : ne pas les factoriser.
export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export const siteUrl = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
