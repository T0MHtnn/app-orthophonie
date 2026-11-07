import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmitButton } from '@/components/form';
import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { formatInstant } from '@/lib/time';
import { acceptOffer } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Une séance s’est libérée') };
}

const DONE: Record<string, [string, string]> = {
  ok: ['Séance réservée', 'C’est noté : la séance est à vous. Vous la retrouvez dans votre espace.'],
  pris: ['Créneau déjà pris', 'Un autre patient a choisi ce créneau juste avant vous. Vous recevrez peut-être une autre proposition.'],
  expire: ['Créneau plus disponible', 'Ce créneau n’est plus disponible. Retrouvez vos prochaines séances dans votre espace.'],
  invalide: ['Lien invalide', 'Ce lien n’existe pas ou n’est plus valable.'],
};

/**
 * Proposition d'un créneau libéré (lien reçu par email). Si le créneau n'est plus
 * disponible (déjà pris, bloqué ou occupé par l'ortho), on le dit et on renvoie vers l'espace.
 */
export default async function CreneauPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const { resultat } = await searchParams;
  const t = await getT();
  const supabase = await createClient();
  const { data } = /^[0-9a-f]{64}$/.test(token) ? await supabase.rpc('slot_offer_info', { p_token: token }) : { data: null };
  const info = data?.[0];
  const state = resultat ?? info?.state ?? 'invalide';

  if (resultat || state !== 'ok' || !info?.starts_at) {
    const [title, text] = DONE[state] ?? DONE.invalide!;
    return (
      <main className="wrap auth-page">
        <div className="card auth-card">
          <h1>{t(title)}</h1>
          <p className="sub">{t(text)}</p>
          <Link href="/patient" className="btn primary">
            {t('Voir mon espace')}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap auth-page">
      <div className="card auth-card">
        <h1>{t('Une séance s’est libérée')}</h1>
        <p>
          <b style={{ textTransform: 'capitalize' }}>{formatInstant(info.starts_at, t.locale)}</b>
          <br />
          {t('{cabinet} · pour {prenom}', { cabinet: info.practice_name ?? '', prenom: info.patient_first_name ?? '' })}
        </p>
        {info.moves_from && (
          <p className="alert info">{t('Votre séance du {date} sera avancée à ce créneau.', { date: formatInstant(info.moves_from, t.locale) })}</p>
        )}
        <p className="hint">{t('Le créneau est proposé à plusieurs patients : le premier qui le choisit l’obtient.')}</p>
        <form action={acceptOffer}>
          <input type="hidden" name="token" value={token} />
          <SubmitButton pendingText="Réservation…">Je prends ce créneau</SubmitButton>
        </form>
        <Link href="/patient" className="hint">
          {t('Non merci, retour à mon espace')}
        </Link>
      </div>
    </main>
  );
}
