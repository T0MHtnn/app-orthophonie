import { describe, expect, it } from 'vitest';
import { fillTemplate, parseInfoText } from './text';
import { safeRedirectPath } from './security';
import { appointmentSchema, blockSchema, fieldErrors, isValidRpps, passwordSchema, signupSchema, slugify, waitlistFormSchema } from './validation';
import { normalizePhone } from './phone';
import { matchesSearch } from './search';
import { addDays, parisParts, parisToInstant, startOfWeek } from './time';
import { buildWeek, freeSlots, isFree, layoutPieces, occursOn, type BlockInput } from './agenda';

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
  const block = (over: Partial<BlockInput>): BlockInput => ({
    id: 'b',
    title: 'Pause',
    starts_at: '2026-11-09T11:00:00Z', // lundi 12 h Paris
    ends_at: '2026-11-09T12:30:00Z', // 13 h 30
    recurrence: 'none',
    weekdays: [],
    until: null,
    skip_dates: [],
    ...over,
  });
  it('blocage ponctuel : un seul jour', () => {
    const w = buildWeek('2026-11-09', [block({})], []);
    expect(w[0]!.blocks[0]).toMatchObject({ start: 720, end: 810 });
    expect(w[1]!.blocks).toEqual([]);
  });
  it('tous les jours, sauf un jour supprimé', () => {
    const w = buildWeek('2026-11-09', [block({ recurrence: 'daily', skip_dates: ['2026-11-11'] })], []);
    expect(w.map((d) => d.blocks.length)).toEqual([1, 1, 0, 1, 1, 1, 1]);
  });
  it('toutes les 2 semaines', () => {
    const b = block({ recurrence: 'biweekly' });
    expect(occursOn(b, '2026-11-16')).toBe(false);
    expect(occursOn(b, '2026-11-23')).toBe(true);
  });
  it('certains jours, jusqu’à une date', () => {
    const b = block({ recurrence: 'weekdays', weekdays: [3, 5], until: '2026-11-20' });
    expect(occursOn(b, '2026-11-11')).toBe(true);
    expect(occursOn(b, '2026-11-12')).toBe(false);
    expect(occursOn(b, '2026-11-25')).toBe(false);
  });
  it('chaque mois, même date', () => expect(occursOn(block({ recurrence: 'monthly' }), '2026-12-09')).toBe(true));
  it('même heure locale après le changement d’heure', () => {
    const b = block({ recurrence: 'weekly', starts_at: '2026-03-23T11:00:00Z', ends_at: '2026-03-23T12:00:00Z' }); // 12 h en hiver
    expect(buildWeek('2026-03-30', [b], [])[0]!.blocks[0]).toMatchObject({ start: 720, end: 780 });
  });
  it('format renvoyé par la base (+00:00) et blocage posé depuis la pop-up', () => {
    const starts = parisToInstant('2026-11-12', '14:00').toISOString().replace('.000Z', '+00:00');
    const ends = parisToInstant('2026-11-12', '15:00').toISOString().replace('.000Z', '+00:00');
    const w = buildWeek('2026-11-09', [block({ starts_at: starts, ends_at: ends })], []);
    expect(w[3]!.blocks[0]).toMatchObject({ start: 840, end: 900, date: '2026-11-12' });
    expect(isFree(w[3]!, { start: 870, end: 900 })).toBe(false);
  });
  it('créneau libre ou non', () => {
    const day = buildWeek('2026-11-09', [block({})], [
      { id: 'a', patient_id: 'p', starts_at: '2026-11-09T08:00:00Z', ends_at: '2026-11-09T08:30:00Z', status: 'confirme', label: 'Léa' },
    ])[0]!;
    expect(isFree(day, { start: 540, end: 570 })).toBe(false); // 9 h : rendez-vous
    expect(isFree(day, { start: 540, end: 570 }, 'a')).toBe(true); // on déplace ce même rendez-vous
    expect(isFree(day, { start: 750, end: 780 })).toBe(false); // pause
    expect(isFree(day, { start: 600, end: 630 })).toBe(true);
  });
});

describe('pop-up de blocage (données réelles du formulaire)', () => {
  const raw = { id: '', title: 'Pause', date: '2026-11-12', start: '12:00', end: '13:00', recurrence: 'none', until: '', scope: '', occurrence: '', weekdays: [] };
  it('nouveau blocage : champs cachés vides acceptés', () => expect(blockSchema.safeParse(raw).success).toBe(true));
  it('série modifiée « ce jour seulement »', () => expect(blockSchema.parse({ ...raw, scope: 'jour', occurrence: '2026-11-12' }).scope).toBe('jour'));
  it('certains jours sans jour coché : refusé', () => expect(blockSchema.safeParse({ ...raw, recurrence: 'weekdays' }).success).toBe(false));
  it('fin avant début : refusé', () => expect(blockSchema.safeParse({ ...raw, end: '11:00' }).success).toBe(false));
  it('rendez-vous glissé : id vide accepté', () =>
    expect(appointmentSchema.safeParse({ id: '', patientId: '3f0c7c8e-6f4b-4b8a-9a52-1d2c3b4a5e6f', date: '2026-11-12', time: '09:15', duration: '30' }).success).toBe(true));
});

describe('créneaux réservables par une famille', () => {
  const busy = [
    { starts_at: '2026-11-09T08:00:00Z', ends_at: '2026-11-09T08:30:00Z' }, // lundi 9 h – 9 h 30 (RDV)
    { starts_at: '2026-11-09T11:00:00Z', ends_at: '2026-11-09T12:30:00Z' }, // lundi 12 h – 13 h 30 (pause)
  ];
  const slots = freeSlots('2026-11-09', busy, 30, new Date('2026-11-01T00:00:00Z'));
  it('du lundi au samedi', () => expect(slots.map((d) => d.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']));
  it('7 h – 21 h, par demi-heure', () => {
    expect(slots[1]!.times[0]).toBe('07:00');
    expect(slots[1]!.times.at(-1)).toBe('20:30');
    expect(slots[1]!.times).toHaveLength(28);
  });
  it('les plages occupées sont exclues', () => {
    expect(slots[0]!.times).not.toContain('09:00');
    expect(slots[0]!.times).toContain('09:30');
    expect(slots[0]!.times).not.toContain('12:00');
    expect(slots[0]!.times).not.toContain('13:00');
    expect(slots[0]!.times).toContain('13:30');
  });
  it('rien avant le délai minimum', () => expect(freeSlots('2026-11-09', [], 30, new Date('2026-11-09T19:00:00Z'))[0]!.times).toEqual(['20:00', '20:30']));
  it('séance de 45 min : pas de 15 min', () => expect(freeSlots('2026-11-09', [], 45, new Date(0))[0]!.times.slice(0, 2)).toEqual(['07:00', '07:15']));
});

describe('répartition des éléments qui se chevauchent', () => {
  it('seul : toute la largeur', () => {
    expect(layoutPieces([{ id: 'a', start: 780, end: 840 }]).get('a')).toEqual([{ start: 780, end: 840, col: 0, cols: 1, first: true, last: true }]);
  });
  it('annulé 13 h – 14 h + nouveau RDV 13 h 15 – 13 h 45', () => {
    const m = layoutPieces([
      { id: 'rdv', start: 795, end: 825 },
      { id: 'annule', start: 780, end: 840 },
    ]);
    expect(m.get('rdv')).toEqual([{ start: 795, end: 825, col: 0, cols: 2, first: true, last: true }]);
    expect(m.get('annule')!.map(({ start, end, col, cols }) => [start, end, col, cols])).toEqual([
      [780, 795, 0, 1],
      [795, 825, 1, 2],
      [825, 840, 0, 1],
    ]);
  });
  it('même créneau : côte à côte', () => {
    const m = layoutPieces([
      { id: 'rdv', start: 600, end: 630 },
      { id: 'annule', start: 600, end: 630 },
    ]);
    expect(m.get('rdv')![0]).toMatchObject({ col: 0, cols: 2 });
    expect(m.get('annule')![0]).toMatchObject({ col: 1, cols: 2 });
  });
});
