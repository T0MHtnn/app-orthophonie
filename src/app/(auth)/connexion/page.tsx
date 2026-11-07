import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext, getSessionStatus, homeFor } from '@/lib/auth';
import { safeRedirectPath } from '@/lib/security';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Connexion' };

const NOTICES: Record<string, { kind: 'warn' | 'error' | 'ok'; text: string }> = {
  inactivite: { kind: 'warn', text: 'Vous avez été déconnecté après 30 minutes d’inactivité.' },
  google: { kind: 'error', text: 'La connexion avec Google a échoué. Réessayez.' },
  lien: { kind: 'error', text: 'Ce lien n’est plus valide. Demandez-en un nouveau.' },
  compte: { kind: 'error', text: 'Ce compte n’est plus valide : il a été supprimé ou est incomplet. Créez un nouveau compte, ou contactez le support si le problème continue.' },
};

export default async function ConnexionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const ctx = await getAuthContext();
  if (ctx) redirect(homeFor(ctx));
  if ((await getSessionStatus()) === 'orphan') redirect('/auth/session-invalide');
  const notice = NOTICES[params.raison ?? params.erreur ?? ''];

  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>Connexion</h1>
        {notice && <p className={`alert ${notice.kind}`}>{notice.text}</p>}
        <LoginForm next={safeRedirectPath(params.suivant, '/')} />
        <p className="hint">
          Pas encore de compte ?{' '}
          <Link href={params.suivant ? `/inscription?suivant=${encodeURIComponent(safeRedirectPath(params.suivant, '/'))}` : '/inscription'}>Créer un compte</Link>
        </p>
        <p className="hint">
          Vous cherchez un orthophoniste ? <Link href="/trouver">Trouver un cabinet près de chez vous</Link>
        </p>
      </div>
    </main>
  );
}
