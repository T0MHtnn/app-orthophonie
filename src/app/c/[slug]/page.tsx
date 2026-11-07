import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { logout } from '@/app/(auth)/actions';
import { InfoText } from '@/components/info-text';
import { getAuthContext } from '@/lib/auth';
import { DEFAULT_WAITLIST_INFO } from '@/lib/defaults';
import { createClient } from '@/lib/supabase/server';
import { WaitlistForm } from './waitlist-form';

export const metadata: Metadata = { title: 'Liste d’attente' };

/**
 * Page publique d'un cabinet vérifié : texte d'information, puis
 * - connecté : formulaire d'inscription ;
 * - non connecté : créer un compte ou se connecter (pour pouvoir suivre sa demande ensuite).
 */
export default async function PublicWaitlistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound();

  const supabase = await createClient();
  const [{ data: practices }, { data: pathologies }, ctx] = await Promise.all([
    supabase.rpc('get_public_practice', { p_slug: slug }),
    supabase.from('pathologies').select('code, label').order('sort_order'),
    getAuthContext(),
  ]);
  const practice = practices?.[0];
  if (!practice) notFound();

  const back = encodeURIComponent(`/c/${slug}`);

  return (
    <main className="wrap public-page">
      <div>
        <p className="sub">
          <b>{practice.name}</b>
        </p>
        {practice.city && <p className="hint">{[practice.address_line, `${practice.postal_code ?? ''} ${practice.city}`.trim()].filter(Boolean).join(', ')}</p>}
      </div>
      {!practice.waitlist_open ? (
        <div className="card">
          <h1>Inscriptions fermées</h1>
          <p className="sub">Le cabinet n’accepte pas de nouvelles inscriptions pour le moment. Revenez plus tard.</p>
        </div>
      ) : (
        <div className="card stack">
          <InfoText source={practice.waitlist_info || DEFAULT_WAITLIST_INFO} />
          {ctx?.practice?.slug === slug ? (
            <div className="alert warn stack">
              <p>C’est votre propre cabinet : vous ne pouvez pas vous inscrire sur votre liste d’attente. Pour tester, utilisez un compte famille.</p>
              <div className="row">
                <form action={logout}>
                  <input type="hidden" name="suivant" value={`/c/${slug}`} />
                  <button className="btn small" type="submit">
                    Me déconnecter et utiliser un compte famille
                  </button>
                </form>
                <Link className="btn small" href="/ortho">
                  Retour à mon espace orthophoniste
                </Link>
              </div>
            </div>
          ) : ctx ? (
            <>
              <p className="hint">
                Connecté en tant que <b>{ctx.email}</b>. Vous pourrez suivre votre demande depuis <Link href="/patient">votre espace</Link>.
              </p>
              <WaitlistForm slug={slug} practiceName={practice.name} accountEmail={ctx.email} pathologies={pathologies ?? []} />
            </>
          ) : (
            <div className="card stack login-cta">
              <h2>Pour vous inscrire, connectez-vous</h2>
              <p className="sub">Un compte vous permet de suivre votre demande et d’être prévenu quand une place se libère.</p>
              <div className="row">
                <Link className="btn primary" href={`/inscription?type=patient&suivant=${back}`}>
                  Créer mon compte
                </Link>
                <Link className="btn" href={`/connexion?suivant=${back}`}>
                  J’ai déjà un compte
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
