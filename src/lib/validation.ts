import { z } from 'zod';
import { isAdultBirthDate } from './age';
import { normalizePhone } from './phone';
import { REQUEST_TYPES } from './request-type';
export { slugify } from './slug';
export { ADULT_AGE, isAdultAge } from './age';

/**
 * Toutes les entrées utilisateur passent par ces schémas côté serveur.
 * La base revérifie les mêmes contraintes (double barrière).
 */
const text = (max: number) => z.string().trim().max(max);
/** Date du jour (Paris), pour les calculs d'âge. */
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const required = (max: number, message: string) => text(max).min(1, message);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Adresse email invalide').max(254));

/** 12 caractères minimum, comme recommandé par la CNIL pour un mot de passe seul. */
export const passwordSchema = z
  .string()
  .min(12, 'Le mot de passe doit faire au moins 12 caractères')
  .max(128, 'Le mot de passe est trop long')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), 'Utilisez des minuscules, des majuscules et des chiffres');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis').max(128),
});

/** Prénom + nom du titulaire du compte (inscription et « Mon compte »). */
export const profileNameSchema = z.object({
  firstName: required(80, 'Votre prénom est requis'),
  lastName: required(80, 'Votre nom est requis'),
});

export const signupSchema = profileNameSchema.extend({
  email: emailSchema,
  password: passwordSchema,
  accountType: z.enum(['ortho', 'patient']),
});

/** Le RPPS a 11 chiffres dont le dernier est une clé de Luhn. */
export function isValidRpps(value: string): boolean {
  if (!/^[0-9]{11}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let d = Number(value[10 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Adresse du cabinet (annuaire « Trouver un orthophoniste »). */
const practiceAddress = {
  addressLine: required(200, 'Adresse du cabinet requise'),
  postalCode: z.string().trim().regex(/^[0-9]{5}$/, 'Code postal à 5 chiffres'),
  city: required(100, 'Ville requise'),
};

export const practiceSchema = z.object({
  ...practiceAddress,
  name: z.string().trim().min(2, 'Nom du cabinet trop court').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lettres minuscules, chiffres et tirets uniquement')
    .min(3, 'Adresse trop courte')
    .max(60),
  rpps: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ''))
    .refine(isValidRpps, 'Numéro RPPS invalide (11 chiffres)'),
});

export const waitlistStatusSchema = z.enum(['attente', 'contacte', 'rdv', 'termine', 'retire']);

/** Facultatif : vide accepté, sinon normalisé (voir lib/phone.ts). */
const phoneSchema = z
  .string()
  .trim()
  .max(30, 'Numéro de téléphone invalide')
  .transform((v, ctx) => {
    if (!v) return '';
    const phone = normalizePhone(v);
    if (phone) return phone;
    ctx.addIssue({ code: 'custom', message: 'Numéro invalide : 10 chiffres (06 12 34 56 78) ou format international (+32…)' });
    return z.NEVER;
  });

export const waitlistFormSchema = z
  .object({
    patientLastName: required(80, 'Nom du patient requis'),
    patientFirstName: required(80, 'Prénom du patient requis'),
    birthDate: z
      .string({ error: 'Date de naissance requise' })
      .min(1, 'Date de naissance requise')
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')
      .refine((v) => v >= '1900-01-01', 'Date invalide')
      .refine((v) => v <= today(), 'La date ne peut pas être dans le futur'),
    caregiverLastName: text(80).optional().default(''),
    caregiverFirstName: text(80).optional().default(''),
    email: z.union([z.literal(''), emailSchema]).optional().default(''),
    phone: phoneSchema.optional().default(''),
    requestType: z.enum(REQUEST_TYPES.map((t) => t.code), { error: 'Choisissez le type de demande' }),
    pathology: z.string({ error: 'Choisissez un motif' }).regex(/^[a-z0-9-]{2,40}$/, 'Choisissez un motif'),
    notes: text(2000).optional().default(''),
    acknowledged: z.literal('on', { error: 'Merci de confirmer avoir lu les informations' }),
    consent: z.literal('on', { error: 'Merci d’accepter le traitement de vos données' }),
    // Champ piège invisible : un humain le laisse vide.
    website: z.string().max(200).optional().default(''),
  })
  .superRefine((v, ctx) => {
    const adult = isAdultBirthDate(v.birthDate, today());
    if (!adult && !v.caregiverLastName) ctx.addIssue({ code: 'custom', path: ['caregiverLastName'], message: 'Requis pour un patient mineur' });
    if (!adult && !v.caregiverFirstName) ctx.addIssue({ code: 'custom', path: ['caregiverFirstName'], message: 'Requis pour un patient mineur' });
  })
  .transform((v) => {
    const adult = isAdultBirthDate(v.birthDate, today());
    return {
      ...v,
      // Pour un patient majeur, les champs parent / aidant sont ignorés.
      caregiverLastName: adult ? '' : v.caregiverLastName,
      caregiverFirstName: adult ? '' : v.caregiverFirstName,
    };
  });

export const practiceSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Nom du cabinet trop court').max(120),
  ...practiceAddress,
  listed: z.enum(['on']).optional(),
  waitlistOpen: z.enum(['on']).optional(),
  waitlistInfo: z.string().max(10000, 'Texte trop long (10 000 caractères max.)'),
  emailTemplate: z.string().max(5000, 'Modèle trop long (5 000 caractères max.)'),
});

// ---------------------------------------------------------------------------
// Planning (heures de Paris, converties en instants côté serveur)
// ---------------------------------------------------------------------------
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide');
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide');
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export const appointmentSchema = z
  .object({
    id: z.union([z.literal(''), z.uuid()]).optional().default(''),
    patientId: z.uuid({ error: 'Choisissez un patient' }),
    date: dateField,
    time: timeField,
    // Soit une heure de fin (pop-up), soit une durée (glisser-déposer).
    end: z.union([z.literal(''), timeField]).optional().default(''),
    duration: z.union([z.literal(''), z.coerce.number()]).optional().default(''),
    title: text(120).optional().default(''),
    notify: z.enum(['on']).optional(),
  })
  .transform((v) => ({ ...v, minutes: v.end ? minutes(v.end) - minutes(v.time) : Number(v.duration || 30) }))
  .refine((v) => v.minutes >= 10, { path: ['end'], message: 'Durée minimale : 10 min' })
  .refine((v) => v.minutes <= 240, { path: ['end'], message: 'Durée maximale : 4 h' });

/** Blocage posé sur l'agenda (pause, congés…), éventuellement répété. */
export const blockSchema = z
  .object({
    id: z.union([z.literal(''), z.uuid()]).optional().default(''),
    title: text(120).optional().default(''),
    date: dateField,
    start: timeField,
    end: timeField,
    recurrence: z.enum(['none', 'daily', 'weekly', 'biweekly', 'triweekly', 'monthly', 'weekdays'], { error: 'Répétition invalide' }),
    weekdays: z.array(z.coerce.number().int().min(1).max(7)).max(7).default([]),
    until: z.union([z.literal(''), dateField]).optional().default(''),
    // Modification d'un blocage répété : toute la série, ou ce jour seulement.
    scope: z
      .union([z.literal(''), z.enum(['serie', 'jour'])])
      .optional()
      .transform((v) => v || 'serie'),
    occurrence: z.union([z.literal(''), dateField]).optional().default(''),
  })
  .refine((v) => minutes(v.end) > minutes(v.start), { path: ['end'], message: 'L’heure de fin doit être après le début' })
  .refine((v) => v.recurrence !== 'weekdays' || v.weekdays.length > 0, { path: ['weekdays'], message: 'Choisissez au moins un jour' })
  .refine((v) => !v.until || v.until >= v.date, { path: ['until'], message: 'La fin de la répétition doit être après la date' });

export const bookingSettingsSchema = z.object({
  mode: z.enum(['ortho', 'autonomes', 'tous'], { error: 'Choix invalide' }),
  minNoticeHours: z.coerce.number({ error: 'Délai invalide' }).int('Nombre entier').min(0, 'Délai invalide').max(720, '30 jours maximum'),
});

/** Fiche patient modifiée par l'ortho (l'email reste celui du compte, non modifiable ici). */
const optionalDate = (min: string, tooEarly: string) =>
  z
    .union([z.literal(''), dateField])
    .optional()
    .default('')
    .refine((v) => !v || v >= min, tooEarly)
    .refine((v) => !v || v <= new Date().toISOString().slice(0, 10), 'La date ne peut pas être dans le futur');

export const patientFileSchema = z.object({
  firstName: required(80, 'Prénom requis'),
  lastName: required(80, 'Nom requis'),
  birthDate: optionalDate('1900-01-01', 'Date invalide'),
  caregiverFirstName: text(80).optional().default(''),
  caregiverLastName: text(80).optional().default(''),
  phone: phoneSchema.optional().default(''),
  pathology: z.union([z.literal(''), z.string().regex(/^[a-z0-9-]{2,40}$/, 'Motif invalide')]).optional().default(''),
  requestType: z.union([z.literal(''), z.enum(REQUEST_TYPES.map((t) => t.code))]).optional().default(''),
  prescriberName: text(120).optional().default(''),
  prescriptionDate: optionalDate('2000-01-01', 'Date invalide'),
  amoAct: z.union([z.literal(''), z.string().regex(/^[a-z0-9-]{2,40}$/, 'Acte invalide')]).optional().default(''),
  sessionsPrescribed: z
    .union([z.literal(''), z.coerce.number({ error: 'Nombre invalide' }).int('Nombre entier').min(1, 'Au moins 1 séance').max(200, '200 séances maximum')])
    .optional()
    .default(''),
});

export const caregiverSchema = z.object({
  firstName: required(80, 'Prénom requis'),
  lastName: required(80, 'Nom requis'),
  relation: text(60).optional().default(''),
  phone: phoneSchema.optional().default(''),
  email: z.union([z.literal(''), emailSchema]).optional().default(''),
});

export const homeworkSchema = z.object({
  title: required(120, 'Titre requis'),
  instructions: text(5000).optional().default(''),
  documentId: z.union([z.literal(''), z.uuid()]).optional().default(''),
  dueDate: z.union([z.literal(''), dateField]).optional().default(''),
});

export const sessionNoteSchema = z.object({
  body: required(10000, 'La note est vide').max(10000, 'Note trop longue (10 000 caractères max.)'),
  appointmentId: z.union([z.literal(''), z.uuid()]).optional().default(''),
});

export const totpCodeSchema =z.string().trim().regex(/^[0-9]{6}$/, 'Code à 6 chiffres');

/** Premier message d'erreur par champ, pour l'affichage dans le formulaire. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}
