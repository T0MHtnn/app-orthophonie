/**
 * Normalise un numéro de téléphone (sans dépendance, utilisable côté client).
 * - France : 10 chiffres commençant par 0, ou +33 / 0033 → « 06 12 34 56 78 » ;
 * - étranger : + ou 00 suivi de 8 à 15 chiffres → « +32470123456 ».
 * Espaces, points, tirets et parenthèses sont ignorés. Renvoie null si invalide.
 * Même règle que la contrainte SQL waitlist_phone_format.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s.\-()]/g, '');
  const french = /^(?:(?:\+|00)33(?:0)?|0)([1-9][0-9]{8})$/.exec(compact);
  if (french) return `0${french[1]}`.replace(/(\d{2})(?=\d)/g, '$1 ');
  const intl = /^(?:\+|00)([1-9][0-9]{7,14})$/.exec(compact)?.[1];
  if (intl && !intl.startsWith('33')) return `+${intl}`;
  return null;
}
