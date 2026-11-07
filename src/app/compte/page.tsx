import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/auth';
import { getDict } from '@/lib/i18n';
import { THEME_COOKIE, isTheme } from '@/lib/preferences';
import { cookies } from 'next/headers';
import { AccountForm } from './account-form';
import { LanguageSwitch, ThemeSelect } from './preferences';

export const metadata: Metadata = { title: 'Mon compte' };

/** Informations du titulaire du compte (ortho ou famille). L'âge reste sur chaque demande / fiche patient. */
export default async function ComptePage() {
  const ctx = await requireUser();
  if (ctx.hasMfa && ctx.aal !== 'aal2') redirect('/mfa/verifier?suivant=%2Fcompte');
  const { lang, t } = await getDict();
  const theme = (await cookies()).get(THEME_COOKIE)?.value;

  return (
    <AppShell ctx={ctx}>
      <div className="page-head">
        <div>
          <h1>{t.account.title}</h1>
          <p className="sub">
            {t.account.connectedAs} <b>{ctx.email}</b>
          </p>
        </div>
      </div>
      <section className="card stack">
        <h2>{t.account.info}</h2>
        <AccountForm firstName={ctx.profile.first_name} lastName={ctx.profile.last_name} labels={t.account} />
      </section>
      <section className="card stack">
        <h2>{t.account.security}</h2>
        <Link href="/compte/mot-de-passe" className="btn" style={{ width: 'fit-content' }}>
          {t.account.changePassword}
        </Link>
      </section>
      <section className="card stack">
        <h2>{t.account.display}</h2>
        <div className="stack">
          <h3>{t.account.language}</h3>
          <LanguageSwitch lang={lang} label={t.account.language} />
          <p className="hint">{t.account.languageHint}</p>
        </div>
        <div className="stack">
          <ThemeSelect theme={isTheme(theme) ? theme : 'system'} lang={lang} label={t.account.theme} />
          <p className="hint">{t.account.themeHint}</p>
        </div>
      </section>
    </AppShell>
  );
}
