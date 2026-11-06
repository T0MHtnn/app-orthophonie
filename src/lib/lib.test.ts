import { describe, expect, it } from 'vitest';
import { fillTemplate, parseInfoText } from './text';
import { safeRedirectPath } from './security';
import { isValidRpps, passwordSchema, slugify, waitlistFormSchema } from './validation';

describe('safeRedirectPath', () => {
  it('garde un chemin interne', () => expect(safeRedirectPath('/ortho/reglages')).toBe('/ortho/reglages'));
  it.each(['https://evil.fr', '//evil.fr', '/\\evil.fr', 'javascript:alert(1)', '/a\nb', 42, undefined])('refuse %s', (v) =>
    expect(safeRedirectPath(v, '/x')).toBe('/x'),
  );
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
  const base = { patientLastName: 'Dupont', patientFirstName: 'Léa', ageValue: '7', ageUnit: 'ans', caregiverLastName: 'Dupont', caregiverFirstName: 'Marie', pathology: 'langage-ecrit', acknowledged: 'on', consent: 'on' };
  it('le contact est facultatif (email du compte par défaut)', () => expect(waitlistFormSchema.safeParse(base).success).toBe(true));
  it('accepte un email', () => expect(waitlistFormSchema.parse({ ...base, email: 'A@Example.com' }).email).toBe('a@example.com'));
  it('exige le parent pour un mineur', () => {
    const r = waitlistFormSchema.safeParse({ ...base, caregiverLastName: '', caregiverFirstName: '' });
    expect(r.success).toBe(false);
  });
  it('ignore le parent pour un majeur', () => {
    const r = waitlistFormSchema.parse({ ...base, ageValue: '34', caregiverLastName: 'X' });
    expect(r.caregiverLastName).toBe('');
    expect(r.patientAge).toBe('34 ans');
  });
  it('accepte un âge en mois', () => expect(waitlistFormSchema.parse({ ...base, ageValue: '18', ageUnit: 'mois' }).patientAge).toBe('18 mois'));
  it('exige la case de lecture', () => expect(waitlistFormSchema.safeParse({ ...base, acknowledged: undefined }).success).toBe(false));
  it('refuse un motif inventé', () => expect(waitlistFormSchema.safeParse({ ...base, pathology: '<script>' }).success).toBe(false));
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
