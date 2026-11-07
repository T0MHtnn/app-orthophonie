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
