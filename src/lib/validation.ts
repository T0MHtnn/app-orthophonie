import { z } from 'zod';
import { isAdultAge } from './age';
import { normalizePhone } from './phone';
import { REQUEST_TYPES } from './request-type';
export { slugify } from './slug';
export { ADULT_AGE, isAdultAge } from './age';

/**
 * Toutes les entrées utilisateur passent par ces schémas côté serveur.
 * La base revérifie les mêmes contraintes (double barrière).
 */
const text = (max: number) => z.string().trim().max(max);
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
  addressLine: text(200).optional().default(''),
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

export const waitlistStatusSchema = z.enum(['attente', 'contacte', 'rdv', 'retire']);

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
    ageValue: z.coerce
      .number({ error: 'Âge requis' })
      .int('Nombre entier')
      .min(0, 'Âge invalide')
      .max(120, 'Âge invalide'),
    ageUnit: z.enum(['ans', 'mois'], { error: 'Unité invalide' }),
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
    const adult = isAdultAge(String(v.ageValue), v.ageUnit);
    if (!adult && !v.caregiverLastName) ctx.addIssue({ code: 'custom', path: ['caregiverLastName'], message: 'Requis pour un patient mineur' });
    if (!adult && !v.caregiverFirstName) ctx.addIssue({ code: 'custom', path: ['caregiverFirstName'], message: 'Requis pour un patient mineur' });
    if (v.ageUnit === 'mois' && v.ageValue > 36) ctx.addIssue({ code: 'custom', path: ['ageValue'], message: 'Au-delà de 36 mois, indiquez l’âge en années' });
  })
  .transform((v) => {
    const adult = isAdultAge(String(v.ageValue), v.ageUnit);
    return {
      ...v,
      patientAge: `${v.ageValue} ${v.ageUnit === 'ans' && v.ageValue <= 1 ? 'an' : v.ageUnit}`,
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

export const totpCodeSchema = z.string().trim().regex(/^[0-9]{6}$/, 'Code à 6 chiffres');

/** Premier message d'erreur par champ, pour l'affichage dans le formulaire. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}
