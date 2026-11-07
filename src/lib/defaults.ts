/** Textes proposés par défaut tant que l'ortho n'a pas écrit les siens (Réglages). */

export const DEFAULT_WAITLIST_INFO = `Avant votre inscription sur la liste d'attente
Quelques informations importantes concernant votre prise en charge orthophonique :

## Prescription médicale
L'orthophonie est une profession de santé réglementée. La réalisation d'un bilan orthophonique nécessite donc une prescription médicale, délivrée par un médecin généraliste ou spécialiste.
Votre ordonnance doit impérativement comporter la mention suivante : « Bilan orthophonique et rééducation si nécessaire ».

## Documents à prévoir
Lors de votre premier rendez-vous, pensez à vous munir des documents suivants :
* Votre ordonnance médicale ;
* Votre carte Vitale à jour ;
* Votre carte de mutuelle en cours de validité ;
* Tout document médical utile à votre prise en charge : précédents bilans orthophoniques, comptes rendus ORL, neurologiques, médicaux ou hospitaliers, examens complémentaires, etc.
Ces éléments permettront à votre orthophoniste de mieux connaître votre parcours et d'adapter au mieux son évaluation à vos besoins.

## Tarifs et remboursements
Le cabinet est conventionné avec l'Assurance Maladie et applique les tarifs définis par la convention nationale des orthophonistes, sans dépassement d'honoraires.
Les actes orthophoniques sont pris en charge à 60 % par l'Assurance Maladie. Les 40 % restants sont généralement couverts par votre complémentaire santé (mutuelle), selon les garanties de votre contrat.
Pour les patients bénéficiant d'une prise en charge à 100 % au titre d'une affection de longue durée (ALD), les soins en lien avec cette affection peuvent être intégralement remboursés par l'Assurance Maladie, sous réserve de remplir les conditions de prise en charge.

Merci de prendre connaissance de ces informations avant de procéder à votre inscription sur la liste d'attente.`;

export const DEFAULT_EMAIL_TEMPLATE = `Objet : Une place s'est libérée au cabinet d'orthophonie

Bonjour {aidant},

Une place s'est libérée pour {patient}. Pour convenir du premier rendez-vous, répondez simplement à cet email.
Vous pouvez aussi suivre votre demande depuis votre espace : {lien}

Pour le premier rendez-vous, pensez à apporter :
* l'ordonnance (mention « Bilan orthophonique et rééducation si nécessaire ») ;
* la carte Vitale et la carte de mutuelle ;
* tout document médical utile (bilans précédents, comptes rendus).

Si vous ne souhaitez plus cette prise en charge, merci de me le signaler pour que je propose la place à une autre famille.

{orthophoniste}
{cabinet}`;

export const TEMPLATE_FIELDS = ['{aidant}', '{patient}', '{lien}', '{orthophoniste}', '{cabinet}'] as const;

export const SESSION_IDLE_MINUTES = 30;

// ---------------------------------------------------------------------------
// Versions anglaises des textes par défaut. Elles ne remplacent le texte que s'il
// est vide ou identique au texte français par défaut (jamais un texte écrit par l'ortho).
// ---------------------------------------------------------------------------
export const DEFAULT_WAITLIST_INFO_EN = `Before joining the waiting list
Some important information about speech therapy care:

## Medical prescription
Speech therapy is a regulated health profession. A speech therapy assessment therefore requires a medical prescription from a general practitioner or a specialist.
Your prescription must include the following wording: "Bilan orthophonique et rééducation si nécessaire" (speech therapy assessment and therapy if needed).

## Documents to bring
For your first appointment, please bring:
* Your medical prescription;
* Your up-to-date Carte Vitale;
* Your valid health insurance (mutuelle) card;
* Any medical document useful for your care: previous speech therapy assessments, ENT, neurological, medical or hospital reports, additional tests, etc.
This information helps your speech therapist understand your history and adapt the assessment to your needs.

## Fees and reimbursement
The practice is approved by the French Health Insurance (Assurance Maladie) and applies the fees set by the national agreement for speech therapists, with no extra charges.
Speech therapy is covered at 60% by the Assurance Maladie. The remaining 40% is usually covered by your complementary health insurance (mutuelle), depending on your contract.
Patients with 100% coverage for a long-term condition (ALD) may be fully reimbursed for care related to that condition, subject to eligibility.

Please read this information before joining the waiting list.`;

export const DEFAULT_EMAIL_TEMPLATE_EN = `Subject: A place has become available at the speech therapy practice

Hello {aidant},

A place has become available for {patient}. To arrange the first appointment, simply reply to this email.
You can also follow your request from your space: {lien}

For the first appointment, please bring:
* the prescription (wording "Bilan orthophonique et rééducation si nécessaire");
* the Carte Vitale and the health insurance (mutuelle) card;
* any useful medical document (previous assessments, reports).

If you no longer wish to receive this care, please let me know so that I can offer the place to another family.

{orthophoniste}
{cabinet}`;

const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/** Texte d'information affiché : celui de l'ortho, ou le texte par défaut dans la langue de la page. */
export function waitlistInfoFor(saved: string | null | undefined, lang: 'fr' | 'en'): string {
  if (!saved || sameText(saved, DEFAULT_WAITLIST_INFO) || sameText(saved, DEFAULT_WAITLIST_INFO_EN)) return lang === 'en' ? DEFAULT_WAITLIST_INFO_EN : DEFAULT_WAITLIST_INFO;
  return saved;
}

/** Modèle d'email affiché dans les Réglages (même règle que ci-dessus). */
export function emailTemplateFor(saved: string | null | undefined, lang: 'fr' | 'en'): string {
  if (!saved || sameText(saved, DEFAULT_EMAIL_TEMPLATE) || sameText(saved, DEFAULT_EMAIL_TEMPLATE_EN)) return lang === 'en' ? DEFAULT_EMAIL_TEMPLATE_EN : DEFAULT_EMAIL_TEMPLATE;
  return saved;
}
