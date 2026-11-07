import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOrtho } from '@/lib/auth';
import { formatAge } from '@/lib/age';
import { getT } from '@/lib/i18n';
import { ageFromBirthDate, seriesState } from '@/lib/patient';
import { REQUEST_TYPES } from '@/lib/request-type';
import { matchesSearch } from '@/lib/search';
import { createClient } from '@/lib/supabase/server';
import { formatInstant, parisParts } from '@/lib/time';
import { FilterBar } from '../liste-attente/client';
import { seriesProgress } from './progress';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Patients') };
}

type Search = Record<string, string | undefined>;

/** Patients suivis : avancement de la série, prochain rendez-vous, accès à la fiche. */
export default async function PatientsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireOrtho();
  const params = await searchParams;
  const t = await getT();
  const now = new Date();
  const today = parisParts(now).date;
  const supabase = await createClient();

  const [{ data: patients, error }, { data: acts }, { data: pathologies }, { data: past }, { data: upcoming }] = await Promise.all([
    supabase.from('patients').select('*').order('last_name').order('first_name'),
    supabase.from('amo_acts').select('*').order('sort_order'),
    supabase.from('pathologies').select('code, label').order('sort_order'),
    supabase.from('appointments').select('patient_id, starts_at, attendance').eq('status', 'confirme').lt('starts_at', now.toISOString()),
    supabase.from('appointments').select('patient_id, starts_at').neq('status', 'annule').gte('starts_at', now.toISOString()).order('starts_at'),
  ]);

  const labels = new Map((pathologies ?? []).map((p) => [p.code, t(p.label)]));
  const actLabel = new Map((acts ?? []).map((a) => [a.code, t(a.label)]));
  const progressOf = seriesProgress(patients ?? [], past ?? [], acts ?? []);
  const nextOf = new Map<string, string>();
  for (const a of upcoming ?? []) if (!nextOf.has(a.patient_id)) nextOf.set(a.patient_id, a.starts_at);

  const filter = params.motif && labels.has(params.motif) ? params.motif : '';
  const typeFilter = REQUEST_TYPES.find((r) => r.code === params.type)?.code ?? '';
  const showEnded = params.retires === '1';
  const query = (params.q ?? '').slice(0, 80);
  const all = patients ?? [];
  const rows = all.filter(
    (p) =>
      (p.active || showEnded) &&
      (!filter || p.pathology_code === filter) &&
      (!typeFilter || p.request_type === typeFilter) &&
      matchesSearch(query, [p.first_name, p.last_name, p.caregiver_first_name, p.caregiver_last_name]),
  );
  const activeCount = all.filter((p) => p.active).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Patients')}</h1>
          <p className="sub">{t(activeCount > 1 ? '{n} patients suivis' : '{n} patient suivi', { n: activeCount })}</p>
        </div>
      </div>
      {error && <p className="alert error">{t('Impossible de charger la liste. Rechargez la page.')}</p>}

      <FilterBar
        pathologies={(pathologies ?? []).map((p) => ({ code: p.code, label: t(p.label) }))}
        requestTypes={REQUEST_TYPES.map(({ code, label }) => ({ code, label: t(label) }))}
        showRemovedLabel="Afficher les prises en charge terminées"
      />

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('Patient')}</th>
              <th>{t('Motif')}</th>
              <th>{t('Séances')}</th>
              <th>{t('Prochain rendez-vous')}</th>
              <th>
                <span className="sr-only">{t('Actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const { done, total, absences } = progressOf(p);
              const { state, left } = seriesState(done, total);
              const age = p.birth_date ? ageFromBirthDate(p.birth_date, today) : p.patient_age;
              const next = nextOf.get(p.id);
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/ortho/patients/${p.id}`}>
                      <b>
                        {p.last_name} {p.first_name}
                      </b>
                    </Link>
                    <small>{formatAge(age, t.lang)}</small>
                    {!p.active && <span className="badge termine">{t('Prise en charge terminée')}</span>}
                  </td>
                  <td>
                    {p.pathology_code ? (labels.get(p.pathology_code) ?? p.pathology_code) : '—'}
                    {p.amo_act_code && <small>{actLabel.get(p.amo_act_code)}</small>}
                  </td>
                  <td className="num">
                    {total ? `${done} / ${total}` : done}
                    {state === 'fin-proche' && <span className="badge attente">{t(left === 1 ? 'Plus qu’une séance' : 'Plus que {n} séances', { n: left ?? 0 })}</span>}
                    {state === 'terminee' && <span className="badge retire">{t('Série terminée')}</span>}
                    {absences > 0 && <small className="absences">{t(absences > 1 ? '{n} rendez-vous non honorés' : '{n} rendez-vous non honoré', { n: absences })}</small>}
                  </td>
                  <td>{next ? <span style={{ textTransform: 'capitalize' }}>{formatInstant(next, t.locale)}</span> : <span className="hint">{t('Aucun')}</span>}</td>
                  <td>
                    <Link className="btn small" href={`/ortho/patients/${p.id}`}>
                      {t('Ouvrir la fiche')}
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">
                  {t(all.length ? 'Aucun patient ne correspond à la recherche.' : 'Aucun patient pour l’instant : ils arrivent ici quand vous confirmez une prise en charge dans la liste d’attente.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
