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
