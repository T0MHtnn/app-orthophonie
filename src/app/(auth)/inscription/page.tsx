import type { Metadata } from 'next';
import Link from 'next/link';
import { SignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Créer un compte' };

export default function InscriptionPage() {
  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>Créer un compte</h1>
        <p className="sub">Nouveau patient ? Inscrivez-vous plutôt sur la liste d’attente de votre orthophoniste, via le lien qu’il vous a donné.</p>
        <SignupForm />
        <p className="hint">
          Déjà un compte ? <Link href="/connexion">Se connecter</Link>
        </p>
      </div>
    </main>
  );
}
