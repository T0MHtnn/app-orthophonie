import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
// Polices installées via npm et servies par le site lui-même :
// aucune requête vers Google, ni au build ni depuis le navigateur des patients.
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/bricolage-grotesque/500.css';
import '@fontsource/bricolage-grotesque/700.css';
import './globals.css';
import { I18nProvider } from '@/components/i18n-provider';
import { APP_NAME } from '@/lib/app';
import { getT } from '@/lib/i18n';
import { LANG_COOKIE, THEME_COOKIE, isLang, isTheme } from '@/lib/preferences';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { default: t(APP_NAME), template: `%s · ${t(APP_NAME)}` },
    description: t('Gestion du cabinet d’orthophonie : liste d’attente, rendez-vous, dossiers.'),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lire les en-têtes rend toutes les pages dynamiques : indispensable pour que
  // Next.js applique le nonce de la CSP à ses scripts (une page statique n'en a pas).
  await headers();
  // Langue et thème choisis dans « Mon compte » (cookie de l'appareil).
  const jar = await cookies();
  const lang = jar.get(LANG_COOKIE)?.value;
  const theme = jar.get(THEME_COOKIE)?.value;
  return (
    <html lang={isLang(lang) ? lang : 'fr'} data-theme={isTheme(theme) ? theme : 'system'}>
      <body>
        <I18nProvider lang={isLang(lang) ? lang : 'fr'}>{children}</I18nProvider>
      </body>
    </html>
  );
}
