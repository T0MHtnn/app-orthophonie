/** Texte comparable pour la recherche : minuscules, sans accents ni espaces superflus. */
export const normalizeSearch = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Vrai si chaque mot recherché apparaît dans l'un des champs (« léa dupont » ou « dupont lea »). */
export function matchesSearch(query: string, fields: (string | null)[]): boolean {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(fields.filter(Boolean).join(' '));
  return words.every((w) => haystack.includes(w));
}
