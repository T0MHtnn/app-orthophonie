'use client';

import { useEffect } from 'react';

/**
 * Les messages « c'est fait » (?ok=…, ?erreur=…) ne doivent s'afficher qu'une fois :
 * on retire ces paramètres de l'adresse dès l'affichage, pour qu'un rechargement de
 * la page (même deux jours après) ne les remontre pas.
 */
export function ClearFlash() {
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of ['ok', 'erreur']) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(window.history.state, '', url.pathname + (url.search ? url.search : '') + url.hash);
  }, []);
  return null;
}
