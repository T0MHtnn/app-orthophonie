import type { Metadata } from 'next';
import Link from 'next/link';
import { buildWeek, visibleRange, type BlockInput } from '@/lib/agenda';
import { requireOrtho } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { addDays, formatDay, formatInstant, isDate, parisParts, parisToInstant, startOfWeek } from '@/lib/time';
import { formatAge } from '@/lib/age';
import { REQUEST_TYPE_LABEL } from '@/lib/request-type';
import { SubmitButton } from '@/components/form';
import { dismissCancellation } from './actions';
import { Agenda, type PatientDetail, type PatientItem } from './agenda';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Planning') };
}

type Search = Record<string, string | undefined>;

/**
 * Planning de l'ortho : tout est ouvert sauf ce qu'il bloque (pauses, congés…).
 * Les rendez-vous se posent en glissant un patient sur l'agenda.
 */
export default async function PlanningPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { practice } = await requireOrtho();
  const params = await searchParams;
  const t = await getT();
  const now = new Date();
  const nowParts = parisParts(now);
  const week = startOfWeek(isDate(params.semaine) ? params.semaine : nowParts.date);
  const weekStart = parisToInstant(week, '00:00').toISOString();
  const weekEnd = parisToInstant(addDays(week, 7), '00:00').toISOString();

  const supabase = await createClient();
  const [{ data: blocks, error: blocksError }, { data: appointments, error }, { data: upcoming }, { data: patients }, { data: pathologies }, { data: done }, { data: cancellations }] = await Promise.all([
    // Blocages qui peuvent avoir une occurrence cette semaine (la veille comprise, pour ceux qui débordent).
    supabase.from('schedule_blocks').select('*').lt('starts_at', weekEnd).or(`until.is.null,until.gte.${addDays(week, -1)}`),
    // RDV de la semaine + séances annulées par la famille (fantômes, non bloquants).
    supabase.from('appointments').select('*').or('status.neq.annule,cancelled_by.eq.famille').lt('starts_at', weekEnd).gt('ends_at', weekStart),
    supabase.from('appointments').select('patient_id, starts_at').neq('status', 'annule').gte('starts_at', now.toISOString()).order('starts_at'),
    supabase.from('patients').select('*').order('last_name'),
    supabase.from('pathologies').select('code, label'),
    supabase.from('appointments').select('patient_id, attendance').eq('status', 'confirme').lt('starts_at', now.toISOString()),
    // Annulations à venir faites par les familles (liste au-dessus de l'agenda).
    supabase.from('appointments').select('id, patient_id, starts_at, cancel_reason').eq('status', 'annule').eq('cancelled_by', 'famille').gte('starts_at', now.toISOString()).order('starts_at').limit(30),
  ]);
  // Avancement : séances passées « réalisées » ; un RDV « non honoré » (lapin) ne compte pas.
  const doneCount = new Map<string, number>();
  const absentCount = new Map<string, number>();
  for (const a of done ?? []) {
    const m = a.attendance === 'absent' ? absentCount : doneCount;
    m.set(a.patient_id, (m.get(a.patient_id) ?? 0) + 1);
  }
  const pathologyLabel = new Map((pathologies ?? []).map((p) => [p.code, p.label]));
  // Fiche patient affichée dans la pop-up d'un rendez-vous.
  const details: Record<string, PatientDetail> = Object.fromEntries(
    (patients ?? []).map((p) => [
      p.id,
      {
        name: `${p.first_name} ${p.last_name}`,
        age: formatAge(p.patient_age, t.lang),
        caregiver: [p.caregiver_first_name, p.caregiver_last_name].filter(Boolean).join(' ') || null,
        email: p.email,
        phone: p.phone,
        pathology: p.pathology_code ? t(pathologyLabel.get(p.pathology_code) ?? p.pathology_code) : null,
        requestType: p.request_type ? t(REQUEST_TYPE_LABEL[p.request_type]) : null,
        autonomous: p.autonomous,
        sessionsDone: doneCount.get(p.id) ?? 0,
        absences: absentCount.get(p.id) ?? 0,
        // Nombre de séances prévu par l'acte AMO : à brancher quand la liste des actes sera fournie.
        sessionsTotal: null,
      },
    ]),
  );

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
          <h1>{t('Planning')}</h1>
          <p className="sub">
            {t('Semaine du {debut} au {fin}', { debut: formatDay(week, false, t.locale), fin: formatDay(lastDay, false, t.locale) })}
          </p>
        </div>
        <div className="row">
          <Link className="btn small" href={weekHref(addDays(week, -7))} aria-label={t('Semaine précédente')}>
            ←
          </Link>
          <Link className="btn small" href="/ortho/planning">
            {t('Aujourd’hui')}
          </Link>
          <Link className="btn small" href={weekHref(addDays(week, 7))} aria-label={t('Semaine suivante')}>
            →
          </Link>
        </div>
      </div>
      {(error || blocksError) && <p className="alert error">{t('Impossible de charger le planning. Rechargez la page.')}</p>}
      {(cancellations ?? []).length > 0 && (
        <details className="card foldable cancellations">
          <summary>
            <h2>{t('Annulations par les patients')}</h2> <span className="count">{(cancellations ?? []).length}</span>
          </summary>
          {(cancellations ?? []).map((c) => (
            <div key={c.id} className="request">
              <div>
                <b>{nameOf.get(c.patient_id) ?? t('Patient')}</b> · <span style={{ textTransform: 'capitalize' }}>{formatInstant(c.starts_at, t.locale)}</span>
                <div className="hint">{c.cancel_reason ? `« ${c.cancel_reason} »` : t('Aucune raison donnée.')}</div>
              </div>
              <form action={dismissCancellation}>
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton className="btn small">Retirer de l’agenda</SubmitButton>
              </form>
            </div>
          ))}
        </details>
      )}

      <Agenda
        days={shown}
        range={range}
        today={nowParts.date}
        nowMinutes={nowParts.minutes}
        blocks={(blocks ?? []) as BlockInput[]}
        patients={items}
        sessionMinutes={practice.session_minutes}
        details={details}
        bookingMode={practice.booking_mode}
      />
    </>
  );
}
