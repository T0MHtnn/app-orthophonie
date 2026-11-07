import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BackButton } from '@/components/back-button';
import { SessionsProgress } from '@/components/sessions-progress';
import { requireOrtho } from '@/lib/auth';
import { formatAge } from '@/lib/age';
import { getT } from '@/lib/i18n';
import { ageFromBirthDate, amoPrice, formatEuros } from '@/lib/patient';
import { REQUEST_TYPES } from '@/lib/request-type';
import { createClient } from '@/lib/supabase/server';
import { formatInstant, parisParts } from '@/lib/time';
import { seriesProgress } from '../progress';
import { Notes } from './notes';
import { PatientForm } from './patient-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Fiche patient') };
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Fiche patient complète : séances, notes privées, informations et prescription. */
export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrtho();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const t = await getT();
  const now = new Date();
  const today = parisParts(now).date;
  const supabase = await createClient();

  const [{ data: patient }, { data: acts }, { data: pathologies }, { data: appointments }, { data: notes }] = await Promise.all([
    supabase.from('patients').select('*').eq('id', id).maybeSingle(),
    supabase.from('amo_acts').select('*').order('sort_order'),
    supabase.from('pathologies').select('code, label').order('sort_order'),
    supabase.from('appointments').select('id, starts_at, ends_at, status, attendance, cancelled_by').eq('patient_id', id).order('starts_at', { ascending: false }).limit(200),
    supabase.from('session_notes').select('*').eq('patient_id', id).order('created_at', { ascending: false }).limit(200),
  ]);
  if (!patient) notFound();

  const past = (appointments ?? []).filter((a) => a.status === 'confirme' && new Date(a.starts_at) < now).map((a) => ({ ...a, patient_id: id }));
  const { done, total, absences } = seriesProgress([patient], past, acts ?? [])(patient);
  const act = (acts ?? []).find((a) => a.code === patient.amo_act_code);
  const age = patient.birth_date ? ageFromBirthDate(patient.birth_date, today) : patient.patient_age;
  const pathology = (pathologies ?? []).find((p) => p.code === patient.pathology_code);
  const caregiver = [patient.caregiver_first_name, patient.caregiver_last_name].filter(Boolean).join(' ');

  const stateOf = (a: NonNullable<typeof appointments>[number]): [string, string] => {
    if (a.status === 'annule') return [a.cancelled_by === 'ortho' ? 'Annulée par le cabinet' : 'Annulée par le patient', 'retire'];
    if (a.status === 'a_valider') return ['En attente de validation', 'attente'];
    if (new Date(a.ends_at) > now) return ['Prévu', 'contacte'];
    return a.attendance === 'absent' ? ['Non honoré', 'retire'] : ['Réalisé', 'rdv'];
  };
  // Séances proposées pour rattacher une note : les passées et celles du jour, de la plus récente à la plus ancienne.
  const noteSessions = (appointments ?? [])
    .filter((a) => a.status === 'confirme' && parisParts(new Date(a.starts_at)).date <= today)
    .map((a) => ({ id: a.id, label: formatInstant(a.starts_at, t.locale) }));

  return (
    <>
      <div className="page-head">
        <div className="stack" style={{ gap: 6 }}>
          <div>
            <BackButton fallback="/ortho/patients" />
          </div>
          <h1>
            {patient.first_name} {patient.last_name}
          </h1>
          <p className="sub">
            {[formatAge(age, t.lang), pathology && t(pathology.label), act && t(act.label)].filter(Boolean).join(' · ')}
            {!patient.active && (
              <>
                {' '}
                <span className="badge termine">{t('Prise en charge terminée')}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="patient-grid">
        <section className="card stack">
          <h2>{t('Séances')}</h2>
          <SessionsProgress done={done} total={total} />
          {absences > 0 && <p className="absences">{t(absences > 1 ? '{n} rendez-vous non honorés' : '{n} rendez-vous non honoré', { n: absences })}</p>}
          <dl className="facts">
            {patient.email && (
              <div>
                <dt>{t('Email')}</dt>
                <dd>
                  <a href={`mailto:${patient.email}`}>{patient.email}</a>
                </dd>
              </div>
            )}
            {patient.phone && (
              <div>
                <dt>{t('Téléphone')}</dt>
                <dd>
                  <a href={`tel:${patient.phone.replace(/\s/g, '')}`}>{patient.phone}</a>
                </dd>
              </div>
            )}
            {caregiver && (
              <div>
                <dt>{t('Parent / aidant')}</dt>
                <dd>{caregiver}</dd>
              </div>
            )}
            {act && (
              <div>
                <dt>{t('Acte AMO')}</dt>
                <dd>
                  AMO {String(act.coefficient).replace('.', t.lang === 'fr' ? ',' : '.')} · {formatEuros(amoPrice(act.coefficient), t.locale)}
                </dd>
              </div>
            )}
          </dl>
          <div className="session-list">
            {(appointments ?? []).length === 0 && <p className="hint">{t('Aucune séance pour l’instant.')}</p>}
            {(appointments ?? []).map((a) => {
              const [label, kind] = stateOf(a);
              return (
                <div key={a.id} className="request">
                  <span style={{ textTransform: 'capitalize' }}>{formatInstant(a.starts_at, t.locale)}</span>
                  <span className={`badge ${kind}`}>{t(label)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card stack">
          <h2>{t('Notes de séance')}</h2>
          <p className="hint">{t('Privées : le patient ne les voit jamais.')}</p>
          <Notes patientId={patient.id} sessions={noteSessions} notes={(notes ?? []).map((n) => ({ ...n, sessionLabel: noteSessions.find((s) => s.id === n.appointment_id)?.label ?? null }))} />
        </section>
      </div>

      <section className="card stack">
        <h2>{t('Informations du patient')}</h2>
        <PatientForm
          patient={patient}
          acts={(acts ?? []).map((a) => ({ code: a.code, label: `${t(a.label)} (AMO ${a.coefficient} · ${formatEuros(amoPrice(a.coefficient), t.locale)})`, sessions: a.sessions }))}
          pathologies={(pathologies ?? []).map((p) => ({ code: p.code, label: t(p.label) }))}
          requestTypes={REQUEST_TYPES.map(({ code, label }) => ({ code, label: t(label) }))}
        />
      </section>
    </>
  );
}
