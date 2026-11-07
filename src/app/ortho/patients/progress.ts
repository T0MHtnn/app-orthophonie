import type { AmoActRow, PatientRow } from '@/lib/database.types';
import { parisParts } from '@/lib/time';

interface PastAppointment {
  patient_id: string;
  starts_at: string;
  attendance: string | null;
}

/**
 * Séances réalisées de la série en cours : confirmées, passées, pas « non honoré »,
 * et depuis la date de prescription si elle est renseignée (une nouvelle prescription
 * = une nouvelle série). Total = séances prescrites, sinon celles de l'acte AMO.
 */
export function seriesProgress(patients: Pick<PatientRow, 'id' | 'prescription_date' | 'sessions_prescribed' | 'amo_act_code'>[], past: PastAppointment[], acts: AmoActRow[]) {
  const since = new Map(patients.map((p) => [p.id, p.prescription_date]));
  const done = new Map<string, number>();
  const absent = new Map<string, number>();
  for (const a of past) {
    if (a.attendance === 'absent') {
      absent.set(a.patient_id, (absent.get(a.patient_id) ?? 0) + 1);
      continue;
    }
    const from = since.get(a.patient_id);
    if (from && parisParts(new Date(a.starts_at)).date < from) continue;
    done.set(a.patient_id, (done.get(a.patient_id) ?? 0) + 1);
  }
  const actSessions = new Map(acts.map((a) => [a.code, a.sessions]));
  return (p: (typeof patients)[number]) => ({
    done: done.get(p.id) ?? 0,
    absences: absent.get(p.id) ?? 0,
    total: p.sessions_prescribed ?? (p.amo_act_code ? (actSessions.get(p.amo_act_code) ?? null) : null),
  });
}
