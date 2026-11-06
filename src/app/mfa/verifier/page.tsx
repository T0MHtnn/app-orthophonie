import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { logout } from '@/app/(auth)/actions';
import { requireUser } from '@/lib/auth';
import { safeRedirectPath } from '@/lib/security';
import { VerifyForm } from './verify-form';

export const metadata: Metadata = { title: 'Vérification' };

export default async function VerifierMfaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireUser();
  if (!ctx.hasMfa) redirect('/mfa/activer');
  if (ctx.aal === 'aal2') redirect('/ortho');
  const { suivant } = await searchParams;

  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>Vérification</h1>
        <p className="sub">Ouvrez votre application d’authentification et saisissez le code affiché.</p>
        <VerifyForm next={safeRedirectPath(suivant, '/ortho')} />
        <form action={logout}>
          <button className="linkbtn" type="submit">
            Se déconnecter
          </button>
        </form>
      </div>
    </main>
  );
}
