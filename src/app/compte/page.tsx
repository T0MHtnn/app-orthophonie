import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/auth';
import { AccountForm } from './account-form';

export const metadata: Metadata = { title: 'Mon compte' };

/** Informations du titulaire du compte (ortho ou famille). L'âge reste sur chaque demande / fiche patient. */
export default async function ComptePage() {
  const ctx = await requireUser();
  if (ctx.hasMfa && ctx.aal !== 'aal2') redirect('/mfa/verifier?suivant=%2Fcompte');

  return (
    <AppShell ctx={ctx}>
      <div className="page-head">
        <div>
          <h1>Mon compte</h1>
          <p className="sub">
            Connecté avec <b>{ctx.email}</b>
          </p>
        </div>
      </div>
      <section className="card stack">
        <h2>Mes informations</h2>
        <AccountForm firstName={ctx.profile.first_name} lastName={ctx.profile.last_name} />
      </section>
      <section className="card stack">
        <h2>Sécurité</h2>
        <Link href="/compte/mot-de-passe" className="btn" style={{ width: 'fit-content' }}>
          Changer mon mot de passe
        </Link>
      </section>
    </AppShell>
  );
}
