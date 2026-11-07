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
import { ackAppointment, cancelMyAppointment, deleteMyRequest, withdrawRequest } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Mon espace') };
}

type Request = Database['public']['Functions']['my_waitlist_entries']['Returns'][number];

const STATUS: Record<WaitlistStatus, { label: string; help: string }> = {
  attente: { label: 'En attente', help: 'Aucune place ne vous a encore été trouvée. Le cabinet vous contactera dès qu’une place se libère.' },
  contacte: { label: 'Place proposée', help: 'Une place vous a été proposée : consultez vos emails et répondez au cabinet.' },
  rdv: { label: 'Pris en charge', help: 'Votre prise en charge est organisée.' },
  termine: { label: 'Prise en charge terminée', help: 'Les séances sont terminées. Si besoin, vous pouvez refaire une demande auprès de ce cabinet.' },
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
  // Patient suivi issu de chaque demande : la réservation se fait sur la ligne de la demande.
  // Patients dont la séance à venir est une demande en attente (non autonome).
  const pendingFor = new Set(upcoming.filter((a) => a.status === 'a_valider').map((a) => a.patient_id));
  const patientOfEntry = new Map((patients ?? []).filter((p) => p.waitlist_entry_id).map((p) => [p.waitlist_entry_id!, p]));
  // Demandes retirées : à part (repliées), supprimables.
  const current = requests.filter((r) => r.status !== 'retire');
  const withdrawn = requests.filter((r) => r.status === 'retire');

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
        <details className="card foldable" open>
          <summary>
            <h2>{t('Mes séances')}</h2> <span className="count">{upcoming.length}</span>
          </summary>
          {upcoming.length === 0 ? (
            <p className="hint">{t('Aucune séance à venir.')}</p>
          ) : (
            <div>
              {upcoming.map((a) => (
                <div key={a.id} className="request">
                  <div>
                    <b style={{ textTransform: 'capitalize' }}>{formatInstant(a.starts_at, t.locale)}</b>
                    {a.is_new && <span className="badge-new">{t('Nouveau')}</span>}
                    <div className="hint">
                      {a.patient_first_name} {a.patient_last_name} · {a.practice_name}
                    </div>
                  </div>
                  <div className="row">
                    <span className={`badge ${a.status === 'confirme' ? 'rdv' : 'attente'}`}>{t(a.status === 'confirme' ? 'Confirmée' : 'En attente de validation')}</span>
                    {/* Nouvelle séance signalée par l'ortho : la pastille part quand la famille clique « Lu ». */}
                    {a.is_new && (
                      <form action={ackAppointment}>
                        <input type="hidden" name="id" value={a.id} />
                        <SubmitButton className="btn small primary">Lu</SubmitButton>
                      </form>
                    )}
                    {a.can_cancel && (
                      <details className="cancel-box">
                        <summary className="btn small">{t(a.status === 'confirme' ? 'Annuler' : 'Retirer la demande')}</summary>
                        <form action={cancelMyAppointment} className="stack">
                          <input type="hidden" name="id" value={a.id} />
                          <label className="field">
                            <span>{t('Raison (facultatif, transmise à l’orthophoniste)')}</span>
                            <textarea name="reason" rows={2} maxLength={500} placeholder={t('Ex. : enfant malade, empêchement…')} />
                          </label>
                          <div>
                            <SubmitButton className="btn danger small">{a.status === 'confirme' ? 'Confirmer l’annulation' : 'Confirmer le retrait'}</SubmitButton>
                          </div>
                        </form>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </details>
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

      {current.length > 0 && (
        <details className="card foldable" open>
          <summary>
            <h2>{t('Mes demandes de liste d’attente')}</h2> <span className="count">{current.length}</span>
          </summary>
          {current.map((r) => (
            <RequestRow key={r.id} r={r} t={t} patient={patientOfEntry.get(r.id)} pending={pendingFor} />
          ))}
        </details>
      )}
      {withdrawn.length > 0 && (
        <details className="card foldable">
          <summary>
            <h2>{t('Demandes retirées')}</h2> <span className="count">{withdrawn.length}</span>
          </summary>
          {withdrawn.map((r) => (
            <RequestRow key={r.id} r={r} t={t} />
          ))}
        </details>
      )}
    </>
  );
}

type FamilyPatient = Database['public']['Functions']['my_patients']['Returns'][number];

function RequestRow({ r, t, patient, pending }: { r: Request; t: T; patient?: FamilyPatient; pending?: Set<string> }) {
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
        {/* Réservation ouverte par l'ortho pour ce patient : bouton sur sa ligne (sinon rien). */}
        {r.status === 'rdv' && patient?.can_book && !patient.active_booking && (
          <Link href={`/patient/reserver?patient=${patient.id}`} className="btn primary small">
            {t('Réserver une séance')}
          </Link>
        )}
        {r.status === 'rdv' && patient?.can_book && patient.active_booking && (
          <span className="hint">{t(pending?.has(patient.id) ? 'Demande de séance en cours' : 'Séance déjà prévue')}</span>
        )}
        {(r.status === 'attente' || r.status === 'contacte') && (
          <form action={withdrawRequest}>
            <input type="hidden" name="id" value={r.id} />
            <SubmitButton className="btn small">{t('Retirer ma demande')}</SubmitButton>
          </form>
        )}
        {r.status === 'retire' && (
          <form action={deleteMyRequest}>
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" className="icon-btn" aria-label={t('Supprimer cette demande')} title={t('Supprimer cette demande')}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
              </svg>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
