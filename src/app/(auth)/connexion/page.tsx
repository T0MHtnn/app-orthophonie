import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext, homeFor } from '@/lib/auth';
import { safeRedirectPath } from '@/lib/security';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Connexion' };

const NOTICES: Record<string, { kind: 'warn' | 'error' | 'ok'; text: string }> = {
  inactivite: { kind: 'warn', text: 'Vous avez été déconnecté après 30 minutes d’inactivité, pour protéger les données de vos patients.' },
  google: { kind: 'error', text: 'La connexion avec Google a échoué. Réessayez.' },
  lien: { kind: 'error', text: 'Ce lien n’est plus valide. Demandez-en un nouveau.' },
};

export default async function ConnexionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const ctx = await getAuthContext();
  if (ctx) redirect(homeFor(ctx));
  const notice = NOTICES[params.raison ?? params.erreur ?? ''];

  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>Connexion</h1>
        {notice && <p className={`alert ${notice.kind}`}>{notice.text}</p>}
        <LoginForm next={safeRedirectPath(params.suivant, '/')} />
        <p className="hint">
          Pas encore de compte ? <Link href="/inscription">Créer un compte</Link>
        </p>
      </div>
    </main>
  );
}
