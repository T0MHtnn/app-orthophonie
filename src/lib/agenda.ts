/**
 * Vue semaine du planning (pur, testable, utilisable côté client) : pour chaque
 * jour, les blocages (répétitions dépliées) et les rendez-vous, en minutes
 * depuis minuit, heure de Paris. Même règle de répétition que la fonction SQL
 * private.block_overlaps.
 */
import { addDays, isoWeekday, parisParts, parisToInstant } from './time';

export type Interval = { start: number; end: number };

export type Recurrence = 'none' | 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly' | 'weekdays';

export const RECURRENCES: { code: Recurrence; label: string }[] = [
  { code: 'none', label: 'Ne pas répéter' },
  { code: 'daily', label: 'Tous les jours' },
  { code: 'weekly', label: 'Chaque semaine' },
  { code: 'biweekly', label: 'Toutes les 2 semaines' },
  { code: 'triweekly', label: 'Toutes les 3 semaines' },
  { code: 'monthly', label: 'Chaque mois (même date)' },
  { code: 'weekdays', label: 'Certains jours de la semaine…' },
];

export interface BlockInput {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  recurrence: Recurrence;
  weekdays: number[];
  until: string | null;
  skip_dates: string[];
}

export interface BlockOccurrence extends Interval {
  blockId: string;
  title: string;
  /** Jour de cette occurrence (AAAA-MM-JJ). */
  date: string;
  recurring: boolean;
}

export interface AppointmentInput {
  id: string;
  patient_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  label: string;
  attendance?: 'absent' | null;
  title?: string;
  cancel_reason?: string | null;
  cancelled_by?: 'famille' | 'ortho' | null;
}

export interface AgendaDay {
  date: string;
  weekday: number;
  blocks: BlockOccurrence[];
  appointments: (Interval & { id: string; patientId: string; label: string; status: string; attendance: 'absent' | null; title: string })[];
  /** Séances annulées par la famille : affichées en fantôme, ne bloquent pas le créneau. */
  cancelled: (Interval & { id: string; patientId: string; label: string; reason: string | null })[];
}

const DAY = 24 * 60;
const MS_DAY = 86_400_000;

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / MS_DAY;

/** Le blocage a-t-il une occurrence qui commence ce jour-là ? */
export function occursOn(block: BlockInput, date: string): boolean {
  const first = parisParts(new Date(block.starts_at)).date;
  if (date < first || (block.until && date > block.until) || block.skip_dates.includes(date)) return false;
  const diff = dayNumber(date) - dayNumber(first);
  switch (block.recurrence) {
    case 'none':
      return diff === 0;
    case 'daily':
      return true;
    case 'weekly':
      return diff % 7 === 0;
    case 'biweekly':
      return diff % 14 === 0;
    case 'triweekly':
      return diff % 21 === 0;
    case 'monthly':
      return date.slice(8) === first.slice(8);
    case 'weekdays':
      return block.weekdays.includes(isoWeekday(date));
  }
}

/** Partie d'un intervalle d'instants qui tombe dans le jour donné, en minutes. */
function clipToDay(date: string, startMs: number, endMs: number): Interval | null {
  const dayStart = parisToInstant(date, '00:00').getTime();
  const dayEnd = parisToInstant(addDays(date, 1), '00:00').getTime();
  const s = Math.max(startMs, dayStart);
  const e = Math.min(endMs, dayEnd);
  if (e <= s) return null;
  const toMin = (t: number) => (t >= dayEnd ? DAY : parisParts(new Date(t)).minutes);
  return { start: toMin(s), end: toMin(e) };
}

/** Début et fin (instants) de l'occurrence d'un blocage qui commence ce jour-là. */
export function occurrenceRange(block: BlockInput, date: string): { start: Date; end: Date } {
  const start = parisToInstant(date, parisParts(new Date(block.starts_at)).time);
  const length = new Date(block.ends_at).getTime() - new Date(block.starts_at).getTime();
  return { start, end: new Date(start.getTime() + length) };
}

export function buildWeek(week: string, blocks: BlockInput[], appointments: AppointmentInput[]): AgendaDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(week, i);
    // Une occurrence commencée la veille (ex. 22 h → 2 h) déborde sur ce jour.
    const occurrences = [addDays(date, -1), date].flatMap((startDay) =>
      blocks.filter((b) => occursOn(b, startDay)).flatMap((b) => {
        const r = occurrenceRange(b, startDay);
        const c = clipToDay(date, r.start.getTime(), r.end.getTime());
        return c ? [{ ...c, blockId: b.id, title: b.title, date: startDay, recurring: b.recurrence !== 'none' }] : [];
      }),
    );
    const clip = (a: AppointmentInput) => clipToDay(date, new Date(a.starts_at).getTime(), new Date(a.ends_at).getTime());
    const appts = appointments
      .filter((a) => a.status !== 'annule')
      .flatMap((a) => {
        const c = clip(a);
        return c ? [{ ...c, id: a.id, patientId: a.patient_id, label: a.label, status: a.status, attendance: a.attendance ?? null, title: a.title ?? '' }] : [];
      });
    const cancelled = appointments
      .filter((a) => a.status === 'annule' && a.cancelled_by === 'famille')
      .flatMap((a) => {
        const c = clip(a);
        return c ? [{ ...c, id: a.id, patientId: a.patient_id, label: a.label, reason: a.cancel_reason ?? null }] : [];
      });
    return { date, weekday: i + 1, blocks: occurrences, appointments: appts, cancelled };
  });
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Le créneau [start, end[ (minutes) est-il libre ce jour-là ? */
export const isFree = (day: AgendaDay, slot: Interval, ignoreAppointment?: string) =>
  !day.blocks.some((b) => overlaps(b, slot)) && !day.appointments.some((a) => a.id !== ignoreAppointment && overlaps(a, slot));

/** Heures affichées : 7 h – 21 h au minimum, élargies aux rendez-vous et blocages courts. */
export function visibleRange(days: AgendaDay[]): Interval {
  let start = 7 * 60;
  let end = 21 * 60;
  for (const d of days) {
    for (const i of [...d.appointments, ...d.blocks.filter((b) => b.end - b.start < DAY)]) {
      start = Math.min(start, i.start);
      end = Math.max(end, i.end);
    }
  }
  return { start: Math.floor(start / 60) * 60, end: Math.min(DAY, Math.ceil(end / 60) * 60) };
}

/** Fenêtre proposée aux familles (même règle que book_appointment en SQL). */
export const BOOKING_WINDOW: Interval = { start: 7 * 60, end: 21 * 60 };

/**
 * Créneaux réservables par une famille, du lundi au samedi : tout est ouvert dans
 * la fenêtre 7 h – 21 h sauf les plages occupées (RDV et blocages, sans détail).
 */
export function freeSlots(week: string, busy: { starts_at: string; ends_at: string }[], duration: number, earliest: Date): { date: string; times: string[] }[] {
  const step = duration % 30 === 0 ? 30 : 15;
  const ranges = busy.map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()] as const);
  return Array.from({ length: 6 }, (_, i) => {
    const date = addDays(week, i);
    const times: string[] = [];
    for (let t = BOOKING_WINDOW.start; t + duration <= BOOKING_WINDOW.end; t += step) {
      const time = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      const s = parisToInstant(date, time).getTime();
      const e = s + duration * 60_000;
      if (s < earliest.getTime()) continue;
      if (ranges.some(([bs, be]) => bs < e && s < be)) continue;
      times.push(time);
    }
    return { date, times };
  });
}
