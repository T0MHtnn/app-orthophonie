'use client';

import { useState, useTransition } from 'react';
import { THEMES, type Lang, type Theme } from '@/lib/preferences';
import { savePreference } from './preferences-actions';

/** Interrupteur Français / English. */
export function LanguageSwitch({ lang, label }: { lang: Lang; label: string }) {
  const [value, setValue] = useState(lang);
  const [pending, startTransition] = useTransition();
  const toggle = () => {
    const next: Lang = value === 'fr' ? 'en' : 'fr';
    setValue(next);
    document.documentElement.lang = next;
    startTransition(() => savePreference('langue', next));
  };
  return (
    <div className="row">
      <span className={`switch-label ${value === 'fr' ? 'on' : ''}`}>Français</span>
      <button type="button" role="switch" aria-checked={value === 'en'} aria-label={label} className="switch" onClick={toggle} disabled={pending}>
        <span className="switch-knob" />
      </button>
      <span className={`switch-label ${value === 'en' ? 'on' : ''}`}>English</span>
    </div>
  );
}

/** Pastille coupée en diagonale : une part par couleur du thème. */
function swatchBackground(colors: readonly string[]): string {
  const step = 100 / colors.length;
  return `linear-gradient(135deg, ${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
}

/** Choix du thème : petites pastilles, nom au survol ; appliqué tout de suite, puis enregistré. */
export function ThemeSelect({ theme, lang, label }: { theme: Theme; lang: Lang; label: string }) {
  const [value, setValue] = useState(theme);
  const [, startTransition] = useTransition();
  const current = THEMES.find((t) => t.code === value);
  return (
    <div className="stack">
      <p>
        <b>{label}</b> <span className="sub">· {current?.[lang]}</span>
      </p>
      <div className="theme-dots" role="radiogroup" aria-label={label}>
        {THEMES.map((t) => (
          <button
            type="button"
            role="radio"
            aria-checked={value === t.code}
            aria-label={t[lang]}
            data-label={t[lang]}
            key={t.code}
            className="theme-dot"
            style={{ background: swatchBackground(t.swatch) }}
            onClick={() => {
              setValue(t.code);
              document.documentElement.dataset.theme = t.code;
              startTransition(() => savePreference('theme', t.code));
            }}
          />
        ))}
      </div>
    </div>
  );
}
