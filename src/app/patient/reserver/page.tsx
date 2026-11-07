import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubmitButton } from '@/components/form';
import { freeSlots } from '@/lib/agenda';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addDays, formatDay, formatTime, isDate, parisParts, parisToInstant, startOfWeek } from '@/lib/time';
import { bookSlot } from '../actions';

export const metadata: Metadata = { title: 'Réserver une séance' };

const ERRORS: Record<string, string> = {
  pris: 'Ce créneau vient d’être pris. Choisissez-en un autre.',
  delai: 'Ce créneau n’est plus réservable en ligne (délai trop court).',
  attente: 'Une réservation est déjà en cours pour ce patient : vous pourrez en demander une autre quand elle sera passée ou annulée.',
  limite: 'Trop de réservations aujourd’hui. Réessayez demain.',
  invalide: 'Créneau invalide. Réessayez.',
  autre: 'La réservation n’a pas pu être enregistrée. Réessayez.',
};

/**
 * Réservation par la famille : semaine par semaine, créneaux libres du cabinet
 * (la famille ne voit que des disponibilités, jamais les autres rendez-vous).
 */
export default async function ReserverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: patients } = await supabase.rpc('my_patients');
  const patient = (patients ?? []).find((p) => p.id === params.patient && p.can_book);
  // Réservation fermée par le cabinet, ou déjà une réservation active : retour à l'espace (message explicatif).
  if (!patient || patient.active_booking) redirect('/patient');

  const now = new Date();
  const today = parisParts(now).date;
  const week = startOfWeek(isDate(params.semaine) && params.semaine >= today ? params.semaine : today);
  const from = parisToInstant(week, '00:00');
  const to = parisToInstant(addDays(week, 7), '00:00');
  const { data: busy, error } = await supabase.rpc('booking_busy', { p_patient_id: patient.id, p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) console.error('booking_busy', error.code);

  const earliest = new Date(now.getTime() + patient.min_notice_hours * 3_600_000);
  const days = freeSlots(week, busy ?? [], patient.session_minutes, earliest);
  const chosen = params.creneau && !Number.isNaN(Date.parse(params.creneau)) ? new Date(params.creneau) : null;
  const chosenParts = chosen ? parisParts(chosen) : null;
  const base = `/patient/reserver?patient=${patient.id}`;
  const maxWeek = startOfWeek(addDays(today, 119));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Réserver une séance</h1>
          <p className="sub">
            Pour {patient.first_name} {patient.last_name} · {patient.practice_name} · séance de {patient.session_minutes} min
          </p>
        </div>
        <Link href="/patient" className="btn small">
          Retour
        </Link>
      </div>

      {params.erreur && <p className="alert error">{ERRORS[params.erreur] ?? ERRORS.autre}</p>}
      {error && <p className="alert error">Les disponibilités n’ont pas pu être chargées. Rechargez la page.</p>}

      {chosen && chosenParts && (
        <section className="card stack" aria-label="Confirmer la réservation">
          <h2>
            {formatDay(chosenParts.date)} à {formatTime(chosenParts.time)}
          </h2>
          <p className="sub">Séance de {patient.session_minutes} min pour {patient.first_name}.</p>
          <form action={bookSlot}>
            <input type="hidden" name="patientId" value={patient.id} />
            <input type="hidden" name="startsAt" value={chosen.toISOString()} />
            <input type="hidden" name="semaine" value={week} />
            <SubmitButton pendingText="Réservation…">Confirmer la réservation</SubmitButton>
          </form>
          <p className="hint">Pour changer, cliquez simplement sur un autre horaire.</p>
        </section>
      )}

      <div className="row">
        {week > startOfWeek(today) && (
          <Link className="btn small" href={`${base}&semaine=${addDays(week, -7)}`}>
            ← Semaine précédente
          </Link>
        )}
        <span className="sub">Semaine du {formatDay(week)}</span>
        {week < maxWeek && (
          <Link className="btn small" href={`${base}&semaine=${addDays(week, 7)}`}>
            Semaine suivante →
          </Link>
        )}
      </div>

      <div className="slots-week">
        {days.map((d) => (
          <section key={d.date} className="card stack">
            <h3 style={{ textTransform: 'capitalize' }}>{formatDay(d.date, true)}</h3>
            {d.times.length === 0 ? (
              <p className="hint">Aucun créneau</p>
            ) : (
              <div className="slot-list">
                {d.times.map((t) => {
                  const iso = parisToInstant(d.date, t).toISOString();
                  return (
                    <Link key={t} href={`${base}&semaine=${week}&creneau=${encodeURIComponent(iso)}`} className="btn small" aria-current={params.creneau === iso ? 'true' : undefined}>
                      {formatTime(t)}
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
