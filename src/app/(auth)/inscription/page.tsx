import type { Metadata } from 'next';
import Link from 'next/link';
import { BackButton } from '@/components/back-button';
import { getT } from '@/lib/i18n';
import { safeRedirectPath } from '@/lib/security';
import { SignupForm } from './signup-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Créer un compte') };
}

export default async function InscriptionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.suivant, '');
  const fromWaitlist = next.startsWith('/c/');
  const t = await getT();
  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <BackButton fallback={'/trouver'} />
        <h1>{t('Créer un compte')}</h1>
        <p className="sub">
          {t(
            fromWaitlist
            ? 'Après avoir confirmé votre adresse email, vous reviendrez directement sur le formulaire de liste d’attente.'
            : params.type === 'ortho'
              ? 'Orthophonistes : créez votre compte, puis votre cabinet, pour recevoir les demandes de liste d’attente.'
              : 'Patients et familles : après avoir confirmé votre email, vous choisirez votre orthophoniste et vous inscrirez sur sa liste d’attente.',
          )}
        </p>
        {/* Depuis « Créer votre cabinet » ou depuis la page d'un cabinet, le type de compte est déjà connu : pas de choix. */}
        <SignupForm
          defaultType={params.type === 'patient' || fromWaitlist ? 'patient' : 'ortho'}
          lockType={params.type === 'ortho' || fromWaitlist}
          next={next}
        />
        <p className="hint">
          {t('Déjà un compte ?')} <Link href={next ? `/connexion?suivant=${encodeURIComponent(next)}` : '/connexion'}>{t('Se connecter')}</Link>
        </p>
      </div>
    </main>
  );
}
