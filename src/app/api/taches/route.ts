import { NextResponse, type NextRequest } from 'next/server';
import { sendReminders, sendSlotOffers } from '@/lib/slot-offers';
import { createClient } from '@/lib/supabase/server';

/**
 * Tâche planifiée (Vercel Cron, chaque matin — voir vercel.json) : envoie les vagues
 * de propositions en attente (nuit terminée, 12 h écoulées) pour tous les cabinets,
 * et les rappels des séances du lendemain.
 * Vercel envoie « Authorization: Bearer <CRON_SECRET> » ; la base revérifie ce secret
 * (seule son empreinte y est stockée, dans private.app_secrets). Pas de clé Supabase secrète.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cron_advance_offers', { p_secret: secret });
  if (error) {
    console.error('cron_advance_offers', error.code);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const sent = await sendSlotOffers(data ?? []);
  const { data: due, error: remindError } = await supabase.rpc('cron_session_reminders', { p_secret: secret });
  if (remindError) {
    console.error('cron_session_reminders', remindError.code);
    return NextResponse.json({ ok: false, sent }, { status: 500 });
  }
  const reminded = await sendReminders(due ?? []);
  return NextResponse.json({ ok: true, sent, reminded });
}
