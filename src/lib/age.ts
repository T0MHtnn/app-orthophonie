/** Âge en années ou en mois (tout-petits). Majeur = 18 ans ou plus. Sans dépendance : utilisable côté navigateur. */
export const ADULT_AGE = 18;
export const isAdultAge = (value: string, unit: string) => unit === 'ans' && Number(value) >= ADULT_AGE;

/** « 7 ans » / « 1 an » / « 18 mois » (tel qu'enregistré) → « 7 years » … en anglais. */
export function formatAge(age: string | null | undefined, lang: 'fr' | 'en'): string {
  if (!age || lang === 'fr') return age ?? '';
  return age.replace(/^(\d+)\s*(ans|an|mois)$/, (_, n: string, unit: string) =>
    unit === 'mois' ? `${n} month${n === '1' ? '' : 's'}` : `${n} year${n === '1' ? '' : 's'}`,
  );
}

/** Âge à partir de la date de naissance (AAAA-MM-JJ), au format de la liste d'attente : « 7 ans », « 1 an », « 18 mois ». */
export function ageFromBirthDate(birth: string, today: string): string | null {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  if (!by || !bm || !bd || !ty || !tm || !td) return null;
  const months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months < 0) return null;
  if (months < 36) return `${months} mois`;
  const years = Math.floor(months / 12);
  return `${years} ${years <= 1 ? 'an' : 'ans'}`;
}

/** Majeur à la date du jour (18 ans révolus). */
export function isAdultBirthDate(birth: string, today: string): boolean {
  const age = ageFromBirthDate(birth, today);
  return !!age && age.endsWith('ans') && Number(age.split(' ')[0]) >= ADULT_AGE;
}

/** Âge à afficher : calculé depuis la date de naissance, sinon l'âge texte des anciennes demandes. */
export function displayAge(birth: string | null | undefined, legacy: string | null | undefined, today: string, lang: 'fr' | 'en'): string {
  return formatAge((birth && ageFromBirthDate(birth, today)) || legacy, lang);
}
