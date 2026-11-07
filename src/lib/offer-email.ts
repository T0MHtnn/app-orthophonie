import type { WaitlistEntryRow } from '@/lib/database.types';
import { siteUrl } from '@/lib/env';
import { fillTemplate } from '@/lib/text';

/** Remplit le modèle « place libérée » de l'ortho pour une inscription donnée. */
export function buildOfferEmail(template: string, entry: WaitlistEntryRow, orthoName: string, practiceName: string): string {
  return fillTemplate(template, {
    aidant: entry.caregiver_first_name || entry.patient_first_name,
    patient: entry.patient_first_name,
    // L'ortho fixe le 1er RDV elle-même : le lien mène à l'espace du patient.
    lien: `${siteUrl}/patient`,
    orthophoniste: orthoName,
    cabinet: practiceName,
  });
}
