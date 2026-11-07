import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmitButton } from '@/components/form';
import { Notice } from '@/components/notice';
import type { Database, WaitlistStatus } from '@/lib/database.types';
import { requireUser } from '@/lib/auth';
import { getT, type T } from '@/lib/i18n';
import { REQUEST_TYPE_LABEL } from '@/lib/request-type';
import { createClient } from '@/lib/supabase/server';
import { formatInstant, formatShortDate } from '@/lib/time';
import { cancelMyAppointment, withdrawRequest } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Mon espace') };
}

type Request = Database['public']['Functions']['my_waitlist_entries']['Returns'][number];

const STATUS: Record<WaitlistStatus, { label: string; help: string }> = {
  attente: { label: 'En attente', help: 'Aucune place ne vous a encore été trouvée. Le cabinet vous contactera dès qu’une place se libère.' },
  contacte: { label: 'Place proposée', help: 'Une place vous a été proposée : consultez vos emails et répondez au cabinet.' },
  rdv: { label: 'Pris en charge', help: 'Votre prise en charge est organisée.' },
  retire: { label: 'Demande retirée', help: 'Cette demande n’est plus active.' },
};

/**
 * Espace famille. Il reste « verrouillé » tant qu'aucune demande n'est passée
 * en « Pris en charge » par l'orthophoniste : la famille ne voit alors que
 * l'état de ses demandes de liste d'attente.
 */
export default async function PatientPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireUser();
  const params = await searchParams;
  const t = await getT();
  const supabase = await createClient();
  const [{ data }, { data: appointments }, { data: patients }] = await Promise.all([
    supabase.rpc('my_waitlist_entries'),
    supabase.rpc('my_appointments'),
    supabase.rpc('my_patients'),
  ]);
  const now = Date.now();
  const upcoming = (appointments ?? []).filter((a) => new Date(a.ends_at).getTime() > now);
  const requests = data ?? [];
  const followed = requests.filter((r) => r.status === 'rdv');
  const active = requests.filter((r) => r.status === 'attente' || r.status === 'contacte');
  const unlocked = followed.length > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Bonjour {nom}', { nom: ctx.profile.first_name || ctx.profile.full_name || ctx.email })}</h1>
          <p className="sub">{t('Suivez ici vos demandes de liste d’attente et, ensuite, vos séances.')}</p>
        </div>
        {requests.length > 0 && (
          <Link href="/trouver" className="btn">
            {t('Nouvelle demande')}
          </Link>
        )}
      </div>

      {params.ok === 'reserve' && <Notice kind="ok">{t('Séance réservée et confirmée.')}</Notice>}
      {params.ok === 'demande' && <Notice kind="warn">{t('Demande envoyée : la séance sera confirmée quand l’orthophoniste l’aura validée.')}</Notice>}
      {params.ok === 'annule' && <Notice kind="ok">{t('Séance annulée.')}</Notice>}
      {params.erreur === 'annulation' && <p className="alert error">{t('Cette séance ne peut plus être annulée en ligne : contactez le cabinet.')}</p>}

      {unlocked ? (
        <section className="card stack">
          <h2>{t('Mes séances')}</h2>
          {upcoming.length === 0 ? (
            <p className="hint">{t('Aucune séance à venir.')}</p>
          ) : (
            <div>
              {upcoming.map((a) => (
                <div key={a.id} className="request">
                  <div>
                    <b style={{ textTransform: 'capitalize' }}>{formatInstant(a.starts_at, t.locale)}</b>
                    <div className="hint">
                      {a.patient_first_name} {a.patient_last_name} · {a.practice_name}
                    </div>
                  </div>
                  <div className="row">
                    <span className={`badge ${a.status === 'confirme' ? 'rdv' : 'attente'}`}>{t(a.status === 'confirme' ? 'Confirmée' : 'En attente de validation')}</span>
                    {a.can_cancel && (
                      <form action={cancelMyAppointment}>
                        <input type="hidden" name="id" value={a.id} />
                        <SubmitButton className="btn small">{t(a.status === 'confirme' ? 'Annuler' : 'Retirer la demande')}</SubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(patients ?? []).map((p) =>
            !p.can_book ? (
              <p key={p.id} className="alert warn">
                {t(
                  '{cabinet} ne propose pas la réservation en ligne pour {prenom} : c’est votre orthophoniste qui organise les rendez-vous. Ils apparaîtront ici dès qu’ils seront fixés.',
                  { cabinet: p.practice_name, prenom: p.first_name },
                )}
              </p>
            ) : p.active_booking ? (
              <p key={p.id} className="hint">
                {t('{prenom} a déjà une réservation en cours : vous pourrez en demander une autre quand elle sera passée ou annulée.', { prenom: p.first_name })}
              </p>
            ) : (
              <Link key={p.id} href={`/patient/reserver?patient=${p.id}`} className="btn primary" style={{ width: 'fit-content' }}>
                {t('Réserver une séance pour {prenom}', { prenom: p.first_name })}
              </Link>
            ),
          )}
        </section>
      ) : (
        <section className="card stack locked">
          <h2>{t(active.some((r) => r.status === 'contacte') ? 'Une place vous a été proposée' : 'Aucune place ne vous a encore été trouvée')}</h2>
          <p className="sub">
            {t(
              requests.length === 0
                ? 'Vous n’êtes inscrit sur aucune liste d’attente pour le moment.'
                : 'Votre espace patient s’ouvrira dès que l’orthophoniste aura confirmé votre prise en charge.',
            )}
          </p>
          {requests.length === 0 && (
            <Link href="/trouver" className="btn primary" style={{ width: 'fit-content' }}>
              {t('Trouver un orthophoniste')}
            </Link>
          )}
        </section>
      )}

      {requests.length > 0 && (
        <section className="card">
          <h2>{t('Mes demandes de liste d’attente')}</h2>
          {requests.map((r) => (
            <RequestRow key={r.id} r={r} t={t} />
          ))}
        </section>
      )}
    </>
  );
}

function RequestRow({ r, t }: { r: Request; t: T }) {
  return (
    <div className="request">
      <div>
        <b>
          {r.patient_first_name} {r.patient_last_name}
        </b>{' '}
        · {r.practice_name}
        <div className="hint">
          {t(REQUEST_TYPE_LABEL[r.request_type])} · {t(r.pathology_label)} · {t('inscrit le {date}', { date: formatShortDate(r.created_at, t.locale) })}
        </div>
        <div className="hint">{t(STATUS[r.status].help)}</div>
      </div>
      <div className="row">
        <span className={`badge ${r.status}`}>{t(STATUS[r.status].label)}</span>
        {(r.status === 'attente' || r.status === 'contacte') && (
          <form action={withdrawRequest}>
            <input type="hidden" name="id" value={r.id} />
            <SubmitButton className="btn small">{t('Retirer ma demande')}</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
