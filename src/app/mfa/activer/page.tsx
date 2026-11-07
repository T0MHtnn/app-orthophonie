import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { logout } from '@/app/(auth)/actions';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { Enroll } from './enroll';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Double authentification') };
}

export default async function ActiverMfaPage() {
  const ctx = await requireUser();
  if (ctx.hasMfa) redirect(ctx.aal === 'aal2' ? '/ortho' : '/mfa/verifier');
  const t = await getT();

  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>{t('Activer la double authentification')}</h1>
        <p className="sub">
          {t('Obligatoire pour accéder aux données de vos patients : même si votre mot de passe fuite, personne ne peut se connecter sans votre téléphone.')}
        </p>
        <Enroll />
        <form action={logout}>
          <button className="linkbtn" type="submit">
            {t('Se déconnecter')}
          </button>
        </form>
      </div>
    </main>
  );
}
