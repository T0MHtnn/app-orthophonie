import { describe, expect, it } from 'vitest';
import { fillTemplate, parseInfoText } from './text';
import { hashIp, safeRedirectPath } from './security';
import { isValidRpps, passwordSchema, slugify, waitlistFormSchema } from './validation';

describe('safeRedirectPath', () => {
  it('garde un chemin interne', () => expect(safeRedirectPath('/ortho/reglages')).toBe('/ortho/reglages'));
  it.each(['https://evil.fr', '//evil.fr', '/\\evil.fr', 'javascript:alert(1)', '/a\nb', 42, undefined])('refuse %s', (v) =>
    expect(safeRedirectPath(v, '/x')).toBe('/x'),
  );
});

describe('hashIp', () => {
  it('ne contient pas l’IP et dépend du secret', () => {
    const a = hashIp('203.0.113.7', 's'.repeat(32));
    expect(a).not.toContain('203');
    expect(a).not.toBe(hashIp('203.0.113.7', 't'.repeat(32)));
  });
});

describe('isValidRpps', () => {
  it('accepte une clé de Luhn correcte', () => expect(isValidRpps('10000000009')).toBe(true));
  it('refuse une mauvaise clé', () => expect(isValidRpps('10000000001')).toBe(false));
  it('refuse un format incorrect', () => expect(isValidRpps('1234')).toBe(false));
});

describe('passwordSchema', () => {
  it('refuse un mot de passe court', () => expect(passwordSchema.safeParse('Abc123').success).toBe(false));
  it('refuse sans majuscule', () => expect(passwordSchema.safeParse('abcdefgh1234').success).toBe(false));
  it('accepte un mot de passe solide', () => expect(passwordSchema.safeParse('Orthophonie2026').success).toBe(true));
});

describe('slugify', () => {
  it('produit une adresse propre', () => expect(slugify('Cabinet de Maëlle Fouilleul !')).toBe('cabinet-de-maelle-fouilleul'));
});

describe('waitlistFormSchema', () => {
  const base = { patientLastName: 'Dupont', patientFirstName: 'Léa', patientAge: '7 ans', pathology: 'langage-ecrit', acknowledged: 'on', consent: 'on' };
  it('exige un moyen de contact', () => expect(waitlistFormSchema.safeParse(base).success).toBe(false));
  it('accepte un email seul', () => expect(waitlistFormSchema.safeParse({ ...base, email: 'A@Example.com' }).success).toBe(true));
  it('exige la case de lecture', () => expect(waitlistFormSchema.safeParse({ ...base, email: 'a@example.com', acknowledged: undefined }).success).toBe(false));
  it('refuse un motif inventé', () => expect(waitlistFormSchema.safeParse({ ...base, email: 'a@example.com', pathology: '<script>' }).success).toBe(false));
});

describe('parseInfoText', () => {
  it('reconnaît titre, sous-titres, puces et paragraphes', () => {
    const blocks = parseInfoText('Titre\n## Section\n* un\n* deux\n\nTexte <b>brut</b>');
    expect(blocks.map((b) => b.kind)).toEqual(['title', 'heading', 'list', 'paragraph']);
    expect(blocks[3]).toEqual({ kind: 'paragraph', text: 'Texte <b>brut</b>' });
  });
});

describe('fillTemplate', () => {
  it('remplace les champs connus et laisse les autres', () =>
    expect(fillTemplate('Bonjour {aidant}, {inconnu}', { aidant: 'Marie' })).toBe('Bonjour Marie, {inconnu}'));
});
