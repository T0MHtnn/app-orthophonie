import 'server-only';

/**
 * Adresses françaises via la Géoplateforme de l'IGN (Base Adresse Nationale) :
 * gratuite, sans clé, interrogée par le serveur (l'IP du visiteur n'est pas transmise).
 */
const API = 'https://data.geopf.fr/geocodage/search';

export const ADDRESS_NOT_FOUND = 'Adresse introuvable : choisissez une adresse proposée ou vérifiez le code postal et la ville.';

export interface AddressSuggestion {
  label: string;
  street: string;
  postalCode: string;
  city: string;
}

interface Feature {
  properties: { label: string; name: string; postcode: string; city: string; type: string; score: number };
}

async function search(q: string, autocomplete: boolean): Promise<Feature[] | null> {
  const url = `${API}?${new URLSearchParams({ q, index: 'address', limit: '5', autocomplete: autocomplete ? '1' : '0' })}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Feature[] };
    return data.features ?? [];
  } catch {
    return null;
  }
}

/** Suggestions pendant la saisie (numéros et rues seulement). */
export async function suggestAddresses(q: string): Promise<AddressSuggestion[]> {
  const features = (await search(q, true)) ?? [];
  return features
    .filter((f) => f.properties.type === 'housenumber' || f.properties.type === 'street')
    .map((f) => ({ label: f.properties.label, street: f.properties.name, postalCode: f.properties.postcode, city: f.properties.city }));
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * L'adresse existe-t-elle ? Il faut une rue connue dans la ville OU au code postal saisi :
 * l'ortho peut corriger un code postal ou une ville mal proposés sans être bloqué.
 * Service injoignable → on accepte (on ne bloque pas l'ortho pour une panne extérieure).
 */
export async function addressExists(street: string, postalCode: string, city: string): Promise<boolean> {
  const features = await search(`${street} ${postalCode} ${city}`, false);
  if (features === null) return true;
  // Le score seul ne suffit pas (une rue inventée obtient ~0,55) : les mots de la rue saisie
  // doivent se retrouver dans celle trouvée.
  const words = norm(street)
    .split(' ')
    .filter((w) => w.length >= 3);
  return features.some((f) => {
    const found = new Set(norm(f.properties.name).split(' '));
    const shared = words.filter((w) => found.has(w)).length;
    return (
      (f.properties.type === 'housenumber' || f.properties.type === 'street') &&
      f.properties.score >= 0.5 &&
      shared >= Math.ceil(words.length * 0.6) &&
      (f.properties.postcode === postalCode || norm(f.properties.city) === norm(city))
    );
  });
}
