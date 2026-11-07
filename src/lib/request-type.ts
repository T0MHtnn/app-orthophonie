/** Types de demande de la liste d'attente (sans dépendance : utilisable côté client). */
export const REQUEST_TYPES = [
  { code: 'bilan', label: 'Bilan seul' },
  { code: 'bilan_reeducation', label: 'Bilan + rééducation si nécessaire' },
  { code: 'reeducation', label: 'Rééducation uniquement', hint: 'j’ai déjà un bilan valide' },
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number]['code'];

export const REQUEST_TYPE_LABEL = Object.fromEntries(REQUEST_TYPES.map((t) => [t.code, t.label])) as Record<RequestType, string>;
