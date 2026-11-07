import type { Metadata } from 'next';
import Link from 'next/link';
import { buildWeek, visibleRange, type BlockInput } from '@/lib/agenda';
import { requireOrtho } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addDays, formatDay, isDate, parisParts, parisToInstant, startOfWeek } from '@/lib/time';
import { Agenda, type PatientItem } from './agenda';

export const metadata: Metadata = { title: 'Planning' };

type Search = Record<string, string | undefined>;

/**
 * Planning de l'ortho : tout est ouvert sauf ce qu'il bloque (pauses, congés…).
 * Les rendez-vous se posent en glissant un patient sur l'agenda.
 */
export default async function PlanningPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { practice } = await requireOrtho();
  const params = await searchParams;
  const now = new Date();
  const nowParts = parisParts(now);
  const week = startOfWeek(isDate(params.semaine) ? params.semaine : nowParts.date);
  const weekStart = parisToInstant(week, '00:00').toISOString();
  const weekEnd = parisToInstant(addDays(week, 7), '00:00').toISOString();

  const supabase = await createClient();
  const [{ data: blocks, error: blocksError }, { data: appointments, error }, { data: upcoming }, { data: patients }] = await Promise.all([
    // Blocages qui peuvent avoir une occurrence cette semaine (la veille comprise, pour ceux qui débordent).
    supabase.from('schedule_blocks').select('*').lt('starts_at', weekEnd).or(`until.is.null,until.gte.${addDays(week, -1)}`),
    supabase.from('appointments').select('*').neq('status', 'annule').lt('starts_at', weekEnd).gt('ends_at', weekStart),
    supabase.from('appointments').select('patient_id, starts_at').neq('status', 'annule').gte('starts_at', now.toISOString()).order('starts_at'),
    supabase.from('patients').select('id, first_name, last_name, active').order('last_name'),
  ]);

  const nameOf = new Map((patients ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const days = buildWeek(
    week,
    (blocks ?? []) as BlockInput[],
    (appointments ?? []).map((a) => ({ ...a, label: nameOf.get(a.patient_id) ?? 'Patient' })),
  );
  // Dimanche affiché seulement s'il sert.
  const shown = days.filter((d) => d.weekday < 7 || d.appointments.length > 0);
  const range = visibleRange(shown);

  // Liste de droite : patients sans prochain rendez-vous en premier.
  const nextOf = new Map<string, string>();
  for (const a of upcoming ?? []) if (!nextOf.has(a.patient_id)) nextOf.set(a.patient_id, parisParts(new Date(a.starts_at)).date);
  const items: PatientItem[] = (patients ?? [])
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: `${p.last_name} ${p.first_name}`, next: nextOf.get(p.id) ?? null }))
    .sort((a, b) => Number(!!a.next) - Number(!!b.next) || a.name.localeCompare(b.name, 'fr'));

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
        <div className="row">
          <Link className="btn small" href={weekHref(addDays(week, -7))} aria-label="Semaine précédente">
            ←
          </Link>
          <Link className="btn small" href="/ortho/planning">
            Aujourd’hui
          </Link>
          <Link className="btn small" href={weekHref(addDays(week, 7))} aria-label="Semaine suivante">
            →
          </Link>
        </div>
      </div>
      {(error || blocksError) && <p className="alert error">Impossible de charger le planning. Rechargez la page.</p>}

      <Agenda
        days={shown}
        range={range}
        today={nowParts.date}
        nowMinutes={nowParts.minutes}
        blocks={(blocks ?? []) as BlockInput[]}
        patients={items}
        sessionMinutes={practice.session_minutes}
      />
    </>
  );
}
