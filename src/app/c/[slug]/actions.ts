'use server';

import { headers } from 'next/headers';
import type { FormState } from '@/components/form';
import { clientIp, hashIp } from '@/lib/security';
import { serverEnv } from '@/lib/server-env';
import { createAdminClient } from '@/lib/supabase/admin';
import { fieldErrors, waitlistFormSchema } from '@/lib/validation';

const FIELDS = ['patientLastName', 'patientFirstName', 'patientAge', 'caregiverLastName', 'caregiverFirstName', 'email', 'phone', 'pathology', 'notes', 'acknowledged', 'consent', 'website'];

/**
 * Inscription publique. Ordre des contrôles :
 *   validation stricte → champ piège → empreinte d'IP → fonction SQL qui
 *   revérifie le cabinet (vérifié, ouvert) et applique la limitation de débit.
 */
export async function submitWaitlist(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(FIELDS.map((k) => [k, formData.get(k) ?? undefined]));
  const parsed = waitlistFormSchema.safeParse(raw);
  const echo = Object.fromEntries(FIELDS.filter((k) => typeof raw[k] === 'string').map((k) => [k, String(raw[k])]));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: echo };

  const success: FormState = { ok: true, message: 'Votre inscription est enregistrée. L’orthophoniste vous contactera dès qu’une place se libère.' };
  const d = parsed.data;
  if (d.website) return success; // robot : on fait comme si tout allait bien.

  const { IP_HASH_SECRET } = serverEnv();
  const ipHash = hashIp(clientIp(await headers()), IP_HASH_SECRET);

  const { data, error } = await createAdminClient().rpc('submit_waitlist_entry', {
    p_slug: slug,
    p_ip_hash: ipHash,
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

  if (error?.code === 'P0429') return { message: 'Trop de demandes depuis votre connexion. Réessayez dans une heure.', values: echo };
  if (error) return { message: 'L’inscription n’a pas pu être enregistrée. Vérifiez les champs puis réessayez.', values: echo };
  if (!data) return { message: 'Les inscriptions sont fermées pour le moment.', values: echo };
  return success;
}
