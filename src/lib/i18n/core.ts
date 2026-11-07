/**
 * Traduction façon « gettext » : le texte français sert de clé, la version anglaise
 * est dans en.ts. Un texte sans traduction reste en français (jamais de page cassée).
 * Sans dépendance : utilisable côté serveur et côté client.
 *
 *   t('Bonjour {name}', { name: 'Léa' })
 */
import type { Lang } from '../preferences';
import { EN } from './en';

export type Vars = Record<string, string | number>;

export interface T {
  (fr: string, vars?: Vars): string;
  lang: Lang;
  /** Locale pour Intl (dates, nombres). */
  locale: 'fr-FR' | 'en-GB';
}

export function makeT(lang: Lang): T {
  const dict: Record<string, string> | null = lang === 'en' ? EN : null;
  const t = ((fr: string, vars?: Vars) => {
    const text = dict?.[fr] ?? fr;
    return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
  }) as T;
  t.lang = lang;
  t.locale = lang === 'en' ? 'en-GB' : 'fr-FR';
  return t;
}
