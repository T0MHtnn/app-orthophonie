'use server';

import type { FormState } from '@/components/form';
import { getAuthContext } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { siteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, waitlistFormSchema } from '@/lib/validation';

const FIELDS = [
  'patientLastName',
  'patientFirstName',
  'ageValue',
  'ageUnit',
  'caregiverLastName',
  'caregiverFirstName',
  'email',
  'phone',
  'pathology',
  'notes',
  'acknowledged',
  'consent',
  'website',
];

/**
 * Inscription sur la liste d'attente, par une famille connectée.
 * Validation stricte → champ piège → fonction SQL qui revérifie le compte,
 * le cabinet (vérifié, ouvert), les doublons et la limitation de débit.
 */
export async function submitWaitlist(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(FIELDS.map((k) => [k, formData.get(k) ?? undefined]));
  // On renvoie tout ce qui a été saisi (cases et listes comprises) pour le réafficher en cas d'erreur.
  const echo = Object.fromEntries(FIELDS.filter((k) => typeof raw[k] === 'string').map((k) => [k, String(raw[k])]));

  const ctx = await getAuthContext();
  if (!ctx) return { message: 'Votre session a expiré. Reconnectez-vous pour envoyer votre inscription.', values: echo };

  const parsed = waitlistFormSchema.safeParse(raw);
  if (!parsed.success) return { message: 'Certains champs sont à corriger (encadrés en rouge).', errors: fieldErrors(parsed.error), values: echo };

  const success: FormState = { ok: true, message: 'Votre inscription est enregistrée. L’orthophoniste vous contactera dès qu’une place se libère. Vous pouvez suivre votre demande depuis votre espace.' };
  const d = parsed.data;
  if (d.website) return success; // robot : on fait comme si tout allait bien.

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('submit_waitlist_entry', {
    p_slug: slug,
    p_patient_last_name: d.patientLastName,
    p_patient_first_name: d.patientFirstName,
    p_patient_age: d.patientAge,
    p_caregiver_last_name: d.caregiverLastName,
    p_caregiver_first_name: d.caregiverFirstName,
    p_email: d.email,
    p_phone: d.phone,
    p_pathology_code: d.pathology,
    p_notes: d.notes,
  });

  if (error?.code === 'P0429') return { message: 'Trop de demandes envoyées. Réessayez dans une heure.', values: echo };
  if (error?.code === '23505') return { message: 'Ce patient est déjà inscrit sur la liste d’attente de ce cabinet.', values: echo };
  if (error?.code === '42501') return { message: 'Confirmez d’abord votre adresse email (lien reçu à la création du compte).', values: echo };
  // Code et message Postgres seulement, jamais les données saisies.
  if (error) console.error('submit_waitlist_entry', error.code, error.message);
  if (error) return { message: 'L’inscription n’a pas pu être enregistrée. Vérifiez les champs puis réessayez.', values: echo };
  if (!data) return { message: 'Les inscriptions sont fermées pour le moment.', values: echo };

  // Accusé de réception. Volontairement sans le motif ni les notes (données de santé).
  const { data: practices } = await supabase.rpc('get_public_practice', { p_slug: slug });
  const practiceName = practices?.[0]?.name ?? 'le cabinet';
  await sendEmail({
    to: { email: d.email || ctx.email },
    subject: `Votre inscription sur la liste d’attente – ${practiceName}`,
    text: [
      'Bonjour,',
      `Votre demande pour ${d.patientFirstName} est bien enregistrée sur la liste d’attente de ${practiceName}.`,
      'Vous serez contacté dès qu’une place se libère. Vous pouvez suivre votre demande à tout moment depuis votre espace :',
      `${siteUrl}/patient`,
      'Si vous ne souhaitez plus cette prise en charge, vous pouvez retirer votre demande depuis votre espace.',
    ].join('\n\n'),
  });
  return success;
}
