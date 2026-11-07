import Link from 'next/link';
import { logout } from '@/app/(auth)/actions';
import { APP_NAME } from '@/lib/app';
import type { AuthContext } from '@/lib/auth';
import { getT, type T } from '@/lib/i18n';
import { ClearFlash } from './clear-flash';
import { SideNav, type NavLink } from './side-nav';

const orthoLinks = (t: T): NavLink[] => [
  { href: '/ortho/planning', label: t('Planning') },
  { href: '/ortho/patients', label: t('Patients') },
  { href: '/ortho/liste-attente', label: t('Liste d’attente') },
  // Un ortho peut aussi inscrire ses enfants ou un proche dans un autre cabinet.
  { href: '/patient', label: t('Mes demandes (famille)') },
  // Toujours en dernier ; « Mon compte » est une partie des réglages.
  { href: '/ortho/reglages', label: t('Réglages'), also: ['/compte'] },
];

const familyLinks = (t: T): NavLink[] => [
  { href: '/patient', label: t('Mon espace'), also: ['/trouver'] },
  { href: '/compte', label: t('Réglages') },
];

/**
 * Cadre commun des espaces connectés (ortho et famille) : bandeau avec nom et
 * déconnexion, menu à gauche. Le contenu et le menu dépendent du rôle.
 */
export async function AppShell({ ctx, children }: { ctx: AuthContext; children: React.ReactNode }) {
  const t = await getT();
  const ortho = ctx.profile.role === 'ortho' && ctx.practice ? ctx.practice : null;
  const title = ortho?.name ?? t(APP_NAME);
  const subtitle = ctx.profile.full_name || ctx.email;
  const initials = (ctx.profile.full_name || title)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <div className="brand">
            <div className="logo" aria-hidden="true">
              {initials}
            </div>
            <div>
              <b>{title}</b>
              <div className="hint">{subtitle}</div>
            </div>
          </div>
          <form action={logout}>
            <button className="btn" type="submit">
              {t('Se déconnecter')}
            </button>
          </form>
        </div>
      </header>
      <div className="wrap shell">
        <SideNav links={ortho ? orthoLinks(t) : familyLinks(t)} label={t('Sections')} />
        <main className="stack">
          <ClearFlash />
          {ortho && !ortho.city && (
            <p className="alert warn">
              {t('Renseignez le code postal et la ville de votre cabinet dans les')} <Link href="/ortho/reglages">{t('Réglages')}</Link>{' '}
              {t('pour que les patients vous trouvent dans l’annuaire.')}
            </p>
          )}
          {ortho && !ortho.verified && (
            <p className="alert warn">
              {t('Votre cabinet est en cours de vérification (numéro RPPS). Votre page publique de liste d’attente s’ouvrira une fois la vérification faite.')}
            </p>
          )}
          {children}
        </main>
      </div>
    </>
  );
}
