import { logout } from '@/app/(auth)/actions';
import { requireOrtho } from '@/lib/auth';
import { OrthoNav } from './nav';

/** Espace ortho : chaque page en dessous est protégée (rôle + cabinet + aal2). */
export default async function OrthoLayout({ children }: { children: React.ReactNode }) {
  const { practice, profile } = await requireOrtho();
  const initials = (profile.full_name || practice.name)
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
              <b>{practice.name}</b>
              <div className="hint">{profile.full_name}</div>
            </div>
          </div>
          <form action={logout}>
            <button className="btn" type="submit">
              Se déconnecter
            </button>
          </form>
        </div>
      </header>
      <div className="wrap shell">
        <OrthoNav />
        <main className="stack">
          {!practice.verified && (
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
