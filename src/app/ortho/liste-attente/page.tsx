import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmitButton } from '@/components/form';
import type { WaitlistEntryRow, WaitlistStatus } from '@/lib/database.types';
import { requireOrtho } from '@/lib/auth';
import { DEFAULT_EMAIL_TEMPLATE } from '@/lib/defaults';
import { siteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { buildOfferEmail } from '@/lib/offer-email';
import { REQUEST_TYPES, REQUEST_TYPE_LABEL } from '@/lib/request-type';
import { matchesSearch } from '@/lib/search';
import { deleteEntry, markContacted, sendOfferEmail, updateStatus } from './actions';
import { CopyButton, FilterBar } from './client';

export const metadata: Metadata = { title: 'Liste d’attente' };

const STATUS_LABEL: Record<WaitlistStatus, string> = { attente: 'En attente', contacte: 'Place proposée', rdv: 'Pris en charge', retire: 'Retiré' };

/** Changements de statut manuels proposés selon l'étape (« Place proposée » se fait via l'email). */
const NEXT_STATUS: Record<WaitlistStatus, { status: WaitlistStatus; label: string }[]> = {
  attente: [{ status: 'retire', label: 'Retirer' }],
  contacte: [
    { status: 'rdv', label: 'Prise en charge confirmée' },
    { status: 'attente', label: 'Remettre en attente' },
    { status: 'retire', label: 'Retirer' },
  ],
  rdv: [{ status: 'attente', label: 'Remettre en liste d’attente' }],
  retire: [{ status: 'attente', label: 'Remettre en attente' }],
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' });
const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(' ');

type Search = Record<string, string | undefined>;

export default async function ListeAttentePage({ searchParams }: { searchParams: Promise<Search> }) {
  const { practice, profile } = await requireOrtho();
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: pathologies }, { data: entries, error }] = await Promise.all([
    supabase.from('pathologies').select('code, label').order('sort_order'),
    supabase.from('waitlist_entries').select('*').order('created_at', { ascending: true }),
  ]);
  const labels = new Map((pathologies ?? []).map((p) => [p.code, p.label]));
  const filter = params.motif && labels.has(params.motif) ? params.motif : '';
  const tab: 'attente' | 'suivis' = params.onglet === 'suivis' ? 'suivis' : 'attente';
  const typeFilter = REQUEST_TYPES.find((t) => t.code === params.type)?.code ?? '';
  const showRemoved = params.retires === '1';
  const query = (params.q ?? '').slice(0, 80);
  const all = entries ?? [];
  // « Pris en charge » quitte la file d'attente pour l'onglet des patients suivis.
  const inTab = (e: WaitlistEntryRow) => (tab === 'suivis' ? e.status === 'rdv' : e.status === 'attente' || e.status === 'contacte' || (showRemoved && e.status === 'retire'));
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
  const tabHref = (t: 'attente' | 'suivis') => {
    const keep = new URLSearchParams();
    if (t === 'suivis') keep.set('onglet', 'suivis');
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
          <h1>Liste d’attente</h1>
          <p className="sub">
            {waiting} personne{waiting > 1 ? 's' : ''} en attente · lien à donner aux familles : <a href={publicUrl}>{publicUrl}</a>
          </p>
        </div>
      </div>

      {params.ok === 'contacte' && <p className="alert ok">Statut passé à « Place proposée ».</p>}
      {params.ok === 'envoye' && <p className="alert ok">Email envoyé. Statut passé à « Place proposée ».</p>}
      {params.erreur === 'envoi' && <p className="alert error">L’email n’a pas pu être envoyé. Réessayez, ou copiez le texte dans votre messagerie.</p>}
      {params.erreur === 'email-config' && <p className="alert error">L’envoi d’emails n’est pas encore configuré (clé Brevo manquante). Copiez le texte dans votre messagerie en attendant.</p>}
      {params.erreur === 'statut' && <p className="alert error">Le statut n’a pas pu être modifié. Rechargez la page puis réessayez.</p>}
      {params.erreur === 'envoye-statut' && <p className="alert error">L’email est bien parti, mais le statut n’a pas pu passer à « Place proposée ». Réessayez avec « Marquer comme contacté sans envoyer ».</p>}
      {params.erreur === 'email' && <p className="alert error">Cette personne n’a pas laissé d’adresse email : contactez-la par téléphone.</p>}
      <p className="hint">Confirmer la prise en charge déplace la demande dans « Patients pris en charge » et débloque l’espace patient de la famille.</p>
      {params.ok === 'supprime' && <p className="alert ok">Inscription supprimée définitivement.</p>}
      {error && <p className="alert error">Impossible de charger la liste. Rechargez la page.</p>}

      <nav className="tabs" aria-label="Listes">
        <Link href={tabHref('attente')} aria-current={tab === 'attente' ? 'page' : undefined}>
          File d’attente <span className="count">{queued}</span>
        </Link>
        <Link href={tabHref('suivis')} aria-current={tab === 'suivis' ? 'page' : undefined}>
          Patients pris en charge <span className="count">{followed}</span>
        </Link>
      </nav>

      <FilterBar key={tab} pathologies={pathologies ?? []} requestTypes={REQUEST_TYPES.map(({ code, label }) => ({ code, label }))} showRemovedToggle={tab === 'attente'} />

      {emailFor && <EmailPreview entry={emailFor} template={practice.email_template || DEFAULT_EMAIL_TEMPLATE} orthoName={profile.full_name} practiceName={practice.name} />}
      {deleteFor && <DeleteConfirm entry={deleteFor} />}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Inscrit le</th>
              <th>Patient</th>
              <th>Motif</th>
              <th>Contact</th>
              <th>Statut</th>
              <th>
                <span className="sr-only">Actions</span>
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
                    {e.patient_age}
                    {e.caregiver_last_name || e.caregiver_first_name ? ` · ${fullName(e.caregiver_first_name, e.caregiver_last_name)}` : ''}
                  </small>
                  {e.notes && <small>{e.notes}</small>}
                </td>
                <td>
                  {labels.get(e.pathology_code) ?? e.pathology_code}
                  <small>{REQUEST_TYPE_LABEL[e.request_type]}</small>
                </td>
                <td>
                  {e.email && <small>{e.email}</small>}
                  {e.phone && <small>{e.phone}</small>}
                </td>
                <td>
                  <span className={`badge ${e.status}`}>{STATUS_LABEL[e.status]}</span>
                  {e.contacted_at && <small>contacté le {formatDate(e.contacted_at)}</small>}
                </td>
                <td>
                  <div className="row">
                    {(e.status === 'attente' || e.status === 'contacte') && (
                      <Link className="btn small" href={`?email=${e.id}${filter ? `&motif=${filter}` : ''}`}>
                        {e.status === 'contacte' ? 'Renvoyer l’email' : 'Proposer une place'}
                      </Link>
                    )}
                    {NEXT_STATUS[e.status].map((next) => (
                      <form key={next.status} action={updateStatus}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="status" value={next.status} />
                        <SubmitButton className="btn small">{next.label}</SubmitButton>
                      </form>
                    ))}
                    <Link className="linkbtn" href={`?supprimer=${e.id}${tab === 'suivis' ? '&onglet=suivis' : ''}`}>
                      Supprimer
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="hint" style={{ padding: 16 }}>
            {query || filter || typeFilter
              ? 'Aucun résultat pour cette recherche.'
              : tab === 'suivis'
                ? 'Aucun patient pris en charge pour l’instant.'
                : 'Personne pour l’instant. Partagez le lien de votre page publique aux familles.'}
          </p>
        )}
      </div>
    </>
  );
}

function EmailPreview({ entry, template, orthoName, practiceName }: { entry: WaitlistEntryRow; template: string; orthoName: string; practiceName: string }) {
  const caregiver = entry.caregiver_first_name || entry.patient_first_name;
  const text = buildOfferEmail(template, entry, orthoName, practiceName);
  const [subjectLine, ...rest] = text.split('\n');
  const subject = subjectLine?.replace(/^Objet\s*:\s*/i, '') ?? '';
  const body = rest.join('\n').trim();
  const mailto = entry.email ? `mailto:${entry.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;

  return (
    <section className="card stack" aria-label="Email place libérée">
      <div className="row spread">
        <div>
          <h2>Email à {fullName(entry.caregiver_first_name, entry.caregiver_last_name) || fullName(entry.patient_first_name, entry.patient_last_name)}</h2>
          <p className="sub">{entry.email ?? `Pas d’email, appeler le ${entry.phone}`}</p>
        </div>
        <Link href="/ortho/liste-attente" className="btn small">
          Fermer
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
            Ouvrir dans ma messagerie
          </a>
        )}
        <form action={markContacted}>
          <input type="hidden" name="id" value={entry.id} />
          <SubmitButton className="btn">Marquer comme contacté sans envoyer</SubmitButton>
        </form>
      </div>
      <p className="hint">Si la famille répond, sa réponse arrive directement dans votre boîte email. Le modèle se modifie dans les Réglages.</p>
    </section>
  );
}

function DeleteConfirm({ entry }: { entry: WaitlistEntryRow }) {
  return (
    <section className="card stack" aria-label="Confirmer la suppression">
      <h2>Supprimer {fullName(entry.patient_first_name, entry.patient_last_name)} ?</h2>
      <p className="sub">La suppression est définitive (par exemple à la demande de la famille). Pour garder une trace, préférez le statut « Retiré ».</p>
      <div className="row">
        <form action={deleteEntry}>
          <input type="hidden" name="id" value={entry.id} />
          <SubmitButton className="btn danger">Supprimer définitivement</SubmitButton>
        </form>
        <Link href="/ortho/liste-attente" className="btn">
          Annuler
        </Link>
      </div>
    </section>
  );
}
