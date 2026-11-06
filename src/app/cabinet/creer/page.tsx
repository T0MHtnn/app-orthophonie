import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { siteUrl } from '@/lib/env';
import { PracticeForm } from './practice-form';

export const metadata: Metadata = { title: 'Créer mon cabinet' };

export default async function CreerCabinetPage() {
  const ctx = await requireUser();
  if (ctx.practice) redirect('/ortho');

  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>Créer mon cabinet</h1>
        <p className="sub">Dernière étape avant d’accéder à votre espace orthophoniste.</p>
        <PracticeForm siteUrl={siteUrl} suggestedName={ctx.profile.full_name ? `Cabinet de ${ctx.profile.full_name}` : ''} />
      </div>
    </main>
  );
}
