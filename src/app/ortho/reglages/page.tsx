import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOrtho } from '@/lib/auth';
import { DEFAULT_EMAIL_TEMPLATE, DEFAULT_WAITLIST_INFO } from '@/lib/defaults';
import { siteUrl } from '@/lib/env';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Réglages' };

/** Réglages du cabinet : réservés à l'ortho propriétaire (requireOrtho + RLS). */
export default async function ReglagesPage() {
  const { practice } = await requireOrtho();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Réglages</h1>
          <p className="sub">
            Page publique : <a href={`${siteUrl}/c/${practice.slug}`}>{`${siteUrl}/c/${practice.slug}`}</a>
          </p>
        </div>
      </div>
      <SettingsForm
        name={practice.name}
        waitlistOpen={practice.waitlist_open}
        waitlistInfo={practice.waitlist_info || DEFAULT_WAITLIST_INFO}
        emailTemplate={practice.email_template || DEFAULT_EMAIL_TEMPLATE}
      />
      <section className="card stack">
        <h2>Compte</h2>
        <Link href="/compte/mot-de-passe" className="btn" style={{ width: 'fit-content' }}>
          Changer mon mot de passe
        </Link>
      </section>
    </>
  );
}
