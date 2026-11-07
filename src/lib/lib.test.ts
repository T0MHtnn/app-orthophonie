import { describe, expect, it } from 'vitest';
import { fillTemplate, parseInfoText } from './text';
import { safeRedirectPath } from './security';
import { fieldErrors, isValidRpps, passwordSchema, signupSchema, slugify, waitlistFormSchema } from './validation';
import { normalizePhone } from './phone';
import { matchesSearch } from './search';

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
  const base = { patientLastName: 'Dupont', patientFirstName: 'Léa', ageValue: '7', ageUnit: 'ans', caregiverLastName: 'Dupont', caregiverFirstName: 'Marie', pathology: 'langage-ecrit', requestType: 'bilan_reeducation', acknowledged: 'on', consent: 'on' };
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

import { splitSubject, textToEmailHtml } from './email-format';

describe('emails', () => {
  it('extrait l’objet de la première ligne', () => {
    expect(splitSubject('Objet : Une place\n\nBonjour', 'défaut')).toEqual({ subject: 'Une place', body: 'Bonjour' });
    expect(splitSubject('Bonjour', 'défaut')).toEqual({ subject: 'défaut', body: 'Bonjour' });
  });
  it('échappe le HTML et rend les liens cliquables', () => {
    const html = textToEmailHtml('Salut <script>x</script>\n\nhttps://exemple.fr/patient\n\n* un\n* deux', 'Cabinet');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<a href="https://exemple.fr/patient"');
    expect(html).toContain('<li>deux</li>');
  });
});

describe('normalizePhone', () => {
  it('formate un numéro français', () => expect(normalizePhone('06.12.34.56.78')).toBe('06 12 34 56 78'));
  it('accepte +33 et 0033', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('06 12 34 56 78');
    expect(normalizePhone('0033 (0)6 12 34 56 78')).toBe('06 12 34 56 78');
  });
  it('accepte un numéro étranger', () => expect(normalizePhone('+32 470 12 34 56')).toBe('+32470123456'));
  it('refuse un numéro trop court ou fantaisiste', () => {
    for (const v of ['0612', '00 00 00 00 00', '06 12 34 56 789', 'abc', '+33 6 12']) expect(normalizePhone(v)).toBeNull();
  });
});

describe('téléphone et nom dans les formulaires', () => {
  const base = { patientLastName: 'Dupont', patientFirstName: 'Léa', ageValue: '34', ageUnit: 'ans', pathology: 'voix', requestType: 'reeducation', acknowledged: 'on', consent: 'on' };
  it('normalise le téléphone de la liste d’attente', () => expect(waitlistFormSchema.parse({ ...base, phone: '0612345678' }).phone).toBe('06 12 34 56 78'));
  it('téléphone vide accepté', () => expect(waitlistFormSchema.parse({ ...base, phone: '' }).phone).toBe(''));
  it('message clair si téléphone invalide', () => {
    const r = waitlistFormSchema.safeParse({ ...base, phone: '12345' });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).phone).toMatch(/10 chiffres/);
  });
  it('prénom et nom séparés obligatoires', () => {
    const r = signupSchema.safeParse({ firstName: 'Tom', lastName: '', email: 'a@b.fr', password: 'Abcdefghijk1', accountType: 'patient' });
    expect(r.success).toBe(false);
  });
});

describe('matchesSearch', () => {
  const fields = ['Léa', 'Dupont', 'Marie', null];
  it('ignore accents et majuscules', () => expect(matchesSearch('LEA', fields)).toBe(true));
  it('nom + prénom dans les deux sens', () => {
    expect(matchesSearch('dupont léa', fields)).toBe(true);
    expect(matchesSearch('léa dupont', fields)).toBe(true);
  });
  it('trouve par le parent', () => expect(matchesSearch('marie', fields)).toBe(true));
  it('recherche vide = tout', () => expect(matchesSearch('  ', fields)).toBe(true));
  it('refuse un autre nom', () => expect(matchesSearch('martin', fields)).toBe(false));
});

describe('type de demande', () => {
  const base = { patientLastName: 'Dupont', patientFirstName: 'Léa', ageValue: '34', ageUnit: 'ans', pathology: 'voix', acknowledged: 'on', consent: 'on' };
  it('obligatoire', () => expect(waitlistFormSchema.safeParse(base).success).toBe(false));
  it('refuse une valeur inventée', () => expect(waitlistFormSchema.safeParse({ ...base, requestType: 'autre' }).success).toBe(false));
  it('accepte les 3 types', () => {
    for (const requestType of ['bilan', 'bilan_reeducation', 'reeducation']) expect(waitlistFormSchema.safeParse({ ...base, requestType }).success).toBe(true);
  });
});
