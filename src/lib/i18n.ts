import 'server-only';
import { cookies } from 'next/headers';
import { makeT, type T } from './i18n/core';
import { LANG_COOKIE, isLang, type Lang } from './preferences';

export type { T } from './i18n/core';

/** Langue choisie dans « Mon compte » (cookie de l'appareil), français par défaut. */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : 'fr';
}

/** Fonction de traduction côté serveur (pages, server actions). */
export async function getT(): Promise<T> {
  return makeT(await getLang());
}
