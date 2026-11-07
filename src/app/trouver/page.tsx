import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { getAuthContext } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Trouver un orthophoniste') };
}

/**
 * Annuaire public : cabinets vérifiés, liste d'attente ouverte, présents dans
 * l'annuaire. La famille choisit un cabinet puis s'inscrit sur sa liste d'attente.
 */
export default async function TrouverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = ((await searchParams).q ?? '').trim().slice(0, 80);
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data, error } = query ? await supabase.rpc('search_practices', { p_query: query }) : { data: null, error: null };
  if (error) console.error('search_practices', error.code);
  const results = data ?? [];
  const t = await getT();

  const content = (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Trouver un orthophoniste')}</h1>
          <p className="sub">{t('Cherchez un cabinet près de chez vous, puis inscrivez-vous sur sa liste d’attente.')}</p>
        </div>
      </div>

      <form className="card row" method="get" role="search">
        <input
          type="search"
          name="q"
          className="field-inline search-big"
          placeholder={t('Ville, code postal ou nom du cabinet')}
          aria-label={t('Ville, code postal ou nom du cabinet')}
          defaultValue={query}
          maxLength={80}
          autoFocus
        />
        <button className="btn primary" type="submit">
          {t('Rechercher')}
        </button>
      </form>

      {error && <p className="alert error">{t('La recherche est indisponible pour le moment. Réessayez dans quelques minutes.')}</p>}
      {query && !error && results.length === 0 && (
        <p className="hint">{t('Aucun cabinet avec une liste d’attente ouverte ne correspond à « {query} ». Essayez une ville voisine ou le code postal.', { query })}</p>
      )}

      {results.length > 0 && (
        <section className="card">
          <h2>
            {t(results.length > 1 ? '{n} cabinets' : '{n} cabinet', { n: results.length })}
          </h2>
          {results.map((p) => (
            <div key={p.slug} className="request">
              <div>
                <b>{p.name}</b>
                {p.ortho_name && <div className="hint">{p.ortho_name}</div>}
                <div className="hint">{[p.address_line, `${p.postal_code} ${p.city}`].filter(Boolean).join(', ')}</div>
              </div>
              <Link className="btn primary small" href={`/c/${p.slug}`}>
                {t('S’inscrire sur la liste d’attente')}
              </Link>
            </div>
          ))}
        </section>
      )}

      {!ctx && (
        <section className="card stack">
          <p className="hint">
            {t('Déjà inscrit ?')} <Link href="/connexion">{t('Se connecter')}</Link> {t('pour suivre vos demandes.')}
          </p>
          <p className="hint">
            {t('Vous êtes orthophoniste ?')} <Link href="/inscription?type=ortho">{t('Créer votre cabinet')}</Link> {t('pour recevoir les demandes de liste d’attente.')}
          </p>
        </section>
      )}
    </>
  );

  // Connecté : même cadre que l'espace famille. Sinon : page publique simple.
  if (ctx) return <AppShell ctx={ctx}>{content}</AppShell>;
  return <main className="wrap public-page">{content}</main>;
}
