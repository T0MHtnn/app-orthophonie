'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { LANG_COOKIE, THEME_COOKIE, isLang, isTheme } from '@/lib/preferences';

/** Langue et thème : cookie de l'appareil (aucune donnée personnelle), valable un an. */
export async function savePreference(name: 'langue' | 'theme', value: string): Promise<void> {
  const valid = name === LANG_COOKIE ? isLang(value) : name === THEME_COOKIE && isTheme(value);
  if (!valid) return;
  (await cookies()).set(name, value, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  revalidatePath('/', 'layout');
}
