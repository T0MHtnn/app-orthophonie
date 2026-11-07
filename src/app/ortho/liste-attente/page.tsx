import type { Metadata } from 'next';
import { Notice } from '@/components/notice';
import Link from 'next/link';
import { SubmitButton } from '@/components/form';
import type { WaitlistEntryRow, WaitlistStatus } from '@/lib/database.types';
import { requireOrtho } from '@/lib/auth';
import { displayAge } from '@/lib/age';
import { emailTemplateFor } from '@/lib/defaults';
import { getT, type T } from '@/lib/i18n';
import { siteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { buildOfferEmail } from '@/lib/offer-email';
import { REQUEST_TYPES, REQUEST_TYPE_LABEL } from '@/lib/request-type';
import { matchesSearch } from '@/lib/search';
import { formatShortDate, parisParts } from '@/lib/time';
import { deleteEntry, markContacted, sendOfferEmail, updateStatus } from './actions';
import { CopyButton, FilterBar } from './client';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('Liste d’attente') };
}

const STATUS_LABEL: Record<WaitlistStatus, string> = {
  attente: 'En attente',
  contacte: 'Place proposée',
  rdv: 'Pris en charge',
  termine: 'Prise en charge terminée',
  retire: 'Retiré',
};

/** Changements de statut manuels proposés selon l'étape (« Place proposée » se fait via l'email). */
const NEXT_STATUS: Record<WaitlistStatus, { status: WaitlistStatus; label: string }[]> = {
  attente: [{ status: 'retire', label: 'Retirer' }],
  contacte: [
    { status: 'rdv', label: 'Prise en charge confirmée' },
    { status: 'attente', label: 'Remettre en attente' },
    { status: 'retire', label: 'Retirer' },
  ],
  rdv: [
    { status: 'termine', label: 'Terminer la prise en charge' },
    { status: 'attente', label: 'Remettre en liste d’attente' },
  ],
  // Terminée : le patient peut refaire une demande ; l'ortho peut reprendre le suivi.
  termine: [{ status: 'rdv', label: 'Reprendre le suivi' }],
  retire: [{ status: 'attente', label: 'Remettre en attente' }],
};

const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(' ');

type Search = Record<string, string | undefined>;

export default async function ListeAttentePage({ searchParams }: { searchParams: Promise<Search> }) {
  const { practice, profile } = await requireOrtho();
  const params = await searchParams;
  const t = await getT();
  const formatDate = (iso: string) => formatShortDate(iso, t.locale);
  const today = parisParts(new Date()).date;
  const supabase = await createClient();

  const [{ data: pathologies }, { data: entries, error }, { data: followedPatients }, { data: missed }] = await Promise.all([
    supabase.from('pathologies').select('code, label').order('sort_order'),
    supabase.from('waitlist_entries').select('*').order('created_at', { ascending: true }),
    supabase.from('patients').select('id, waitlist_entry_id'),
    supabase.from('appointments').select('patient_id').eq('attendance', 'absent'),
  ]);
  // Rendez-vous non honorés (lapins) par demande d'origine.
  const entryOfPatient = new Map((followedPatients ?? []).map((p) => [p.id, p.waitlist_entry_id]));
  const missedByEntry = new Map<string, number>();
  for (const m of missed ?? []) {
    const entry = entryOfPatient.get(m.patient_id);
    if (entry) missedByEntry.set(entry, (missedByEntry.get(entry) ?? 0) + 1);
  }
  const labels = new Map((pathologies ?? []).map((p) => [p.code, t(p.label)]));
  const filter = params.motif && labels.has(params.motif) ? params.motif : '';
  const tab: 'attente' | 'suivis' = params.onglet === 'suivis' ? 'suivis' : 'attente';
  const typeFilter = REQUEST_TYPES.find((r) => r.code === params.type)?.code ?? '';
  const showRemoved = params.retires === '1';
  const query = (params.q ?? '').slice(0, 80);
  const all = entries ?? [];
  // « Pris en charge » quitte la file d'attente pour l'onglet des patients suivis.
  // Case « afficher » : demandes retirées (file d'attente) ou prises en charge terminées (suivis).
  const inTab = (e: WaitlistEntryRow) =>
    tab === 'suivis' ? e.status === 'rdv' || (showRemoved && e.status === 'termine') : e.status === 'attente' || e.status === 'contacte' || (showRemoved && e.status === 'retire');
  const rows = all.filter(
    (e) =>
      inTab(e) &&
      (!filter || e.pathology_code === filter) &&
      (!typeFilter || e.request_type === typeFilter) &&
      matchesSearch(query, [e.patient_first_name, e.patient_last_name, e.caregiver_first_name, e.caregiver_last_name]),
  );
  const waiting = all.filter((e) => e.status === 'attente').length;
  const followed = all.filter((e) => e.status === 'rdv').length;
  const queued = all.filter((e) => e.status === 'attente' || e.status === 'contacte').length;
  const tabHref = (target: 'attente' | 'suivis') => {
    const keep = new URLSearchParams();
    if (target === 'suivis') keep.set('onglet', 'suivis');
    if (query) keep.set('q', query);
    if (filter) keep.set('motif', filter);
    if (typeFilter) keep.set('type', typeFilter);
    const qs = keep.toString();
    return qs ? `?${qs}` : '/ortho/liste-attente';
  };
  const emailFor = all.find((e) => e.id === params.email);
  const deleteFor = all.find((e) => e.id === params.supprimer);
  const publicUrl = `${siteUrl}/c/${practice.slug}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Liste d’attente')}</h1>
          <p className="sub">
            {t(waiting > 1 ? '{n} personnes en attente' : '{n} personne en attente', { n: waiting })} · {t('lien à donner aux patients :')} <a href={publicUrl}>{publicUrl}</a>
          </p>
        </div>
      </div>

      {params.ok === 'contacte' && <Notice kind="ok">{t('Statut passé à « Place proposée ».')}</Notice>}
      {params.ok === 'envoye' && <Notice kind="ok">{t('Email envoyé. Statut passé à « Place proposée ».')}</Notice>}
      {params.erreur === 'envoi' && <p className="alert error">{t('L’email n’a pas pu être envoyé. Réessayez, ou copiez le texte dans votre messagerie.')}</p>}
      {params.erreur === 'email-config' && <p className="alert error">{t('L’envoi d’emails n’est pas encore configuré (clé Brevo manquante). Copiez le texte dans votre messagerie en attendant.')}</p>}
      {params.erreur === 'statut' && <p className="alert error">{t('Le statut n’a pas pu être modifié. Rechargez la page puis réessayez.')}</p>}
      {params.erreur === 'envoye-statut' && <p className="alert error">{t('L’email est bien parti, mais le statut n’a pas pu passer à « Place proposée ». Réessayez avec « Marquer comme contacté sans envoyer ».')}</p>}
      {params.erreur === 'email' && <p className="alert error">{t('Cette personne n’a pas laissé d’adresse email : contactez-la par téléphone.')}</p>}
      <p className="hint">{t('Confirmer la prise en charge déplace la demande dans « Patients pris en charge » et débloque l’espace du patient.')}</p>
      {params.ok === 'supprime' && <Notice kind="ok">{t('Inscription supprimée définitivement.')}</Notice>}
      {error && <p className="alert error">{t('Impossible de charger la liste. Rechargez la page.')}</p>}

      <nav className="tabs" aria-label={t('Listes')}>
        <Link href={tabHref('attente')} aria-current={tab === 'attente' ? 'page' : undefined}>
          {t('File d’attente')} <span className="count">{queued}</span>
        </Link>
        <Link href={tabHref('suivis')} aria-current={tab === 'suivis' ? 'page' : undefined}>
          {t('Patients pris en charge')} <span className="count">{followed}</span>
        </Link>
      </nav>

      <FilterBar key={tab} pathologies={(pathologies ?? []).map((p) => ({ code: p.code, label: t(p.label) }))} requestTypes={REQUEST_TYPES.map(({ code, label }) => ({ code, label: t(label) }))} showRemovedLabel={tab === 'suivis' ? 'Afficher les prises en charge terminées' : 'Afficher les demandes retirées'} />

      {/* L'email part en français (langue des familles), sauf modèle personnalisé par l'ortho. */}
      {emailFor && <EmailPreview t={t} entry={emailFor} template={emailTemplateFor(practice.email_template, 'fr')} orthoName={profile.full_name} practiceName={practice.name} />}
      {deleteFor && <DeleteConfirm t={t} entry={deleteFor} />}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('Inscrit le')}</th>
              <th>{t('Patient')}</th>
              <th>{t('Motif')}</th>
              <th>{t('Contact')}</th>
              <th>{t('Statut')}</th>
              <th>
                <span className="sr-only">{t('Actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="num">{formatDate(e.created_at)}</td>
                <td>
                  <b>{fullName(e.patient_first_name, e.patient_last_name)}</b>
                  <small>
                    {displayAge(e.birth_date, e.patient_age, today, t.lang)}
                    {e.caregiver_last_name || e.caregiver_first_name ? ` · ${fullName(e.caregiver_first_name, e.caregiver_last_name)}` : ''}
                  </small>
                  {e.notes && <small>{e.notes}</small>}
                </td>
                <td>
                  {labels.get(e.pathology_code) ?? e.pathology_code}
                  <small>{t(REQUEST_TYPE_LABEL[e.request_type])}</small>
                </td>
                <td>
                  {e.email && <small>{e.email}</small>}
                  {e.phone && <small>{e.phone}</small>}
                </td>
                <td>
                  <span className={`badge ${e.status}`}>{t(STATUS_LABEL[e.status])}</span>
                  {e.contacted_at && <small>{t('contacté le {date}', { date: formatDate(e.contacted_at) })}</small>}
                  {(missedByEntry.get(e.id) ?? 0) > 0 && (
                    <small className="absences">
                      {t((missedByEntry.get(e.id) ?? 0) > 1 ? '{n} rendez-vous non honorés' : '{n} rendez-vous non honoré', { n: missedByEntry.get(e.id) ?? 0 })}
                    </small>
                  )}
                </td>
                <td>
                  <div className="row">
                    {(e.status === 'attente' || e.status === 'contacte') && (
                      <Link className="btn small" href={`?email=${e.id}${filter ? `&motif=${filter}` : ''}`}>
                        {t(e.status === 'contacte' ? 'Renvoyer l’email' : 'Proposer une place')}
                      </Link>
                    )}
                    {NEXT_STATUS[e.status].map((next) => (
                      <form key={next.status} action={updateStatus}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="status" value={next.status} />
                        <SubmitButton className="btn small">{t(next.label)}</SubmitButton>
                      </form>
                    ))}
                    <Link className="linkbtn" href={`?supprimer=${e.id}${tab === 'suivis' ? '&onglet=suivis' : ''}`}>
                      {t('Supprimer')}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="hint" style={{ padding: 16 }}>
            {t(
              query || filter || typeFilter
                ? 'Aucun résultat pour cette recherche.'
                : tab === 'suivis'
                  ? 'Aucun patient pris en charge pour l’instant.'
                  : 'Personne pour l’instant. Partagez le lien de votre page publique à vos patients.',
            )}
          </p>
        )}
      </div>
    </>
  );
}

function EmailPreview({ t, entry, template, orthoName, practiceName }: { t: T; entry: WaitlistEntryRow; template: string; orthoName: string; practiceName: string }) {
  const text = buildOfferEmail(template, entry, orthoName, practiceName);
  const [subjectLine, ...rest] = text.split('\n');
  const subject = subjectLine?.replace(/^(?:Objet|Subject)\s*:\s*/i, '') ?? '';
  const body = rest.join('\n').trim();
  const mailto = entry.email ? `mailto:${entry.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;

  return (
    <section className="card stack" aria-label={t('Email place libérée')}>
      <div className="row spread">
        <div>
          <h2>{t('Email à {nom}', { nom: fullName(entry.caregiver_first_name, entry.caregiver_last_name) || fullName(entry.patient_first_name, entry.patient_last_name) })}</h2>
          <p className="sub">{entry.email ?? t('Pas d’email, appeler le {tel}', { tel: entry.phone ?? '' })}</p>
        </div>
        <Link href="/ortho/liste-attente" className="btn small">
          {t('Fermer')}
        </Link>
      </div>
      <pre className="email-body">{text}</pre>
      <div className="row">
        {entry.email && (
          <form action={sendOfferEmail}>
            <input type="hidden" name="id" value={entry.id} />
            <SubmitButton pendingText="Envoi…">Envoyer l’email</SubmitButton>
          </form>
        )}
        <CopyButton text={text} />
        {mailto && (
          <a className="btn" href={mailto}>
            {t('Ouvrir dans ma messagerie')}
          </a>
        )}
        <form action={markContacted}>
          <input type="hidden" name="id" value={entry.id} />
          <SubmitButton className="btn">Marquer comme contacté sans envoyer</SubmitButton>
        </form>
      </div>
      <p className="hint">{t('Si le patient répond, sa réponse arrive directement dans votre boîte email. Le modèle se modifie dans les Réglages.')}</p>
    </section>
  );
}

function DeleteConfirm({ t, entry }: { t: T; entry: WaitlistEntryRow }) {
  return (
    <section className="card stack" aria-label={t('Confirmer la suppression')}>
      <h2>{t('Supprimer {nom} ?', { nom: fullName(entry.patient_first_name, entry.patient_last_name) })}</h2>
      <p className="sub">{t('La suppression est définitive (par exemple à la demande du patient). Pour garder une trace, préférez le statut « Retiré ».')}</p>
      <div className="row">
        <form action={deleteEntry}>
          <input type="hidden" name="id" value={entry.id} />
          <SubmitButton className="btn danger">Supprimer définitivement</SubmitButton>
        </form>
        <Link href="/ortho/liste-attente" className="btn">
          {t('Annuler')}
        </Link>
      </div>
    </section>
  );
}
