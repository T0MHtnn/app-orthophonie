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
            : 'Patients et familles : votre compte vous permet de vous inscrire sur la liste d’attente et de suivre votre demande.'}
        </p>
        <SignupForm defaultType={params.type === 'patient' || fromWaitlist ? 'patient' : 'ortho'} next={next} />
        <p className="hint">
          Déjà un compte ? <Link href={next ? `/connexion?suivant=${encodeURIComponent(next)}` : '/connexion'}>Se connecter</Link>
        </p>
      </div>
    </main>
  );
}
