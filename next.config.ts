import type { NextConfig } from 'next';

/**
 * En-têtes de sécurité appliqués à toutes les réponses.
 * La Content-Security-Policy, qui a besoin d'un nonce par requête, est posée
 * dans src/middleware.ts.
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Dépôt de documents (4 Mo max, voir lib/documents.ts) : la limite par défaut des Server Actions est 1 Mo.
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Les pages connectées ne doivent jamais être mises en cache (données de santé).
      { source: '/(ortho|patient|compte|cabinet|mfa)/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default config;
