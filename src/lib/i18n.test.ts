import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeT } from './i18n/core';
import { EN } from './i18n/en';

describe('traduction', () => {
  it('texte inconnu : reste en français', () => expect(makeT('en')('Texte jamais traduit')).toBe('Texte jamais traduit'));
  it('français : texte inchangé, variables remplies', () => expect(makeT('fr')('Bonjour {nom}', { nom: 'Léa' })).toBe('Bonjour Léa'));
  it('anglais : texte traduit, variables remplies', () => expect(makeT('en')('Bonjour {nom}', { nom: 'Léa' })).toBe('Hello Léa'));
  it('les accolades du modèle d’email restent intactes sans variables', () => expect(makeT('en')('{aidant}')).toBe('{aidant}'));
});

/** Tous les fichiers .ts / .tsx de src (hors tests). */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') && !path.includes(join('lib', 'i18n')) ? [path] : [];
  });
}

/** Un texte « à afficher » : majuscule, espace ou accent (exclut les codes comme 'confirme'). */
const looksLikeText = (s: string) => /[A-ZÀ-Ý]/.test(s[0] ?? '') || /\s/.test(s) || /[à-ÿ’]/.test(s);

/**
 * Textes passés à t(), aux libellés et messages des composants qui traduisent
 * eux-mêmes (Field, SubmitButton, Notice, FormAlert…) et aux messages d'erreur
 * des actions et de la validation.
 */
function translatableTexts(source: string): string[] {
  const found = new Set<string>();
  const add = (s: string | undefined) => s && looksLikeText(s) && !s.includes('${') && found.add(s);
  for (const line of source.split('\n')) {
    const tIndex = line.search(/\bt\(/);
    // [^']* (et non +) : une chaîne vide '' ne doit pas décaler l'appariement des guillemets.
    if (tIndex >= 0) for (const m of line.slice(tIndex).matchAll(/'([^']*)'/g)) add(m[1]);
    for (const m of line.matchAll(/\b(?:label|placeholder|pendingText)="([^"]+)"/g)) add(m[1]);
    for (const m of line.matchAll(/\b(?:message|error|label|help|hint):\s*'([^']+)'/g)) add(m[1]);
    for (const m of line.matchAll(/\b(?:errors: \{ \w+): '([^']+)'/g)) add(m[1]);
    for (const m of line.matchAll(/<SubmitButton[^>]*>([^<{]+)<\/SubmitButton>/g)) add(m[1]?.trim());
    for (const m of line.matchAll(/<Notice[^>]*>([^<{]+)<\/Notice>/g)) add(m[1]?.trim());
    for (const m of line.matchAll(/return '([^']+)';/g)) add(m[1]);
    for (const m of line.matchAll(/,\s*'([^']{6,})'\s*\)/g)) add(m[1]); // .min(1, 'message')
  }
  return [...found];
}

describe('chaque texte de l’interface a sa version anglaise', () => {
  const root = join(__dirname, '..');
  const ignore = new Set(['Email', 'Patient', 'Contact', 'Actions', 'Sections', 'Date', 'Français', 'English', 'Content-Security-Policy']);
  for (const file of files(root)) {
    const source = readFileSync(file, 'utf8');
    const missing = translatableTexts(source).filter((s) => !(s in EN) && !ignore.has(s) && /[a-zà-ÿ]{2}/.test(s) && !/^[\w./@-]+$/.test(s));
    it(file.slice(root.length + 1), () => expect(missing).toEqual([]));
  }
});

describe('le contrôle des traductions détecte bien les textes', () => {
  it('t(), libellés, boutons et messages', () => {
    const src = [
      "{t('Texte A à traduire')}",
      '<Field label="Texte B" name="x" />',
      '<SubmitButton>Texte C</SubmitButton>',
      "return { message: 'Texte D.' };",
      "z.string().min(1, 'Texte E requis')",
      "{t(ok ? 'Texte F' : 'Texte G')}",
    ].join('\n');
    expect(translatableTexts(src).sort()).toEqual(['Texte A à traduire', 'Texte B', 'Texte C', 'Texte D.', 'Texte E requis', 'Texte F', 'Texte G']);
  });
  it('beaucoup de textes trouvés dans le code', () => {
    const total = new Set(files(join(__dirname, '..')).flatMap((f) => translatableTexts(readFileSync(f, 'utf8')))).size;
    expect(total).toBeGreaterThan(300);
  });
});
