import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>Page introuvable</h1>
        <p className="sub">Ce lien n’existe pas ou n’est plus disponible.</p>
        <Link href="/" className="btn">Retour à l’accueil</Link>
      </div>
    </main>
  );
}
