import { redirect } from 'next/navigation';
import { getAuthContext, homeFor } from '@/lib/auth';

export default async function Home() {
  const ctx = await getAuthContext();
  redirect(ctx ? homeFor(ctx) : '/connexion');
}
