'use client';

import { useEffect, useRef, useState } from 'react';
import { Field } from '@/components/form';
import { useT } from '@/components/i18n-provider';

interface Suggestion {
  label: string;
  street: string;
  postalCode: string;
  city: string;
}

interface Props {
  initial?: { addressLine?: string; postalCode?: string; city?: string };
  errors?: Record<string, string | undefined>;
}

/**
 * Adresse du cabinet avec saisie automatique (Base Adresse Nationale, via /api/adresse) :
 * choisir une suggestion remplit le code postal et la ville, qui restent modifiables.
 */
export function AddressFields({ initial, errors }: Props) {
  const t = useT();
  const [street, setStreet] = useState(initial?.addressLine ?? '');
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);

  // Recherche 250 ms après la dernière frappe ; une réponse en retard est ignorée.
  useEffect(() => {
    if (query.length < 3) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/adresse?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((list: Suggestion[]) => {
          setItems(list);
          setActive(-1);
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [query]);

  const pick = (s: Suggestion) => {
    setStreet(s.street);
    setPostalCode(s.postalCode);
    setCity(s.city);
    setItems([]);
    setQuery('');
    // Prévient le formulaire (ex. mention « modifications non enregistrées » des Réglages).
    requestAnimationFrame(() => box.current?.closest('form')?.dispatchEvent(new Event('input', { bubbles: true })));
  };

  return (
    <>
      <div
        ref={box}
        className="address-box"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setItems([]);
        }}
      >
        <Field
          label="Adresse du cabinet"
          name="addressLine"
          autoComplete="off"
          required
          maxLength={200}
          placeholder="Ex. : 12 rue de la Paix"
          value={street}
          error={errors?.addressLine}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls="address-suggestions"
          aria-autocomplete="list"
          onChange={(e) => {
            setStreet(e.target.value);
            setQuery(`${e.target.value} ${city}`.trim());
          }}
          onKeyDown={(e) => {
            if (!items.length) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % items.length : (a - 1 + items.length) % items.length));
            } else if (e.key === 'Enter' && active >= 0) {
              e.preventDefault();
              pick(items[active]!);
            } else if (e.key === 'Escape') {
              setItems([]);
            }
          }}
        />
        {items.length > 0 && (
          <ul className="address-suggestions" id="address-suggestions" role="listbox">
            {items.map((s, i) => (
              <li key={s.label} role="option" aria-selected={i === active}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="form-grid">
        <Field
          label="Code postal"
          name="postalCode"
          inputMode="numeric"
          autoComplete="postal-code"
          required
          maxLength={5}
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          error={errors?.postalCode}
        />
        <Field label="Ville" name="city" autoComplete="address-level2" required maxLength={100} value={city} onChange={(e) => setCity(e.target.value)} error={errors?.city} />
      </div>
      <p className="hint">{t('Choisissez une adresse proposée : le code postal et la ville se remplissent seuls (vous pouvez les corriger).')}</p>
    </>
  );
}
