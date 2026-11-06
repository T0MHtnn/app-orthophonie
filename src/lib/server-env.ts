import 'server-only';

/**
 * Secrets serveur, jamais envoyés au navigateur (`server-only` fait échouer
 * le build si ce fichier est importé côté client).
 * L'envoi d'emails est facultatif : sans ces variables, l'app fonctionne mais
 * ne peut pas envoyer d'emails elle-même.
 */
export interface EmailConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
}

export function emailConfig(): EmailConfig | null {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.EMAIL_SENDER_EMAIL;
  if (!apiKey || apiKey.length < 20 || !senderEmail?.includes('@')) return null;
  return { apiKey, senderEmail, senderName: process.env.EMAIL_SENDER_NAME || 'Cabinet d’orthophonie' };
}
