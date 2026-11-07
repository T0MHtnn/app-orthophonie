import { describe, expect, it } from 'vitest';
import { fillTemplate, parseInfoText } from './text';
import { safeRedirectPath } from './security';
import { fieldErrors, isValidRpps, passwordSchema, signupSchema, slugify, waitlistFormSchema } from './validation';
import { normalizePhone } from './phone';
import { matchesSearch } from './search';
import { addDays, parisParts, parisToInstant, startOfWeek } from './time';
import { buildAgenda, mergeIntervals } from './agenda';

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

describe('heures de Paris', () => {
  it('heure d hiver (UTC+1)', () => expect(parisToInstant('2026-11-09', '09:30').toISOString()).toBe('2026-11-09T08:30:00.000Z'));
  it('heure d ete (UTC+2)', () => expect(parisToInstant('2026-07-01', '09:30').toISOString()).toBe('2026-07-01T07:30:00.000Z'));
  it('jour du passage a l heure d ete', () => expect(parisToInstant('2026-03-29', '10:00').toISOString()).toBe('2026-03-29T08:00:00.000Z'));
  it('aller-retour', () => expect(parisParts(parisToInstant('2026-10-25', '14:15'))).toMatchObject({ date: '2026-10-25', time: '14:15', weekday: 7 }));
  it('lundi de la semaine', () => {
    expect(startOfWeek('2026-11-11')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09');
  });
  it('passage de mois', () => expect(addDays('2026-11-30', 1)).toBe('2026-12-01'));
});

describe('agenda semaine', () => {
  const base = {
    week: '2026-11-09',
    openingHours: [{ weekday: 1, starts_at: '09:00:00', ends_at: '11:00:00' }],
    exceptions: [] as { kind: 'ferme' | 'ouvert'; starts_at: string; ends_at: string; label: string }[],
    appointments: [] as { id: string; starts_at: string; ends_at: string; label: string; status: string }[],
    sessionMinutes: 30,
    now: new Date('2026-11-01T00:00:00Z'),
  };
  it('découpe les plages en créneaux libres', () => {
    const monday = buildAgenda(base)[0]!;
    expect(monday.free.map((f) => f.start)).toEqual([540, 570, 600, 630]);
  });
  it('un rendez-vous occupe son créneau', () => {
    const monday = buildAgenda({ ...base, appointments: [{ id: 'a', starts_at: '2026-11-09T08:30:00Z', ends_at: '2026-11-09T09:00:00Z', label: 'Léa', status: 'confirme' }] })[0]!;
    expect(monday.appointments[0]).toMatchObject({ start: 570, end: 600 });
    expect(monday.free.map((f) => f.start)).toEqual([540, 600, 630]);
  });
  it('une fermeture supprime les créneaux', () => {
    const monday = buildAgenda({ ...base, exceptions: [{ kind: 'ferme', starts_at: '2026-11-08T23:00:00Z', ends_at: '2026-11-09T23:00:00Z', label: 'Congés' }] })[0]!;
    expect(monday.free).toEqual([]);
  });
  it('pas de créneau libre dans le passé', () => {
    expect(buildAgenda({ ...base, now: new Date('2026-11-09T09:10:00Z') })[0]!.free.map((f) => f.start)).toEqual([630]);
  });
  it('fusionne les plages qui se touchent', () => expect(mergeIntervals([{ start: 600, end: 660 }, { start: 540, end: 600 }])).toEqual([{ start: 540, end: 660 }]));
});
