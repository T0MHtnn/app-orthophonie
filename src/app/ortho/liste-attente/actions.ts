'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireOrtho } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { waitlistStatusSchema } from '@/lib/validation';

const idSchema = z.uuid();

/**
 * Chaque action revérifie l'accès (requireOrtho) ; la RLS garantit en plus
 * qu'on ne touche qu'aux inscrits de son propre cabinet, en double authentification.
 */
export async function updateStatus(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  const status = waitlistStatusSchema.safeParse(formData.get('status'));
  if (!id.success || !status.success) return;

  const supabase = await createClient();
  await supabase.from('waitlist_entries').update({ status: status.data }).eq('id', id.data);
  revalidatePath('/ortho/liste-attente');
}

export async function markContacted(formData: FormData): Promise<void> {
  await requireOrtho();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from('waitlist_entries').update({ status: 'contacte' }).eq('id', id.data);
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
