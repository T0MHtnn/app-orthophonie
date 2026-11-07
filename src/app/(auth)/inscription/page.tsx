import type { Metadata } from 'next';
import Link from 'next/link';
import { safeRedirectPath } from '@/lib/security';
import { SignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Créer un compte' };

export default async function InscriptionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.suivant, '');
  const fromWaitlist = next.startsWith('/c/');
  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>Créer un compte</h1>
        <p className="sub">
          {fromWaitlist
            ? 'Après avoir confirmé votre adresse email, vous reviendrez directement sur le formulaire de liste d’attente.'
            : params.type === 'ortho'
              ? 'Orthophonistes : créez votre compte, puis votre cabinet, pour recevoir les demandes de liste d’attente.'
              : 'Patients et familles : après avoir confirmé votre email, vous choisirez votre orthophoniste et vous inscrirez sur sa liste d’attente.'}
        </p>
        {/* Depuis « Créer votre cabinet » ou depuis la page d'un cabinet, le type de compte est déjà connu : pas de choix. */}
        <SignupForm
          defaultType={params.type === 'patient' || fromWaitlist ? 'patient' : 'ortho'}
          lockType={params.type === 'ortho' || fromWaitlist}
          next={next}
        />
        <p className="hint">
          Déjà un compte ? <Link href={next ? `/connexion?suivant=${encodeURIComponent(next)}` : '/connexion'}>Se connecter</Link>
        </p>
      </div>
    </main>
  );
}
