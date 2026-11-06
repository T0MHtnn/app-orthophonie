import type { Metadata } from 'next';
import Link from 'next/link';
import { logout } from '@/app/(auth)/actions';
import { SubmitButton } from '@/components/form';
import type { Database, WaitlistStatus } from '@/lib/database.types';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { withdrawRequest } from './actions';

export const metadata: Metadata = { title: 'Mon espace' };

type Request = Database['public']['Functions']['my_waitlist_entries']['Returns'][number];

const STATUS: Record<WaitlistStatus, { label: string; help: string }> = {
  attente: { label: 'En attente', help: 'Aucune place ne vous a encore été trouvée. Le cabinet vous contactera dès qu’une place se libère.' },
  contacte: { label: 'Place proposée', help: 'Une place vous a été proposée : consultez vos emails et répondez au cabinet.' },
  rdv: { label: 'Pris en charge', help: 'Votre prise en charge est organisée.' },
  retire: { label: 'Demande retirée', help: 'Cette demande n’est plus active.' },
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

/**
 * Espace famille. Il reste « verrouillé » tant qu'aucune demande n'est passée
 * en « Pris en charge » par l'orthophoniste : la famille ne voit alors que
 * l'état de ses demandes de liste d'attente.
 */
export default async function PatientPage() {
  const ctx = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_waitlist_entries');
  const requests = data ?? [];
  const followed = requests.filter((r) => r.status === 'rdv');
  const active = requests.filter((r) => r.status === 'attente' || r.status === 'contacte');
  const unlocked = followed.length > 0;

  return (
    <main className="wrap public-page">
      <div className="row spread">
        <div>
          <h1>Bonjour {ctx.profile.full_name || ctx.email}</h1>
          <p className="sub">{ctx.email}</p>
        </div>
        <form action={logout}>
          <button className="btn" type="submit">
            Se déconnecter
          </button>
        </form>
      </div>

      {unlocked ? (
        <section className="card stack">
          <h2>Mon espace patient</h2>
          {followed.map((r) => (
            <p key={r.id}>
              <b>
                {r.patient_first_name} {r.patient_last_name}
              </b>{' '}
              est suivi·e par {r.practice_name}.
            </p>
          ))}
          <p className="hint">Vos séances, les documents et les exercices envoyés par votre orthophoniste apparaîtront ici.</p>
        </section>
      ) : (
        <section className="card stack locked">
          <h2>{active.some((r) => r.status === 'contacte') ? 'Une place vous a été proposée' : 'Aucune place ne vous a encore été trouvée'}</h2>
          <p className="sub">
            {requests.length === 0
              ? 'Vous n’êtes inscrit sur aucune liste d’attente. Utilisez le lien donné par votre orthophoniste pour vous inscrire.'
              : 'Votre espace patient s’ouvrira dès que l’orthophoniste aura confirmé votre prise en charge.'}
          </p>
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

      <p className="hint">
        <Link href="/compte/mot-de-passe">Changer mon mot de passe</Link> ·{' '}
        {ctx.profile.role === 'ortho' ? (
          <Link href="/ortho">Mon espace orthophoniste</Link>
        ) : (
          <>
            Vous êtes orthophoniste ? <Link href="/cabinet/creer">Créer votre cabinet</Link>
          </>
        )}
      </p>
    </main>
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
          {r.pathology_label} · inscrit le {formatDate(r.created_at)}
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
