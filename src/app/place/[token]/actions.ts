'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/** La famille choisit son 1er RDV via le lien « place libérée ». La base revérifie tout. */
export async function bookFromLink(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const startsAt = z.iso.datetime({ offset: true }).safeParse(formData.get('startsAt'));
  const base = `/place/${encodeURIComponent(token)}`;
  if (!/^[0-9a-f]{64}$/.test(token) || !startsAt.success) redirect(`${base}?erreur=invalide`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('place_book', { p_token: token, p_starts_at: startsAt.data });
  if (error) {
    console.error('place_book', error.code);
    redirect(`${base}?erreur=autre`);
  }
  redirect(data === 'ok' ? `${base}?resultat=ok` : `${base}?erreur=${data}`);
}
