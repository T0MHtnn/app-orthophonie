/** Fiche patient : calculs purs (sans dépendance, utilisables côté navigateur). */

/** Lettre clé AMO au 23/02/2026 (FNO). Prix d'un acte = coefficient × lettre clé. */
export const AMO_LETTER_EUR = 2.6;
export const amoPrice = (coefficient: number) => Math.round(coefficient * AMO_LETTER_EUR * 100) / 100;
export const formatEuros = (amount: number, locale = 'fr-FR') => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount);

/** Séances restantes à partir de laquelle on prévient que la série se termine. */
export const SERIES_WARNING_LEFT = 2;

export type SeriesState = 'inconnue' | 'en-cours' | 'fin-proche' | 'terminee';

/** Où en est la série : « fin proche » quand il reste 2 séances ou moins, « terminée » à 0. */
export function seriesState(done: number, total: number | null): { state: SeriesState; left: number | null } {
  if (!total) return { state: 'inconnue', left: null };
  const left = Math.max(0, total - done);
  return { state: left === 0 ? 'terminee' : left <= SERIES_WARNING_LEFT ? 'fin-proche' : 'en-cours', left };
}

export { ageFromBirthDate } from './age';
