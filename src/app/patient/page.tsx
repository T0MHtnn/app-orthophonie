import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmitButton } from '@/components/form';
import type { Database, WaitlistStatus } from '@/lib/database.types';
import { requireUser } from '@/lib/auth';
import { REQUEST_TYPE_LABEL } from '@/lib/request-type';
import { createClient } from '@/lib/supabase/server';
import { cancelMyAppointment, withdrawRequest } from './actions';

export const metadata: Metadata = { title: 'Mon espace' };

type Request = Database['public']['Functions']['my_waitlist_entries']['Returns'][number];

const STATUS: Record<WaitlistStatus, { label: string; help: string }> = {
  attente: { label: 'En attente', help: 'Aucune place ne vous a encore été trouvée. Le cabinet vous contactera dès qu’une place se libère.' },
  contacte: { label: 'Place proposée', help: 'Une place vous a été proposée : consultez vos emails et répondez au cabinet.' },
  rdv: { label: 'Pris en charge', help: 'Votre prise en charge est organisée.' },
  retire: { label: 'Demande retirée', help: 'Cette demande n’est plus active.' },
};

const formatSession = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

/**
 * Espace famille. Il reste « verrouillé » tant qu'aucune demande n'est passée
 * en « Pris en charge » par l'orthophoniste : la famille ne voit alors que
 * l'état de ses demandes de liste d'attente.
 */
export default async function PatientPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireUser();
  const params = await searchParams;
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
          <h1>Bonjour {ctx.profile.first_name || ctx.profile.full_name || ctx.email}</h1>
          <p className="sub">Suivez ici vos demandes de liste d’attente et, ensuite, vos séances.</p>
        </div>
        {requests.length > 0 && (
          <Link href="/trouver" className="btn">
            Nouvelle demande
          </Link>
        )}
      </div>

      {params.ok === 'reserve' && <p className="alert ok">Séance réservée et confirmée.</p>}
      {params.ok === 'demande' && <p className="alert warn">Demande envoyée : la séance sera confirmée quand l’orthophoniste l’aura validée.</p>}
      {params.ok === 'annule' && <p className="alert ok">Séance annulée.</p>}
      {params.erreur === 'annulation' && <p className="alert error">Cette séance ne peut plus être annulée en ligne : contactez le cabinet.</p>}

      {unlocked ? (
        <section className="card stack">
          <h2>Mes séances</h2>
          {upcoming.length === 0 ? (
            <p className="hint">Aucune séance à venir.</p>
          ) : (
            <div>
              {upcoming.map((a) => (
                <div key={a.id} className="request">
                  <div>
                    <b>{formatSession(a.starts_at)}</b>
                    <div className="hint">
                      {a.patient_first_name} {a.patient_last_name} · {a.practice_name}
                    </div>
                  </div>
                  <div className="row">
                    <span className={`badge ${a.status === 'confirme' ? 'rdv' : 'attente'}`}>{a.status === 'confirme' ? 'Confirmée' : 'En attente de validation'}</span>
                    {a.can_cancel && (
                      <form action={cancelMyAppointment}>
                        <input type="hidden" name="id" value={a.id} />
                        <SubmitButton className="btn small">{a.status === 'confirme' ? 'Annuler' : 'Retirer la demande'}</SubmitButton>
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
                <b>{p.practice_name}</b> ne propose pas la réservation en ligne pour {p.first_name} : c’est votre orthophoniste qui organise les
                rendez-vous. Ils apparaîtront ici dès qu’ils seront fixés.
              </p>
            ) : p.active_booking ? (
              <p key={p.id} className="hint">
                {p.first_name} a déjà une réservation en cours : vous pourrez en demander une autre quand elle sera passée ou annulée.
              </p>
            ) : (
              <Link key={p.id} href={`/patient/reserver?patient=${p.id}`} className="btn primary" style={{ width: 'fit-content' }}>
                Réserver une séance pour {p.first_name}
              </Link>
            ),
          )}
        </section>
      ) : (
        <section className="card stack locked">
          <h2>{active.some((r) => r.status === 'contacte') ? 'Une place vous a été proposée' : 'Aucune place ne vous a encore été trouvée'}</h2>
          <p className="sub">
            {requests.length === 0
              ? 'Vous n’êtes inscrit sur aucune liste d’attente pour le moment.'
              : 'Votre espace patient s’ouvrira dès que l’orthophoniste aura confirmé votre prise en charge.'}
          </p>
          {requests.length === 0 && (
            <Link href="/trouver" className="btn primary" style={{ width: 'fit-content' }}>
              Trouver un orthophoniste
            </Link>
          )}
        </section>
      )}

      {requests.length > 0 && (
        <section className="card">
          <h2>Mes demandes de liste d’attente</h2>
          {requests.map((r) => (
            <RequestRow key={r.id} r={r} />
          ))}
        </section>
      )}
    </>
  );
}

function RequestRow({ r }: { r: Request }) {
  return (
    <div className="request">
      <div>
        <b>
          {r.patient_first_name} {r.patient_last_name}
        </b>{' '}
        · {r.practice_name}
        <div className="hint">
          {REQUEST_TYPE_LABEL[r.request_type]} · {r.pathology_label} · inscrit le {formatDate(r.created_at)}
        </div>
        <div className="hint">{STATUS[r.status].help}</div>
      </div>
      <div className="row">
        <span className={`badge ${r.status}`}>{STATUS[r.status].label}</span>
        {(r.status === 'attente' || r.status === 'contacte') && (
          <form action={withdrawRequest}>
            <input type="hidden" name="id" value={r.id} />
            <SubmitButton className="btn small">Retirer ma demande</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
