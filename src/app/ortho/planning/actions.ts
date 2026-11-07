'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/form';
import { requireOrtho } from '@/lib/auth';
import type { ScheduleBlockRow } from '@/lib/database.types';
import { sendEmail } from '@/lib/email';
import { sendSlotOffers } from '@/lib/slot-offers';
import { getT } from '@/lib/i18n';
import { siteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { formatDay, formatTime, parisParts, parisToInstant } from '@/lib/time';
import { appointmentSchema, blockSchema, fieldErrors } from '@/lib/validation';

const idSchema = z.uuid();
const str = (formData: FormData, k: string) => String(formData.get(k) ?? '');
/** Erreurs de validation : toujours un message visible en plus des champs encadrés. */
const invalid = async (errors: Record<string, string>, values: Record<string, string>): Promise<FormState> => {
  const t = await getT();
  return { message: `${t('À corriger :')} ${Object.values(errors).map((e) => t(e)).join(' · ')}`, errors, values };
};
const done = (message: string): FormState => {
  revalidatePath('/ortho/planning');
  return { ok: true, message };
};

/**
 * Chaque action revérifie l'accès (requireOrtho). La base revérifie le cabinet,
 * la double authentification, les chevauchements (P0409) et les blocages (P0410).
 */
export async function saveAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const raw = Object.fromEntries(['id', 'patientId', 'date', 'time', 'end', 'duration', 'title', 'notify'].map((k) => [k, str(formData, k)]));
  const parsed = appointmentSchema.safeParse({ ...raw, notify: raw.notify || undefined });
  if (!parsed.success) return await invalid(fieldErrors(parsed.error), raw);

  const d = parsed.data;
  const start = parisToInstant(d.date, d.time);
  const end = new Date(start.getTime() + d.minutes * 60_000);
  const notify = d.notify === 'on';
  const supabase = await createClient();
  // Ancienne date, lue avant l'enregistrement, pour l'email « séance du … déplacée au … ».
  const { data: before } = notify && d.id ? await supabase.from('appointments').select('starts_at').eq('id', d.id).maybeSingle() : { data: null };
  const { error } = await supabase.rpc('save_appointment', {
    p_id: d.id || null,
    p_patient_id: d.patientId,
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
    p_title: d.title,
    p_notify: notify,
  });
  if (error?.code === 'P0409') return { errors: { time: 'Ce créneau chevauche un autre rendez-vous.' }, message: 'Ce créneau chevauche un autre rendez-vous.', values: raw };
  if (error?.code === 'P0410') return { errors: { time: 'Ce créneau est bloqué.' }, message: 'Ce créneau est bloqué dans votre planning.', values: raw };
  if (error) {
    console.error('save_appointment', error.code);
    return { message: 'Le rendez-vous n’a pas pu être enregistré. Rechargez la page puis réessayez.', values: raw };
  }
  if (notify) await notifyFamily(d.patientId, start, practice.name, d.id ? 'deplace' : 'nouveau', before ? new Date(before.starts_at) : undefined);
  return done(notify ? 'Rendez-vous enregistré. Le patient est prévenu par email.' : d.id ? 'Rendez-vous modifié.' : 'Rendez-vous ajouté.');
}

/** RDV annulé par l'ortho : il quitte l'agenda, la raison reste visible côté patient. */
export async function deleteAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return { message: 'Rendez-vous introuvable.' };
  const notify = formData.get('notify') === 'on';
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 500);
  const supabase = await createClient();
  const { data: appt } = await supabase.from('appointments').select('patient_id, starts_at').eq('id', id.data).maybeSingle();
  const { data, error } = await supabase.rpc('cancel_by_ortho', { p_id: id.data, p_reason: reason });
  if (error || !data) {
    if (error) console.error('cancel_by_ortho', error.code);
    return { message: 'Le rendez-vous n’a pas pu être supprimé. Rechargez la page puis réessayez.' };
  }
  if (notify && appt && new Date(appt.starts_at) > new Date()) {
    await notifyFamily(appt.patient_id, new Date(appt.starts_at), practice.name, 'annule', undefined, reason);
    return done('Rendez-vous supprimé. Le patient est prévenu par email.');
  }
  return done('Rendez-vous supprimé.');
}

/** Ajoute ou modifie un blocage. Sur une série : toute la série, ou ce jour seulement. */
export async function saveBlock(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const raw = Object.fromEntries(['id', 'title', 'date', 'start', 'end', 'recurrence', 'until', 'scope', 'occurrence'].map((k) => [k, str(formData, k)]));
  const parsed = blockSchema.safeParse({ ...raw, weekdays: formData.getAll('weekdays').map(String) });
  const echo = { ...raw, weekdays: formData.getAll('weekdays').map(String).join(',') };
  if (!parsed.success) return await invalid(fieldErrors(parsed.error), echo);

  const d = parsed.data;
  const row = {
    title: d.title,
    starts_at: parisToInstant(d.date, d.start).toISOString(),
    ends_at: parisToInstant(d.date, d.end).toISOString(),
    recurrence: d.recurrence,
    weekdays: d.recurrence === 'weekdays' ? [...new Set(d.weekdays)].sort() : [],
    until: d.recurrence === 'none' ? null : d.until || null,
  };
  const supabase = await createClient();

  if (!d.id) {
    const { error } = await supabase.from('schedule_blocks').insert({ ...row, practice_id: practice.id, skip_dates: [] });
    if (error) return failed('insert_block', error.code, echo);
    return done('Créneau bloqué.');
  }

  const { data: existing } = await supabase.from('schedule_blocks').select('*').eq('id', d.id).maybeSingle();
  if (!existing) return { message: 'Ce blocage n’existe plus. Rechargez la page.', values: echo };

  if (d.scope === 'jour' && existing.recurrence !== 'none' && d.occurrence) {
    // Ce jour seulement : on retire l'occurrence de la série et on crée un blocage ponctuel.
    const skip = await skipOccurrence(existing, d.occurrence);
    if (skip) return failed('skip_block', skip, echo);
    const { error } = await supabase
      .from('schedule_blocks')
      .insert({ ...row, recurrence: 'none', weekdays: [], until: null, practice_id: practice.id, skip_dates: [] });
    if (error) return failed('insert_block', error.code, echo);
    return done('Blocage modifié pour ce jour.');
  }

  // Toute la série : elle garde son premier jour (sinon les occurrences passées disparaîtraient),
  // seuls les horaires, le titre et la répétition changent.
  if (existing.recurrence !== 'none' && d.recurrence !== 'none') {
    const first = parisParts(new Date(existing.starts_at)).date;
    row.starts_at = parisToInstant(first, d.start).toISOString();
    row.ends_at = parisToInstant(first, d.end).toISOString();
  }
  const { error } = await supabase.from('schedule_blocks').update(row).eq('id', d.id);
  if (error) return failed('update_block', error.code, echo);
  return done('Blocage modifié.');
}

export async function deleteBlock(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return { message: 'Blocage introuvable.' };
  const scope = str(formData, 'scope');
  if (scope !== 'jour' && scope !== 'serie') return { message: 'Choix manquant. Rechargez la page puis réessayez.' };
  const occurrence = str(formData, 'occurrence');
  const supabase = await createClient();
  const { data: existing } = await supabase.from('schedule_blocks').select('*').eq('id', id.data).maybeSingle();
  if (!existing) return done('Blocage supprimé.');

  if (scope === 'jour' && existing.recurrence !== 'none' && /^\d{4}-\d{2}-\d{2}$/.test(occurrence)) {
    const skip = await skipOccurrence(existing, occurrence);
    if (skip) return failed('skip_block', skip, {});
    return done('Blocage supprimé pour ce jour.');
  }
  const { error } = await supabase.from('schedule_blocks').delete().eq('id', id.data);
  if (error) return failed('delete_block', error.code, {});
  return done('Blocage supprimé.');
}

/** Retire un jour d'une série (renvoie un code d'erreur, ou null). */
async function skipOccurrence(block: ScheduleBlockRow, date: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('schedule_blocks')
    .update({ skip_dates: [...new Set([...block.skip_dates, date])] })
    .eq('id', block.id);
  return error ? (error.code ?? 'error') : null;
}

function failed(where: string, code: string | undefined, values: Record<string, string>): FormState {
  console.error(where, code);
  return { message: 'Enregistrement impossible. Rechargez la page puis réessayez.', values };
}

/** Réservation « à valider » faite en ligne : l'ortho accepte ou refuse, la famille est prévenue par email. */
export async function reviewAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { practice } = await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  const decision = formData.get('decision');
  if (!id.success || (decision !== 'accepter' && decision !== 'refuser')) return { message: 'Décision manquante. Rechargez la page puis réessayez.' };
  const accept = decision === 'accepter';
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('review_appointment', { p_id: id.data, p_accept: accept });
  if (error || !data) {
    if (error) console.error('review_appointment', error.code);
    return { message: 'Cette demande a déjà été traitée ou annulée. Rechargez la page.' };
  }

  // Email à la famille : date et heure seulement, aucune donnée médicale.
  const { data: appt } = await supabase.from('appointments').select('starts_at, patient_id').eq('id', id.data).maybeSingle();
  const { data: patient } = appt ? await supabase.from('patients').select('first_name, email').eq('id', appt.patient_id).maybeSingle() : { data: null };
  if (appt && patient?.email) {
    const p = parisParts(new Date(appt.starts_at));
    const when = `${formatDay(p.date)} à ${formatTime(p.time)}`;
    await sendEmail({
      to: { email: patient.email },
      senderName: practice.name,
      subject: accept ? `Séance confirmée le ${when}` : `Séance non confirmée – ${practice.name}`,
      text: [
        'Bonjour,',
        accept
          ? `La séance de ${patient.first_name} du ${when} est confirmée par ${practice.name}.`
          : `La séance demandée pour ${patient.first_name} le ${when} n’a pas pu être acceptée par ${practice.name}. Vous pouvez choisir un autre créneau depuis votre espace.`,
        `${siteUrl}/patient`,
      ].join('\n\n'),
    });
  }
  return done(accept ? 'Demande acceptée : le patient est prévenu par email.' : 'Demande refusée : le patient est prévenu par email.');
}

/** Séance passée : « non honoré » (lapin) ou retour à « réalisé ». */
export async function markAttendance(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  const value = formData.get('attendance');
  if (!id.success || (value !== 'absent' && value !== 'realise')) return { message: 'Choix manquant. Rechargez la page puis réessayez.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mark_attendance', { p_id: id.data, p_attendance: value === 'absent' ? 'absent' : null });
  if (error || !data) {
    if (error) console.error('mark_attendance', error.code);
    return { message: 'Le changement n’a pas pu être enregistré. Rechargez la page puis réessayez.' };
  }
  return done(value === 'absent' ? 'Rendez-vous marqué comme non honoré.' : 'Rendez-vous marqué comme réalisé.');
}

/** Email « nouvelle séance » à la famille : date et heure seulement, aucune donnée médicale. */
async function notifyFamily(
  patientId: string,
  start: Date,
  practiceName: string,
  kind: 'nouveau' | 'deplace' | 'annule',
  previous?: Date,
  reason?: string,
): Promise<void> {
  const supabase = await createClient();
  const { data: patient } = await supabase.from('patients').select('first_name, email').eq('id', patientId).maybeSingle();
  if (!patient?.email) return;
  const p = parisParts(start);
  const when = `${formatDay(p.date)} à ${formatTime(p.time)}`;
  const q = previous ? parisParts(previous) : null;
  const was = q ? `${formatDay(q.date)} à ${formatTime(q.time)}` : null;
  await sendEmail({
    to: { email: patient.email },
    senderName: practiceName,
    subject: kind === 'annule' ? `Séance du ${when} annulée` : kind === 'deplace' ? (was ? `Séance du ${was} déplacée au ${when}` : `Séance déplacée au ${when}`) : `Nouvelle séance le ${when}`,
    text: [
      'Bonjour,',
      kind === 'annule'
        ? `${practiceName} a annulé la séance de ${patient.first_name} prévue le ${when}.${reason ? ` Raison : ${reason}` : ''}`
        : kind === 'deplace'
          ? was
            ? `${practiceName} a déplacé la séance de ${patient.first_name} du ${was} au ${when}.`
            : `${practiceName} a déplacé la séance de ${patient.first_name} : elle a maintenant lieu le ${when}.`
          : `${practiceName} a prévu une séance pour ${patient.first_name} le ${when}.`,
      'Vous la retrouvez dans votre espace :',
      `${siteUrl}/patient`,
    ].join('\n\n'),
  });
}

/** Retirer une annulation faite par la famille (liste au-dessus de l'agenda). */
export async function dismissCancellation(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_appointment', { p_id: id.data });
  if (error) console.error('delete_appointment', error.code);
  revalidatePath('/ortho/planning');
}

/** Récapitulatif : « Envoyer » propose le créneau libéré (1re vague de 3 patients). */
export async function sendFreedSlot(freedSlotId: string): Promise<{ ok: boolean; sent: number; message: string }> {
  await requireOrtho();
  const id = idSchema.safeParse(freedSlotId);
  if (!id.success) return { ok: false, sent: 0, message: 'Créneau introuvable.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('start_slot_offer', { p_freed_slot: id.data });
  if (error) {
    console.error('start_slot_offer', error.code);
    return { ok: false, sent: 0, message: 'L’envoi n’a pas pu être fait. Rechargez la page puis réessayez.' };
  }
  const sent = await sendSlotOffers(data ?? []);
  revalidatePath('/ortho/planning');
  if ((data ?? []).length === 0) return { ok: true, sent: 0, message: 'Envoi programmé (nuit ou aucun patient disponible pour l’instant).' };
  return { ok: true, sent, message: `Proposé à ${sent} patient(s).` };
}

/** Récapitulatif fermé sans tout envoyer : les créneaux restants sont ignorés. */
export async function dismissFreedSlots(ids: string[]): Promise<void> {
  await requireOrtho();
  const valid = ids.filter((i) => idSchema.safeParse(i).success);
  if (valid.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc('dismiss_freed_slots', { p_ids: valid });
  if (error) console.error('dismiss_freed_slots', error.code);
  revalidatePath('/ortho/planning');
}

/** Vagues suivantes (12 h écoulées, ou fin de nuit) : lancées à l'ouverture du planning. */
export async function advanceOffers(): Promise<void> {
  await requireOrtho();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('advance_my_offers');
  if (error) console.error('advance_my_offers', error.code);
  if (data?.length) await sendSlotOffers(data);
}
