import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logout } from '@/app/(auth)/actions';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Mon espace' };

export default async function PatientPage() {
  const ctx = await requireUser();
  if (ctx.profile.role === 'ortho') redirect('/ortho');

  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>Bonjour {ctx.profile.full_name || ctx.email}</h1>
        <p className="sub">Votre espace patient arrive bientôt : vos séances, les documents et les exercices envoyés par votre orthophoniste.</p>
        <p className="hint">
          Vous êtes orthophoniste ? <Link href="/cabinet/creer">Créer votre cabinet</Link>
        </p>
        <form action={logout}>
          <button className="btn" type="submit">
            Se déconnecter
          </button>
        </form>
      </div>
    </main>
  );
}
