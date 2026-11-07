import type { WaitlistEntryRow } from '@/lib/database.types';
import { siteUrl } from '@/lib/env';
import { fillTemplate } from '@/lib/text';

/** Remplit le modèle « place libérée » de l'ortho pour une inscription donnée. */
export function buildOfferEmail(template: string, entry: WaitlistEntryRow, orthoName: string, practiceName: string, link?: string): string {
  return fillTemplate(template, {
    aidant: entry.caregiver_first_name || entry.patient_first_name,
    patient: entry.patient_first_name,
    // Lien personnel vers les créneaux libres (créé à l'envoi) ; à défaut, l'espace de la famille.
    lien: link ?? `${siteUrl}/patient`,
    orthophoniste: orthoName,
    cabinet: practiceName,
  });
}
