'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/** La famille retire sa propre demande (la base vérifie qu'elle en est l'auteur). */
export async function withdrawRequest(formData: FormData): Promise<void> {
  await requireUser();
  const id = z.uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc('withdraw_waitlist_entry', { p_id: id.data });
  revalidatePath('/patient');
}
