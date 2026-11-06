import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmitButton } from '@/components/form';
import type { WaitlistEntryRow, WaitlistStatus } from '@/lib/database.types';
import { requireOrtho } from '@/lib/auth';
import { DEFAULT_EMAIL_TEMPLATE } from '@/lib/defaults';
import { siteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { fillTemplate } from '@/lib/text';
import { deleteEntry, markContacted, updateStatus } from './actions';
import { AutoSubmitSelect, CopyButton } from './client';

export const metadata: Metadata = { title: 'Liste d’attente' };

const STATUS_LABEL: Record<WaitlistStatus, string> = { attente: 'En attente', contacte: 'Contacté', rdv: 'RDV pris', retire: 'Retiré' };

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
  const showRemoved = params.retires === '1';
  const rows = (entries ?? []).filter((e) => (!filter || e.pathology_code === filter) && (showRemoved || e.status !== 'retire'));
  const waiting = (entries ?? []).filter((e) => e.status === 'attente').length;
  const emailFor = rows.find((e) => e.id === params.email);
  const deleteFor = rows.find((e) => e.id === params.supprimer);
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

      {params.ok === 'contacte' && <p className="alert ok">Statut passé à « Contacté ».</p>}
      {params.ok === 'supprime' && <p className="alert ok">Inscription supprimée définitivement.</p>}
      {error && <p className="alert error">Impossible de charger la liste. Rechargez la page.</p>}

      <form className="row" method="get">
        <label className="row sub">
          Motif
          <select name="motif" defaultValue={filter} className="field-inline">
            <option value="">Tous</option>
            {(pathologies ?? []).map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" name="retires" value="1" defaultChecked={showRemoved} /> Afficher les retirés
        </label>
        <button className="btn small" type="submit">
          Filtrer
        </button>
      </form>

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
                <td>{labels.get(e.pathology_code) ?? e.pathology_code}</td>
                <td>
                  {e.email && <small>{e.email}</small>}
                  {e.phone && <small>{e.phone}</small>}
                </td>
                <td>
                  <form action={updateStatus} className="row">
                    <input type="hidden" name="id" value={e.id} />
                    <AutoSubmitSelect name="status" defaultValue={e.status} aria-label={`Statut de ${e.patient_first_name}`}>
                      {Object.entries(STATUS_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </AutoSubmitSelect>
                    <noscript>
                      <button className="btn small">OK</button>
                    </noscript>
                  </form>
                  {e.contacted_at && <small>contacté le {formatDate(e.contacted_at)}</small>}
                </td>
                <td>
                  <div className="row">
                    <Link className="btn small" href={`?email=${e.id}${filter ? `&motif=${filter}` : ''}`}>
                      Proposer une place
                    </Link>
                    <Link className="linkbtn" href={`?supprimer=${e.id}`}>
                      Supprimer
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="hint" style={{ padding: 16 }}>Personne pour l’instant. Partagez le lien de votre page publique aux familles.</p>}
      </div>
    </>
  );
}

function EmailPreview({ entry, template, orthoName, practiceName }: { entry: WaitlistEntryRow; template: string; orthoName: string; practiceName: string }) {
  const caregiver = entry.caregiver_first_name || entry.patient_first_name;
  const text = fillTemplate(template, {
    aidant: caregiver,
    patient: entry.patient_first_name,
    // Le lien de réservation arrivera avec le module Planning.
    lien: '[lien de réservation, disponible avec le module Planning]',
    orthophoniste: orthoName,
    cabinet: practiceName,
  });
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
        <CopyButton text={text} />
        {mailto && (
          <a className="btn" href={mailto}>
            Ouvrir dans ma messagerie
          </a>
        )}
        <form action={markContacted}>
          <input type="hidden" name="id" value={entry.id} />
          <SubmitButton>Marquer comme contacté</SubmitButton>
        </form>
      </div>
      <p className="hint">Le modèle se modifie dans les Réglages. L’envoi direct depuis l’app arrivera avec un service d’email conforme.</p>
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
