'use client';

import { createContext, useContext, useMemo } from 'react';
import { makeT, type T } from '@/lib/i18n/core';
import type { Lang } from '@/lib/preferences';

const LangContext = createContext<Lang>('fr');

/** Donne la langue aux composants client (posé par le root layout). */
export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** Fonction de traduction côté client. */
export function useT(): T {
  const lang = useContext(LangContext);
  return useMemo(() => makeT(lang), [lang]);
}
