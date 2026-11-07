import { redirect } from 'next/navigation';
import { getAuthContext, getSessionStatus, homeFor } from '@/lib/auth';

export default async function Home() {
  const ctx = await getAuthContext();
  if (ctx) redirect(homeFor(ctx));
  // Visiteur : l'entrée du site est l'annuaire (les familles cherchent un orthophoniste).
  redirect((await getSessionStatus()) === 'orphan' ? '/auth/session-invalide' : '/trouver');
}
