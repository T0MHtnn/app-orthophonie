/** Âge en années ou en mois (tout-petits). Majeur = 18 ans ou plus. Sans dépendance : utilisable côté navigateur. */
export const ADULT_AGE = 18;
export const isAdultAge = (value: string, unit: string) => unit === 'ans' && Number(value) >= ADULT_AGE;
