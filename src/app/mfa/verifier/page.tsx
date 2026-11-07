import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { logout } from '@/app/(auth)/actions';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { safeRedirectPath } from '@/lib/security';
import { VerifyForm } from './verify-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Vérification') };
}

export default async function VerifierMfaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireUser();
  if (!ctx.hasMfa) redirect('/mfa/activer');
  const { suivant } = await searchParams;
  const next = safeRedirectPath(suivant, '/ortho');
  if (ctx.aal === 'aal2') redirect(next);
  const t = await getT();

  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>{t('Vérification')}</h1>
        <p className="sub">{t('Ouvrez votre application d’authentification et saisissez le code affiché.')}</p>
        <VerifyForm next={next} />
        <form action={logout}>
          <button className="linkbtn" type="submit">
            {t('Se déconnecter')}
          </button>
        </form>
      </div>
    </main>
  );
}
