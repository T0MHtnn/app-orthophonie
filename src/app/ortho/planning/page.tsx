import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmitButton } from '@/components/form';
import { buildAgenda, visibleRange, type AgendaDay } from '@/lib/agenda';
import { requireOrtho } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addDays, formatDay, formatTime, isDate, minutesToTime, parisParts, parisToInstant, startOfWeek } from '@/lib/time';
import { cancelAppointment } from './actions';
import { AppointmentForm, type AppointmentDefaults } from './appointment-form';
import { PlanningTabs } from './tabs';

export const metadata: Metadata = { title: 'Planning' };

/** Hauteur d'une minute dans la grille, en pixels. */
const PX = 1.1;

type Search = Record<string, string | undefined>;

export default async function PlanningPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { practice } = await requireOrtho();
  const params = await searchParams;
  const now = new Date();
  const today = parisParts(now).date;
  const week = startOfWeek(isDate(params.semaine) ? params.semaine : today);
  const weekStart = parisToInstant(week, '00:00').toISOString();
  const weekEnd = parisToInstant(addDays(week, 7), '00:00').toISOString();

  const supabase = await createClient();
  const [{ data: hours }, { data: exceptions }, { data: appointments, error }, { data: patients }] = await Promise.all([
    supabase.from('opening_hours').select('*'),
    supabase.from('schedule_exceptions').select('*').lt('starts_at', weekEnd).gt('ends_at', weekStart),
    supabase.from('appointments').select('*').neq('status', 'annule').lt('starts_at', weekEnd).gt('ends_at', weekStart).order('starts_at'),
    supabase.from('patients').select('id, first_name, last_name, active').order('last_name'),
  ]);
  const nameOf = new Map((patients ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const activePatients = (patients ?? []).filter((p) => p.active).map((p) => ({ id: p.id, name: `${p.last_name} ${p.first_name}` }));

  const days = buildAgenda({
    week,
    openingHours: hours ?? [],
    exceptions: exceptions ?? [],
    appointments: (appointments ?? []).map((a) => ({ ...a, label: nameOf.get(a.patient_id) ?? 'Patient' })),
    sessionMinutes: practice.session_minutes,
    now,
  });
  // Dimanche affiché seulement s'il sert.
  const shown = days.filter((d) => d.weekday < 7 || d.open.length > 0 || d.appointments.length > 0);
  const range = visibleRange(shown);
  const noHours = (hours ?? []).length === 0;

  const selected = (appointments ?? []).find((a) => a.id === params.rdv);
  const creating = params.nouveau !== undefined && !selected;
  const defaults: AppointmentDefaults | null = selected
    ? {
        id: selected.id,
        patientId: selected.patient_id,
        date: parisParts(new Date(selected.starts_at)).date,
        time: parisParts(new Date(selected.starts_at)).time,
        duration: String(Math.round((new Date(selected.ends_at).getTime() - new Date(selected.starts_at).getTime()) / 60_000)),
      }
    : creating
      ? {
          id: '',
          patientId: '',
          date: isDate(params.nouveau) ? params.nouveau : today,
          time: params.heure && /^\d{2}:\d{2}$/.test(params.heure) ? params.heure : '09:00',
          duration: String(practice.session_minutes),
        }
      : null;

  const weekHref = (w: string) => `/ortho/planning?semaine=${w}`;
  const lastDay = shown[shown.length - 1]?.date ?? addDays(week, 5);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Planning</h1>
          <p className="sub">
            Semaine du {formatDay(week)} au {formatDay(lastDay)}
          </p>
        </div>
        <Link className="btn primary" href={`${weekHref(week)}&nouveau=${week <= today && today < addDays(week, 7) ? today : week}`}>
          Nouveau rendez-vous
        </Link>
      </div>
      <PlanningTabs current="agenda" />

      {params.ok === 'ajoute' && <p className="alert ok">Rendez-vous ajouté.</p>}
      {params.ok === 'deplace' && <p className="alert ok">Rendez-vous déplacé.</p>}
      {params.ok === 'annule' && <p className="alert ok">Rendez-vous annulé.</p>}
      {params.erreur === 'annulation' && <p className="alert error">Le rendez-vous n’a pas pu être annulé. Rechargez la page puis réessayez.</p>}
      {error && <p className="alert error">Impossible de charger le planning. Rechargez la page.</p>}
      {noHours && (
        <p className="alert warn">
          Aucun horaire d’ouverture : renseignez vos plages dans <Link href="/ortho/planning/horaires">Horaires d’ouverture</Link> pour voir vos créneaux libres.
        </p>
      )}

      {defaults && (
        <section className="card stack" aria-label={selected ? 'Rendez-vous' : 'Nouveau rendez-vous'}>
          <div className="row spread">
            <div>
              <h2>{selected ? (nameOf.get(selected.patient_id) ?? 'Rendez-vous') : 'Nouveau rendez-vous'}</h2>
              {selected && (
                <p className="sub">
                  {formatDay(defaults.date)} à {formatTime(defaults.time)} · {defaults.duration} min
                </p>
              )}
            </div>
            <Link href={weekHref(week)} className="btn small">
              Fermer
            </Link>
          </div>
          {activePatients.length === 0 && !selected ? (
            <p className="hint">
              Aucun patient suivi pour l’instant. Confirmez une prise en charge depuis la <Link href="/ortho/liste-attente">liste d’attente</Link> : le patient
              apparaîtra ici.
            </p>
          ) : (
            <AppointmentForm patients={activePatients} defaults={defaults} />
          )}
          {selected && (
            <form action={cancelAppointment}>
              <input type="hidden" name="id" value={selected.id} />
              <input type="hidden" name="semaine" value={week} />
              <SubmitButton className="btn danger small">Annuler ce rendez-vous</SubmitButton>
            </form>
          )}
        </section>
      )}

      <div className="row">
        <Link className="btn small" href={weekHref(addDays(week, -7))}>
          ← Semaine précédente
        </Link>
        <Link className="btn small" href="/ortho/planning">
          Aujourd’hui
        </Link>
        <Link className="btn small" href={weekHref(addDays(week, 7))}>
          Semaine suivante →
        </Link>
      </div>

      <div className="card agenda-wrap">
        <div className="agenda" style={{ gridTemplateColumns: `52px repeat(${shown.length}, minmax(110px, 1fr))` }}>
          <div />
          {shown.map((d) => (
            <div key={d.date} className={`agenda-head ${d.date === today ? 'today' : ''}`}>
              {formatDay(d.date, true)}
            </div>
          ))}
          <div className="agenda-hours" style={{ height: (range.end - range.start) * PX }}>
            {Array.from({ length: (range.end - range.start) / 60 }, (_, i) => (
              <span key={i} style={{ top: i * 60 * PX }}>
                {range.start / 60 + i} h
              </span>
            ))}
          </div>
          {shown.map((d) => (
            <DayColumn key={d.date} day={d} rangeStart={range.start} height={(range.end - range.start) * PX} week={week} />
          ))}
        </div>
      </div>
      <p className="hint">Cliquez sur un créneau libre (+) pour y poser un rendez-vous, ou sur un rendez-vous pour le déplacer ou l’annuler.</p>
    </>
  );
}

function DayColumn({ day, rangeStart, height, week }: { day: AgendaDay; rangeStart: number; height: number; week: string }) {
  const pos = (i: { start: number; end: number }) => ({ top: (i.start - rangeStart) * PX, height: Math.max(14, (i.end - i.start) * PX) });
  return (
    <div className="agenda-col" style={{ height, backgroundSize: `100% ${60 * PX}px` }}>
      {day.open.map((o) => (
        <div key={`o${o.start}`} className="agenda-open" style={pos(o)} />
      ))}
      {day.closed.map((c) => (
        <div key={`c${c.start}`} className="agenda-closed" style={pos({ start: Math.max(c.start, rangeStart), end: c.end })} title={c.label || 'Fermé'}>
          {c.label || 'Fermé'}
        </div>
      ))}
      {day.free.map((f) => (
        <Link
          key={`f${f.start}`}
          className="agenda-slot"
          style={pos(f)}
          href={`/ortho/planning?semaine=${week}&nouveau=${day.date}&heure=${minutesToTime(f.start)}`}
          aria-label={`Créneau libre ${formatDay(day.date)} à ${formatTime(minutesToTime(f.start))}`}
        >
          +
        </Link>
      ))}
      {day.appointments.map((a) => (
        <Link key={a.id} className={`agenda-appt ${a.status}`} style={pos(a)} href={`/ortho/planning?semaine=${week}&rdv=${a.id}`}>
          <b>{minutesToTime(a.start)}</b> {a.label}
        </Link>
      ))}
    </div>
  );
}
