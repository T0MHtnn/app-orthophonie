import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { Enroll } from './enroll';

export const metadata: Metadata = { title: 'Double authentification' };

export default async function ActiverMfaPage() {
  const ctx = await requireUser();
  if (ctx.hasMfa) redirect(ctx.aal === 'aal2' ? '/ortho' : '/mfa/verifier');

  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>Activer la double authentification</h1>
        <p className="sub">
          Obligatoire pour accéder aux données de vos patients : même si votre mot de passe fuite, personne ne peut se connecter sans votre téléphone.
        </p>
        <Enroll />
      </div>
    </main>
  );
}
