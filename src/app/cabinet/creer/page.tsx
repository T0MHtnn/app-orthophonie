import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { siteUrl } from '@/lib/env';
import { getT } from '@/lib/i18n';
import { PracticeForm } from './practice-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Créer mon cabinet') };
}

export default async function CreerCabinetPage() {
  const ctx = await requireUser();
  if (ctx.practice) redirect('/ortho');
  const t = await getT();

  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>{t('Créer mon cabinet')}</h1>
        <p className="sub">{t('Dernière étape avant d’accéder à votre espace orthophoniste.')}</p>
        <PracticeForm siteUrl={siteUrl} suggestedName={ctx.profile.full_name ? t('Cabinet de {nom}', { nom: ctx.profile.full_name }) : ''} />
      </div>
    </main>
  );
}
