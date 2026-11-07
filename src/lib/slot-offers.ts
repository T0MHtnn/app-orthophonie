import 'server-only';
import { sendEmail } from '@/lib/email';
import { siteUrl } from '@/lib/env';
import { formatDay, formatTime, parisParts } from '@/lib/time';

export interface OfferEmail {
  email: string;
  first_name: string;
  practice_name: string;
  starts_at: string;
  token: string;
}

/** Envoie les propositions « une séance s'est libérée » (date et heure seulement, aucune donnée médicale). */
export async function sendSlotOffers(rows: OfferEmail[]): Promise<number> {
  let sent = 0;
  for (const r of rows) {
    const p = parisParts(new Date(r.starts_at));
    const when = `${formatDay(p.date)} à ${formatTime(p.time)}`;
    const res = await sendEmail({
      to: { email: r.email },
      senderName: r.practice_name,
      subject: `Une séance s’est libérée le ${when}`,
      text: [
        'Bonjour,',
        `Une séance s’est libérée chez ${r.practice_name} le ${when}. Si ce créneau convient pour ${r.first_name}, vous pouvez le réserver ici :`,
        `${siteUrl}/creneau/${r.token}`,
        'Le créneau est proposé à plusieurs patients : le premier qui le choisit l’obtient. Si une séance est déjà prévue plus tard, elle sera simplement avancée à cette date.',
      ].join('\n\n'),
    });
    if (res.ok) sent++;
  }
  return sent;
}
