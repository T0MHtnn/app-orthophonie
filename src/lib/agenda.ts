/**
 * Calcul de la vue semaine du planning (pur, testable) : pour chaque jour, les
 * plages ouvertes, fermées, les rendez-vous et les créneaux libres, en minutes
 * depuis minuit (heure de Paris).
 */
import { addDays, parisParts, parisToInstant, timeToMinutes } from './time';

export type Interval = { start: number; end: number };

export interface AgendaInput {
  week: string; // lundi AAAA-MM-JJ
  openingHours: { weekday: number; starts_at: string; ends_at: string }[];
  exceptions: { kind: 'ferme' | 'ouvert'; starts_at: string; ends_at: string; label: string }[];
  appointments: { id: string; starts_at: string; ends_at: string; label: string; status: string }[];
  sessionMinutes: number;
  now: Date;
}

export interface AgendaDay {
  date: string;
  weekday: number;
  open: Interval[];
  closed: (Interval & { label: string })[];
  appointments: (Interval & { id: string; label: string; status: string })[];
  /** Créneaux libres (durée de séance) dans les plages ouvertes, à venir. */
  free: Interval[];
}

const DAY = 24 * 60;

/** Partie d'un intervalle d'instants qui tombe dans le jour donné, en minutes. */
function clipToDay(date: string, startsAt: string, endsAt: string): Interval | null {
  const dayStart = parisToInstant(date, '00:00').getTime();
  const dayEnd = parisToInstant(addDays(date, 1), '00:00').getTime();
  const s = Math.max(new Date(startsAt).getTime(), dayStart);
  const e = Math.min(new Date(endsAt).getTime(), dayEnd);
  if (e <= s) return null;
  const toMin = (t: number) => (t >= dayEnd ? DAY : parisParts(new Date(t)).minutes);
  return { start: toMin(s), end: toMin(e) };
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Fusionne des intervalles qui se chevauchent ou se touchent. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

export function buildAgenda(input: AgendaInput): AgendaDay[] {
  const nowParts = parisParts(input.now);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(input.week, i);
    const weekday = i + 1;
    const exceptions = input.exceptions.flatMap((x) => {
      const c = clipToDay(date, x.starts_at, x.ends_at);
      return c ? [{ ...c, kind: x.kind, label: x.label }] : [];
    });
    const open = mergeIntervals([
      ...input.openingHours.filter((h) => h.weekday === weekday).map((h) => ({ start: timeToMinutes(h.starts_at), end: timeToMinutes(h.ends_at) })),
      ...exceptions.filter((x) => x.kind === 'ouvert'),
    ]);
    const closed = exceptions.filter((x) => x.kind === 'ferme').map(({ start, end, label }) => ({ start, end, label }));
    const appointments = input.appointments.flatMap((a) => {
      const c = clipToDay(date, a.starts_at, a.ends_at);
      return c ? [{ ...c, id: a.id, label: a.label, status: a.status }] : [];
    });

    // Créneaux libres : pas de séance, alignés sur le début de chaque plage ouverte.
    const free: Interval[] = [];
    const busy = [...closed, ...appointments];
    const step = Math.max(10, input.sessionMinutes);
    for (const o of open) {
      for (let t = o.start; t + step <= o.end; t += step) {
        const slot = { start: t, end: t + step };
        const past = date < nowParts.date || (date === nowParts.date && t < nowParts.minutes);
        if (!past && !busy.some((b) => overlaps(b, slot))) free.push(slot);
      }
    }
    return { date, weekday, open, closed, appointments, free };
  });
}

/** Heures affichées : de 8 h à 19 h au minimum, élargies aux plages et rendez-vous. */
export function visibleRange(days: AgendaDay[]): Interval {
  let start = 8 * 60;
  let end = 19 * 60;
  for (const d of days) {
    for (const i of [...d.open, ...d.appointments, ...d.closed.filter((c) => c.end - c.start < DAY)]) {
      start = Math.min(start, i.start);
      end = Math.max(end, i.end);
    }
  }
  return { start: Math.floor(start / 60) * 60, end: Math.min(DAY, Math.ceil(end / 60) * 60) };
}
