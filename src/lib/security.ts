import { createHmac } from 'node:crypto';

/**
 * Accepte seulement un chemin interne (« /ortho/... »), jamais une autre origine.
 * Empêche les redirections ouvertes du type ?suivant=https://site-pirate.fr
 */
export function safeRedirectPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

/**
 * Adresse IP du client. Sur Vercel, `x-forwarded-for` est réécrit par la
 * plateforme : sa première valeur est fiable. Ailleurs, adapter à son proxy.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip') || 'unknown';
}

/** Empreinte non réversible de l'IP : on limite le débit sans stocker d'adresse. */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('base64url');
}
