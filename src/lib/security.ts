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
