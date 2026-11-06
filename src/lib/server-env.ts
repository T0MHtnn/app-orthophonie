import 'server-only';
import { z } from 'zod';

/** Secrets serveur. `server-only` fait échouer le build si ce fichier est importé côté navigateur. */
const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
  IP_HASH_SECRET: z.string().min(32, 'IP_HASH_SECRET doit faire au moins 32 caractères'),
});

let cached: z.infer<typeof serverSchema> | undefined;

export function serverEnv() {
  cached ??= serverSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    IP_HASH_SECRET: process.env.IP_HASH_SECRET,
  });
  return cached;
}
