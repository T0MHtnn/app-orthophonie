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
import { deleteMyRequest, withdrawRequest } from './actions';
import { Sessions } from './sessions';
import { MyDocuments, MyHomework } from './shared-items';
import { DOCUMENT_ACCEPT } from '@/lib/documents';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Mon espace') };
}

type Tab = 'seances' | 'exercices' | 'documents' | 'demandes';
const TABS: { code: Tab; label: string }[] = [
  { code: 'seances', label: 'Mes séances' },
  { code: 'exercices', label: 'Exercices' },
  { code: 'documents', label: 'Documents' },
  { code: 'demandes', label: 'Mes demandes' },
];

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
  const [{ data }, { data: appointments }, { data: patients }, { data: homework }, { data: documents }] = await Promise.all([
    supabase.rpc('my_waitlist_entries'),
    supabase.rpc('my_appointments'),
    supabase.rpc('my_patients'),
    supabase.rpc('my_homework'),
    supabase.rpc('my_documents'),
  ]);
  const todo = (homework ?? []).filter((h) => !h.done_at).length;
  const now = Date.now();
  const upcoming = (appointments ?? []).filter((a) => new Date(a.ends_at).getTime() > now && a.status !== 'annule');
  const upcomingCount = upcoming.length;
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
  // Onglets (espace débloqué) ; avant la prise en charge, seules les demandes s'affichent.
  const tab: Tab = unlocked ? (TABS.find((k) => k.code === params.onglet)?.code ?? 'seances') : 'demandes';
  const counts: Record<Tab, number> = { seances: upcomingCount, exercices: todo, documents: (documents ?? []).length, demandes: current.length };
  // Raccourci « Réserver » en tête des séances (le bouton reste aussi sur la ligne de la demande).
  const bookable = (patients ?? []).filter((p) => p.can_book && !p.active_booking);

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

      {unlocked && (
        <nav className="tabs" aria-label={t('Mon espace')}>
          {TABS.map((k) => (
            <Link key={k.code} href={k.code === 'seances' ? '/patient' : `/patient?onglet=${k.code}`} aria-current={tab === k.code ? 'page' : undefined}>
              {t(k.label)} {counts[k.code] > 0 && <span className="count">{counts[k.code]}</span>}
            </Link>
          ))}
        </nav>
      )}

      {tab === 'seances' && (
        <section className="card stack">
          {bookable.length > 0 && (
            <div className="row">
              {bookable.map((p) => (
                <Link key={p.id} href={`/patient/reserver?patient=${p.id}`} className="btn primary small">
                  {t(bookable.length > 1 ? 'Réserver une séance pour {prenom}' : 'Réserver une séance', { prenom: p.first_name })}
                </Link>
              ))}
            </div>
          )}
          <Sessions sessions={appointments ?? []} />
        </section>
      )}

      {tab === 'exercices' && (
        <section className="card stack">
          <MyHomework items={homework ?? []} showPatient={(patients ?? []).length > 1} />
        </section>
      )}

      {tab === 'documents' && (
        <MyDocuments
          items={documents ?? []}
          accept={DOCUMENT_ACCEPT}
          patients={(patients ?? []).map((p) => ({ id: p.id, label: `${p.first_name} ${p.last_name} · ${p.practice_name}` }))}
        />
      )}

      {!unlocked && (
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

      {tab === 'demandes' && current.length > 0 && (
        <section className="card">
          {!unlocked && <h2>{t('Mes demandes de liste d’attente')}</h2>}
          {current.map((r) => (
            <RequestRow key={r.id} r={r} t={t} patient={patientOfEntry.get(r.id)} pending={pendingFor} />
          ))}
        </section>
      )}
      {tab === 'demandes' && withdrawn.length > 0 && (
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
