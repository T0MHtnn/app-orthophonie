import type { Metadata } from 'next';
import Link from 'next/link';
import { logout } from '@/app/(auth)/actions';
import { SubmitButton } from '@/components/form';
import type { WaitlistStatus } from '@/lib/database.types';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { withdrawRequest } from './actions';

export const metadata: Metadata = { title: 'Mon espace' };

const STATUS: Record<WaitlistStatus, { label: string; help: string }> = {
  attente: { label: 'En attente', help: 'Le cabinet vous contactera dès qu’une place se libère.' },
  contacte: { label: 'Place proposée', help: 'Le cabinet vous a contacté : vérifiez vos emails et votre téléphone.' },
  rdv: { label: 'Rendez-vous pris', help: 'La prise en charge est organisée.' },
  retire: { label: 'Demande retirée', help: 'Cette demande n’est plus active.' },
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

/** Espace famille : suivi des demandes de liste d'attente. Le reste (séances, exercices) arrivera ici. */
export default async function PatientPage() {
  const ctx = await requireUser();
  const supabase = await createClient();
  const { data: requests } = await supabase.rpc('my_waitlist_entries');

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

      <section className="card">
        <h2>Mes demandes de liste d’attente</h2>
        {!requests?.length && <p className="sub" style={{ marginTop: 8 }}>Aucune demande pour l’instant. Utilisez le lien donné par votre orthophoniste pour vous inscrire.</p>}
        {requests?.map((r) => (
          <div className="request" key={r.id}>
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
        ))}
      </section>

      <p className="hint">
        <Link href="/compte/mot-de-passe">Changer mon mot de passe</Link> ·{' '}
        {ctx.profile.role === 'ortho' ? <Link href="/ortho">Mon espace orthophoniste</Link> : <>Vous êtes orthophoniste ? <Link href="/cabinet/creer">Créer votre cabinet</Link></>}
      </p>
    </main>
  );
}
