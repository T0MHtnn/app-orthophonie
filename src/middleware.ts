import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_IDLE_MINUTES } from '@/lib/defaults';
import { sessionCookieOptions } from '@/lib/supabase/cookies';

/**
 * Exécuté avant chaque page :
 *   1. pose une Content-Security-Policy avec un nonce unique par requête ;
 *   2. rafraîchit la session Supabase (cookies httpOnly) ;
 *   3. renvoie vers la connexion les pages protégées sans session ;
 *   4. déconnecte après 30 min d'inactivité (ortho comme patient).
 * Les contrôles de rôle et de double authentification sont refaits côté
 * serveur dans chaque page (src/lib/auth.ts) et dans la base (RLS).
 */
const PROTECTED = ['/ortho', '/patient', '/compte', '/cabinet', '/mfa'];
const IDLE_COOKIE = 'derniere_activite';

function contentSecurityPolicy(nonce: string): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const dev = process.env.NODE_ENV !== 'production';
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self' ${supabase}${dev ? ' ws:' : ''}`,
    // Tous les formulaires restent sur le site (connexion par compte de l'app uniquement).
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce);

  // Next.js lit le nonce dans l'en-tête CSP de la requête et l'applique à ses scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, ...sessionCookieOptions }));
      },
    },
  });

  // getClaims() vérifie la signature du jeton : ne jamais se fier à getSession() ici.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));

  const redirectTo = (target: string, params: Record<string, string> = {}) => {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = new URLSearchParams(params).toString();
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    redirect.headers.set('Content-Security-Policy', csp);
    return redirect;
  };

  if (isProtected && !claims) {
    return redirectTo('/connexion', { suivant: path });
  }

  // Déconnexion automatique après 30 min d'inactivité, pour tous les comptes (données de santé).
  // L'activité est comptée sur toutes les pages : naviguer ailleurs dans l'app n'est pas de l'inactivité.
  if (claims) {
    const last = Number(request.cookies.get(IDLE_COOKIE)?.value ?? Date.now());
    if (isProtected && Date.now() - last > SESSION_IDLE_MINUTES * 60_000) {
      await supabase.auth.signOut({ scope: 'local' });
      const redirect = redirectTo('/connexion', { raison: 'inactivite' });
      redirect.cookies.delete(IDLE_COOKIE);
      return redirect;
    }
    response.cookies.set(IDLE_COOKIE, String(Date.now()), { ...sessionCookieOptions, maxAge: 60 * 60 * 12 });
  }

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques générés par Next.js.
    { source: '/((?!_next/static|_next/image|favicon.ico|robots.txt).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }] },
  ],
};
