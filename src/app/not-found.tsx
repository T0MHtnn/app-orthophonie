import Link from 'next/link';
import { getT } from '@/lib/i18n';

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>{t('Page introuvable')}</h1>
        <p className="sub">{t('Ce lien n’existe pas ou n’est plus disponible.')}</p>
        <Link href="/" className="btn">
          {t('Retour à l’accueil')}
        </Link>
      </div>
    </main>
  );
}
