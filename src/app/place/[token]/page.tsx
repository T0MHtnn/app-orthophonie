import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmitButton } from '@/components/form';
import { freeSlots } from '@/lib/agenda';
import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { addDays, formatDay, formatTime, isDate, parisParts, parisToInstant, startOfWeek } from '@/lib/time';
import { bookFromLink } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Choisir mon premier rendez-vous') };
}

const ERRORS: Record<string, string> = {
  pris: 'Ce créneau vient d’être pris. Choisissez-en un autre.',
  horaire: 'Ce créneau n’est pas réservable. Choisissez-en un autre.',
  invalide: 'Créneau invalide. Réessayez.',
  autre: 'La réservation n’a pas pu être enregistrée. Réessayez.',
};

const DONE: Record<string, [string, string]> = {
  reserve: ['Rendez-vous confirmé', 'Votre premier rendez-vous est enregistré. Vous le retrouvez dans votre espace, avec vos prochaines séances.'],
  utilise: ['Lien déjà utilisé', 'Ce lien a déjà servi à choisir un rendez-vous. Retrouvez vos séances dans votre espace.'],
  expire: ['Lien expiré', 'Ce lien n’est plus valable (72 h). Contactez le cabinet pour une nouvelle proposition.'],
  invalide: ['Lien invalide', 'Ce lien n’existe pas ou n’est plus valable.'],
};

/**
 * Lien personnel « place libérée » (usage unique, 72 h) : la famille choisit son
 * 1er rendez-vous parmi les créneaux libres du cabinet. Pas besoin d'être connecté :
 * le lien sert d'autorisation pour ce seul rendez-vous.
 */
export default async function PlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const t = await getT();
  const L = t.locale;
  const supabase = await createClient();
  const { data } = /^[0-9a-f]{64}$/.test(token) ? await supabase.rpc('place_link_info', { p_token: token }) : { data: null };
  const info = data?.[0];
  const state = query.resultat === 'ok' ? 'reserve' : query.erreur === 'utilise' || query.erreur === 'expire' ? query.erreur : (info?.state ?? 'invalide');

  if (state !== 'ok' || !info) {
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

  const now = new Date();
  const today = parisParts(now).date;
  const week = startOfWeek(isDate(query.semaine) && query.semaine >= today ? query.semaine : today);
  const { data: busy, error } = await supabase.rpc('place_busy', {
    p_token: token,
    p_from: parisToInstant(week, '00:00').toISOString(),
    p_to: parisToInstant(addDays(week, 7), '00:00').toISOString(),
  });
  const minutes = info.session_minutes ?? 30;
  const earliest = new Date(now.getTime() + (info.min_notice_hours ?? 0) * 3_600_000);
  const bookable = freeSlots(week, busy ?? [], minutes, earliest).filter((d) => d.times.length > 0);
  const chosen = query.creneau && !Number.isNaN(Date.parse(query.creneau)) ? new Date(query.creneau) : null;
  const chosenParts = chosen ? parisParts(chosen) : null;
  const base = `/place/${token}`;
  const maxWeek = startOfWeek(addDays(today, 119));

  return (
    <main className="wrap public-page">
      <div className="page-head">
        <div>
          <h1>{t('Choisir mon premier rendez-vous')}</h1>
          <p className="sub">
            {t('Pour {prenom} · {cabinet} · séance de {min} min', { prenom: info.patient_first_name ?? '', cabinet: info.practice_name ?? '', min: minutes })}
          </p>
        </div>
        <Link href="/patient" className="btn small">
          ← {t('Mon espace')}
        </Link>
      </div>

      {query.erreur && ERRORS[query.erreur] && <p className="alert error">{t(ERRORS[query.erreur]!)}</p>}
      {error && <p className="alert error">{t('Les disponibilités n’ont pas pu être chargées. Rechargez la page.')}</p>}

      {chosen && chosenParts && (
        <section className="card stack" aria-label={t('Confirmer la réservation')}>
          <h2>{t('{jour} à {heure}', { jour: formatDay(chosenParts.date, false, L), heure: formatTime(chosenParts.time, L) })}</h2>
          <form action={bookFromLink}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="startsAt" value={chosen.toISOString()} />
            <SubmitButton pendingText="Réservation…">Confirmer ce rendez-vous</SubmitButton>
          </form>
          <p className="hint">{t('Pour changer, cliquez simplement sur un autre horaire.')}</p>
        </section>
      )}

      <div className="row">
        {week > startOfWeek(today) && (
          <Link className="btn small" href={`${base}?semaine=${addDays(week, -7)}`}>
            ← {t('Semaine précédente')}
          </Link>
        )}
        <span className="sub">{t('Semaine du {jour}', { jour: formatDay(week, false, L) })}</span>
        {week < maxWeek && (
          <Link className="btn small" href={`${base}?semaine=${addDays(week, 7)}`}>
            {t('Semaine suivante')} →
          </Link>
        )}
      </div>

      {bookable.length === 0 && <p className="hint">{t('Aucun créneau disponible cette semaine. Essayez la semaine suivante.')}</p>}
      <div className="slots-week">
        {bookable.map((d) => (
          <section key={d.date} className="card stack">
            <h3 style={{ textTransform: 'capitalize' }}>{formatDay(d.date, true, L)}</h3>
            <div className="slot-list">
              {d.times.map((time) => {
                const iso = parisToInstant(d.date, time).toISOString();
                return (
                  <Link
                    key={time}
                    href={`${base}?semaine=${week}&creneau=${encodeURIComponent(iso)}`}
                    className="btn small"
                    aria-current={query.creneau === iso ? 'true' : undefined}
                  >
                    {formatTime(time, L)}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
