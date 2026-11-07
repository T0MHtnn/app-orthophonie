/**
 * Préférences d'affichage (langue, thème), gardées dans un cookie sur l'appareil.
 * Sans dépendance : utilisable côté client.
 */
export const LANG_COOKIE = 'langue';
export const THEME_COOKIE = 'theme';

export const LANGS = ['fr', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** Thèmes : les couleurs sont dans globals.css (:root[data-theme="…"]). */
export const THEMES = [
  { code: 'system', fr: 'Suivre le système', en: 'Follow system', swatch: ['#ffffff', '#191e28'] },
  { code: 'light', fr: 'Clair', en: 'Light', swatch: ['#eef1f6', '#2d55c8'] },
  { code: 'dark', fr: 'Sombre', en: 'Dark', swatch: ['#11141b', '#7f9cff'] },
  { code: 'foret', fr: 'Forêt (vert et brun)', en: 'Forest (green & brown)', swatch: ['#f1f4ee', '#3f6b3a', '#8a5a2b'] },
  { code: 'sakura', fr: 'Sakura (rose pâle et brun clair)', en: 'Sakura (pale pink & light brown)', swatch: ['#fbf4f4', '#b04a6a', '#a47a5a'] },
  { code: 'exotique', fr: 'Exotique (orange, jaune, rouge)', en: 'Exotic (orange, yellow, red)', swatch: ['#fff7ec', '#c4510f', '#c0261b'] },
  { code: 'ocean', fr: 'Océan (bleu et blanc)', en: 'Ocean (blue & white)', swatch: ['#f0f6fa', '#0f6fae', '#1b7f74'] },
  { code: 'lavande', fr: 'Lavande (violet doux)', en: 'Lavender (soft purple)', swatch: ['#f5f3fa', '#6b4fb8', '#a26bb0'] },
  { code: 'nuit', fr: 'Nuit océane (sombre bleu)', en: 'Ocean night (dark blue)', swatch: ['#0b1622', '#102030', '#4fb3e8'] },
] as const;
export type Theme = (typeof THEMES)[number]['code'];

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);
export const isTheme = (v: unknown): v is Theme => typeof v === 'string' && THEMES.some((t) => t.code === v);
