import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { THEME_COOKIE, isTheme } from '@/lib/preferences';
import { AccountForm } from './account-form';
import { LanguageSwitch, ThemeSelect } from './preferences';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Mon compte') };
}

/** Informations du titulaire du compte (ortho ou famille). L'âge reste sur chaque demande / fiche patient. */
export default async function ComptePage() {
  const ctx = await requireUser();
  if (ctx.hasMfa && ctx.aal !== 'aal2') redirect('/mfa/verifier?suivant=%2Fcompte');
  const t = await getT();
  const theme = (await cookies()).get(THEME_COOKIE)?.value;

  return (
    <AppShell ctx={ctx}>
      <div className="page-head">
        <div>
          <h1>{t('Mon compte')}</h1>
          <p className="sub">
            {t('Connecté avec')} <b>{ctx.email}</b>
          </p>
        </div>
      </div>
      {ctx.profile.role === 'ortho' && (
        <section className="card row spread">
          <div>
            <h2>{t('Réglages du cabinet')}</h2>
            <p className="sub">{t('Cabinet, liste d’attente, email type, prise de rendez-vous en ligne.')}</p>
          </div>
          <Link href="/ortho/reglages" className="btn">
            {t('Modifier les réglages du cabinet')}
          </Link>
        </section>
      )}
      <section className="card stack">
        <h2>{t('Mes informations')}</h2>
        <AccountForm firstName={ctx.profile.first_name} lastName={ctx.profile.last_name} />
      </section>
      <section className="card stack">
        <h2>{t('Sécurité')}</h2>
        <Link href="/compte/mot-de-passe" className="btn" style={{ width: 'fit-content' }}>
          {t('Changer mon mot de passe')}
        </Link>
      </section>
      <section className="card stack">
        <h2>{t('Affichage')}</h2>
        <div className="stack">
          <h3>{t('Langue')}</h3>
          <LanguageSwitch lang={t.lang} label={t('Langue')} />
        </div>
        <div className="stack">
          <ThemeSelect theme={isTheme(theme) ? theme : 'system'} lang={t.lang} label={t('Thème')} />
          <p className="hint">{t('Appliqué tout de suite, et gardé sur cet appareil.')}</p>
        </div>
      </section>
    </AppShell>
  );
}
