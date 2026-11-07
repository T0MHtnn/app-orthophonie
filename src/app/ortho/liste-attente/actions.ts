'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireOrtho } from '@/lib/auth';
import { DEFAULT_EMAIL_TEMPLATE } from '@/lib/defaults';
import { sendEmail } from '@/lib/email';
import { splitSubject } from '@/lib/email-format';
import { buildOfferEmail } from '@/lib/offer-email';
import { createClient } from '@/lib/supabase/server';
import type { WaitlistStatus } from '@/lib/database.types';
import { waitlistStatusSchema } from '@/lib/validation';

const idSchema = z.uuid();

/** Change le statut et dit si une ligne a vraiment été modifiée (la RLS filtre sans erreur). */
async function setStatus(id: string, status: WaitlistStatus): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('waitlist_entries').update({ status }).eq('id', id).select('id');
  // Code seulement : jamais de donnée de la demande dans les logs.
  if (error) console.error('waitlist_status', error.code, error.message);
  else if (!data?.length) console.error('waitlist_status', 'no_row');
  return !error && !!data?.length;
}

/**
 * Chaque action revérifie l'accès (requireOrtho) ; la RLS garantit en plus
 * qu'on ne touche qu'aux inscrits de son propre cabinet, en double authentification.
 */
export async function updateStatus(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  const status = waitlistStatusSchema.safeParse(formData.get('status'));
  if (!id.success || !status.success) return;

  if (!(await setStatus(id.data, status.data))) redirect('/ortho/liste-attente?erreur=statut');
  revalidatePath('/ortho/liste-attente');
}

export async function markContacted(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  if (!(await setStatus(id.data, 'contacte'))) redirect('/ortho/liste-attente?erreur=statut');
  redirect('/ortho/liste-attente?ok=contacte');
}

/** Suppression définitive (droit à l'effacement RGPD). */
export async function deleteEntry(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from('waitlist_entries').delete().eq('id', id.data);
  redirect('/ortho/liste-attente?ok=supprime');
}

/**
 * Envoie l'email « une place s'est libérée » depuis l'app (Brevo), puis passe
 * le statut à « Place proposée ». L'adresse est relue en base (sous RLS) :
 * on ne fait jamais confiance à une adresse envoyée par le navigateur.
 * La famille qui répond écrit directement à l'ortho (reply-to).
 */
export async function sendOfferEmail(formData: FormData): Promise<void> {
  const { practice, profile, email: orthoEmail } = await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;

  const supabase = await createClient();
  const { data: entry } = await supabase.from('waitlist_entries').select('*').eq('id', id.data).maybeSingle();
  if (!entry?.email) redirect('/ortho/liste-attente?erreur=email');

  const text = buildOfferEmail(practice.email_template || DEFAULT_EMAIL_TEMPLATE, entry, profile.full_name, practice.name);
  const { subject, body } = splitSubject(text, `Une place s’est libérée – ${practice.name}`);
  const result = await sendEmail({
    to: { email: entry.email },
    subject,
    text: body,
    replyTo: { email: orthoEmail, name: profile.full_name || practice.name },
    senderName: practice.name,
  });
  if (!result.ok) redirect(`/ortho/liste-attente?erreur=${result.reason === 'not_configured' ? 'email-config' : 'envoi'}&email=${entry.id}`);

  if (!(await setStatus(entry.id, 'contacte'))) redirect('/ortho/liste-attente?erreur=envoye-statut');
  redirect('/ortho/liste-attente?ok=envoye');
}
