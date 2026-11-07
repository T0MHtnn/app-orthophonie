import 'server-only';
import { emailConfig } from '@/lib/server-env';
import { textToEmailHtml } from '@/lib/email-format';

export interface OutgoingEmail {
  to: { email: string; name?: string };
  subject: string;
  /** Texte brut. Converti en HTML simple (et échappé) pour l'envoi. */
  text: string;
  /** Adresse à laquelle la famille répond (l'ortho). */
  replyTo?: { email: string; name?: string };
  /** Nom affiché comme expéditeur (ex. le cabinet). L'adresse reste celle de l'app (seule vérifiée chez Brevo). */
  senderName?: string;
}

export type SendResult = { ok: true } | { ok: false; reason: 'not_configured' | 'failed' };

/**
 * Envoi via l'API transactionnelle de Brevo, côté serveur uniquement.
 * Règle : aucune donnée médicale (motif, notes) dans les emails.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const config = emailConfig();
  if (!config) return { ok: false, reason: 'not_configured' };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: config.senderEmail, name: email.senderName?.trim().slice(0, 70) || config.senderName },
        to: [email.to],
        replyTo: email.replyTo,
        subject: email.subject.slice(0, 200),
        textContent: email.text,
        htmlContent: textToEmailHtml(email.text, email.senderName?.trim() || config.senderName),
      }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!res.ok) {
      // Statut et code Brevo seulement (ex. « unauthorized ») : jamais le destinataire ni le contenu.
      const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
      console.error('brevo_send_failed', res.status, typeof body?.code === 'string' ? body.code : '');
      return { ok: false, reason: 'failed' };
    }
    return { ok: true };
  } catch {
    console.error('brevo_send_failed', 'network');
    return { ok: false, reason: 'failed' };
  }
}
