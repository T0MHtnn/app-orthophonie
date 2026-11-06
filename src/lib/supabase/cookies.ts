import type { CookieOptions } from '@supabase/ssr';

/**
 * Les jetons de session sont dans des cookies httpOnly : un script injecté
 * (XSS) ne peut pas les lire. C'est possible parce que l'app n'utilise JAMAIS
 * le client Supabase côté navigateur : tout passe par le serveur.
 */
export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};
