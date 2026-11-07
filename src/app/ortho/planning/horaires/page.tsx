import type { Metadata } from 'next';
import { SubmitButton } from '@/components/form';
import { requireOrtho } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { WEEKDAYS, formatDay, formatTime, parisParts } from '@/lib/time';
import { deleteOpeningHour, deleteScheduleException } from '../actions';
import { PlanningTabs } from '../tabs';
import { ExceptionForm, OpeningHourForm, SessionForm } from './forms';

export const metadata: Metadata = { title: 'Horaires d’ouverture' };

/** Horaires récurrents de la semaine + fermetures / ouvertures ponctuelles. Aucune fermeture au départ. */
export default async function HorairesPage() {
  const { practice } = await requireOrtho();
  const now = new Date();
  const supabase = await createClient();
  const [{ data: hours }, { data: exceptions }] = await Promise.all([
    supabase.from('opening_hours').select('*').order('weekday').order('starts_at'),
    supabase.from('schedule_exceptions').select('*').gt('ends_at', now.toISOString()).order('starts_at'),
  ]);

  const when = (iso: string) => {
    const p = parisParts(new Date(iso));
    return `${formatDay(p.date)} ${formatTime(p.time)}`;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Planning</h1>
          <p className="sub">Vos horaires servent à afficher les créneaux libres (et, bientôt, la réservation en ligne).</p>
        </div>
      </div>
      <PlanningTabs current="horaires" />

      <section className="card stack">
        <h2>Séances</h2>
        <SessionForm sessionMinutes={practice.session_minutes} />
        <p className="hint">Durée proposée par défaut pour un nouveau rendez-vous, et taille des créneaux libres dans l’agenda.</p>
      </section>

      <section className="card stack">
        <h2>Horaires de la semaine</h2>
        {(hours ?? []).length === 0 ? (
          <p className="hint">Aucune plage pour l’instant. Ajoutez par exemple « Lundi de 9 h à 12 h » puis « Lundi de 14 h à 19 h ».</p>
        ) : (
          <div>
            {WEEKDAYS.map((label, i) => {
              const ranges = (hours ?? []).filter((h) => h.weekday === i + 1);
              if (ranges.length === 0) return null;
              return (
                <div key={label} className="request">
                  <b style={{ minWidth: 90 }}>{label}</b>
                  <div className="row">
                    {ranges.map((h) => (
                      <form key={h.id} action={deleteOpeningHour} className="chip">
                        <input type="hidden" name="id" value={h.id} />
                        {formatTime(h.starts_at)} – {formatTime(h.ends_at)}
                        <button type="submit" className="chip-x" aria-label={`Supprimer ${label} ${formatTime(h.starts_at)} – ${formatTime(h.ends_at)}`}>
                          ×
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <h3>Ajouter une plage</h3>
        <OpeningHourForm />
      </section>

      <section className="card stack">
        <h2>Fermetures et ouvertures ponctuelles</h2>
        {(exceptions ?? []).length === 0 ? (
          <p className="hint">Aucune fermeture prévue.</p>
        ) : (
          <div>
            {(exceptions ?? []).map((x) => (
              <div key={x.id} className="request">
                <div>
                  <span className={`badge ${x.kind === 'ferme' ? 'attente' : 'rdv'}`}>{x.kind === 'ferme' ? 'Fermé' : 'Ouvert'}</span> {x.label}
                  <div className="hint">
                    du {when(x.starts_at)} au {when(x.ends_at)}
                  </div>
                </div>
                <form action={deleteScheduleException}>
                  <input type="hidden" name="id" value={x.id} />
                  <SubmitButton className="btn small">Supprimer</SubmitButton>
                </form>
              </div>
            ))}
          </div>
        )}
        <h3>Ajouter</h3>
        <ExceptionForm today={parisParts(now).date} />
      </section>
    </>
  );
}
