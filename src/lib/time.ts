/**
 * Dates du planning, toujours en heure de Paris (sans dépendance : utilisable côté client).
 * Les jours sont manipulés en chaînes « AAAA-MM-JJ », les heures en « HH:MM ».
 */
export const TIME_ZONE = 'Europe/Paris';

/** Index 0 = lundi (weekday ISO 1). */
export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const parts = (instant: Date) => Object.fromEntries(partsFormatter.formatToParts(instant).map((x) => [x.type, x.value]));

/** Date et heure à Paris d'un instant. */
export function parisParts(instant: Date): { date: string; time: string; minutes: number; weekday: number } {
  const p = parts(instant);
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, time: `${p.hour}:${p.minute}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: isoWeekday(date) };
}

/** Décalage de Paris par rapport à UTC à cet instant, en millisecondes. */
function offsetMs(instant: Date): number {
  const p = parts(instant);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instant correspondant à une date et une heure de Paris (gère les changements d'heure). */
export function parisToInstant(date: string, time: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(first)));
}

/** 1 = lundi … 7 = dimanche. */
export function isoWeekday(date: string): number {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date: string, days: number): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Lundi de la semaine contenant ce jour. */
export const startOfWeek = (date: string) => addDays(date, 1 - isoWeekday(date));

export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** « HH:MM » ou « HH:MM:SS » → minutes depuis minuit. */
export function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

export const minutesToTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortDayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** « lundi 9 novembre » (ou « lun. 9 nov. ») */
export const formatDay = (date: string, short = false) => (short ? shortDayFormatter : dayFormatter).format(new Date(`${date}T12:00:00Z`));

/** « 09:30 » → « 9 h 30 » */
export function formatTime(time: string): string {
  const [h = '0', m = '00'] = time.split(':');
  return `${Number(h)} h ${m}`;
}
