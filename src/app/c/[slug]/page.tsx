import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InfoText } from '@/components/info-text';
import { DEFAULT_WAITLIST_INFO } from '@/lib/defaults';
import { createClient } from '@/lib/supabase/server';
import { WaitlistForm } from './waitlist-form';

export const metadata: Metadata = { title: 'Liste d’attente' };

/** Page publique d'un cabinet vérifié : texte d'information puis formulaire. */
export default async function PublicWaitlistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound();

  const supabase = await createClient();
  const [{ data: practices }, { data: pathologies }] = await Promise.all([
    supabase.rpc('get_public_practice', { p_slug: slug }),
    supabase.from('pathologies').select('code, label').order('sort_order'),
  ]);
  const practice = practices?.[0];
  if (!practice) notFound();

  return (
    <main className="wrap public-page">
      <p className="sub">{practice.name}</p>
      {practice.waitlist_open ? (
        <div className="card stack">
          <InfoText source={practice.waitlist_info || DEFAULT_WAITLIST_INFO} />
          <WaitlistForm slug={slug} practiceName={practice.name} pathologies={pathologies ?? []} />
        </div>
      ) : (
        <div className="card">
          <h1>Inscriptions fermées</h1>
          <p className="sub">Le cabinet n’accepte pas de nouvelles inscriptions pour le moment. Revenez plus tard.</p>
        </div>
      )}
    </main>
  );
}
