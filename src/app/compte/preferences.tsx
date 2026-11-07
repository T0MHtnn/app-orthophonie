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

/** Choix du thème : appliqué tout de suite, puis enregistré. */
export function ThemeSelect({ theme, lang, label }: { theme: Theme; lang: Lang; label: string }) {
  const [value, setValue] = useState(theme);
  const [, startTransition] = useTransition();
  return (
    <div className="stack">
      <label className="field">
        <span>{label}</span>
        <select
          value={value}
          onChange={(e) => {
            const next = e.target.value as Theme;
            setValue(next);
            document.documentElement.dataset.theme = next;
            startTransition(() => savePreference('theme', next));
          }}
        >
          {THEMES.map((t) => (
            <option key={t.code} value={t.code}>
              {t[lang]}
            </option>
          ))}
        </select>
      </label>
      <div className="theme-grid" aria-hidden="true">
        {THEMES.map((t) => (
          <button
            type="button"
            tabIndex={-1}
            key={t.code}
            className={`theme-swatch ${value === t.code ? 'on' : ''}`}
            title={t[lang]}
            onClick={() => {
              setValue(t.code);
              document.documentElement.dataset.theme = t.code;
              startTransition(() => savePreference('theme', t.code));
            }}
          >
            {t.swatch.map((c) => (
              <span key={c} style={{ background: c }} />
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}
