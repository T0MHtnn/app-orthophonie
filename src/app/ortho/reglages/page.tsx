import type { Metadata } from 'next';
import { requireOrtho } from '@/lib/auth';
import { emailTemplateFor, waitlistInfoFor } from '@/lib/defaults';
import { getT } from '@/lib/i18n';
import { siteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { AutonomousList, BookingForm } from './booking';
import { SettingsForm } from './settings-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Réglages') };
}

/** Réglages du cabinet : réservés à l'ortho propriétaire (requireOrtho + RLS). */
export default async function ReglagesPage() {
  const { practice } = await requireOrtho();
  const t = await getT();
  const supabase = await createClient();
  const { data: patients } = await supabase.from('patients').select('id, first_name, last_name, autonomous').eq('active', true).order('last_name');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Réglages')}</h1>
          <p className="sub">
            {t('Page publique :')} <a href={`${siteUrl}/c/${practice.slug}`}>{`${siteUrl}/c/${practice.slug}`}</a>
          </p>
        </div>
      </div>
      <SettingsForm
        name={practice.name}
        addressLine={practice.address_line ?? ''}
        postalCode={practice.postal_code ?? ''}
        city={practice.city ?? ''}
        listed={practice.listed}
        waitlistOpen={practice.waitlist_open}
        // Texte par défaut affiché dans la langue de la page (un texte écrit par l'ortho reste tel quel).
        waitlistInfo={waitlistInfoFor(practice.waitlist_info, t.lang)}
        emailTemplate={emailTemplateFor(practice.email_template, t.lang)}
      />

      <section className="card stack" id="rendez-vous">
        <h2>{t('Prise de rendez-vous en ligne')}</h2>
        <BookingForm mode={practice.booking_mode} minNoticeHours={practice.booking_min_notice_hours} />
      </section>

      <section className="card stack" id="autonomes">
        <h2>{t('Patients autonomes')}</h2>
        <p className="hint">{t('Les patients cochés peuvent réserver eux-mêmes en mode « patients autonomes ». La case existe aussi sur la fiche du patient (Planning).')}</p>
        <AutonomousList mode={practice.booking_mode} patients={(patients ?? []).map((p) => ({ id: p.id, name: `${p.last_name} ${p.first_name}`, autonomous: p.autonomous }))} />
      </section>
    </>
  );
}
