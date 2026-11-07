import Link from 'next/link';
import { logout } from '@/app/(auth)/actions';
import { APP_NAME } from '@/lib/app';
import type { AuthContext } from '@/lib/auth';
import { getDict } from '@/lib/i18n';
import { SideNav, type NavLink } from './side-nav';

type Nav = Awaited<ReturnType<typeof getDict>>['t']['nav'];

const orthoLinks = (n: Nav): NavLink[] => [
  { href: '/ortho/planning', label: n.planning },
  { href: '/ortho/liste-attente', label: n.waitlist },
  { href: '/ortho/reglages', label: n.settings },
  { href: '/compte', label: n.account },
  // Un ortho peut aussi inscrire ses enfants ou un proche dans un autre cabinet.
  { href: '/patient', label: n.familyRequests },
];

const familyLinks = (n: Nav): NavLink[] => [
  { href: '/patient', label: n.mySpace },
  { href: '/trouver', label: n.find },
  { href: '/compte', label: n.account },
];

/**
 * Cadre commun des espaces connectés (ortho et famille) : bandeau avec nom et
 * déconnexion, menu à gauche. Le contenu et le menu dépendent du rôle.
 */
export async function AppShell({ ctx, children }: { ctx: AuthContext; children: React.ReactNode }) {
  const { t } = await getDict();
  const ortho = ctx.profile.role === 'ortho' && ctx.practice ? ctx.practice : null;
  const title = ortho?.name ?? APP_NAME;
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
              {t.logout}
            </button>
          </form>
        </div>
      </header>
      <div className="wrap shell">
        <SideNav links={ortho ? orthoLinks(t.nav) : familyLinks(t.nav)} />
        <main className="stack">
          {ortho && !ortho.city && (
            <p className="alert warn">
              Renseignez le code postal et la ville de votre cabinet dans les <Link href="/ortho/reglages">Réglages</Link> pour que les familles vous trouvent dans
              l’annuaire.
            </p>
          )}
          {ortho && !ortho.verified && (
            <p className="alert warn">
              Votre cabinet est en cours de vérification (numéro RPPS). Votre page publique de liste d’attente s’ouvrira une fois la vérification faite.
            </p>
          )}
          {children}
        </main>
      </div>
    </>
  );
}
