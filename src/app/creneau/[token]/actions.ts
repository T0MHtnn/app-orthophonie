'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Le patient accepte le créneau libéré (premier arrivé, premier servi ; la base tranche). */
export async function acceptOffer(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const base = `/creneau/${encodeURIComponent(token)}`;
  if (!/^[0-9a-f]{64}$/.test(token)) redirect(`${base}?resultat=invalide`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('accept_slot_offer', { p_token: token });
  if (error) console.error('accept_slot_offer', error.code);
  redirect(`${base}?resultat=${error ? 'expire' : data}`);
}
